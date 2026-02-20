// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC8004Reputation} from "./interfaces/IERC8004.sol";

/// @title MaldoRouter
/// @notice Agentic criteria evaluation and x402 payment requirements.
///         Human principals configure trust thresholds once;
///         the router evaluates whether a deal can auto-approve or needs human review.
contract MaldoRouter is Ownable2Step {

    // ═══════════════════════════════════════════════════════════
    // CONSTANTS (immutable trust caps)
    // ═══════════════════════════════════════════════════════════

    uint256 public constant FEE_BPS = 100;              // 1%
    uint256 public constant MAX_FEE_BPS = 500;          // 5% — HARDCODED, NEVER changeable
    uint256 public constant HIGH_VALUE_THRESHOLD = 100_000_000; // $100 USDC (6 decimals)

    // Preset values — SINGLE SOURCE OF TRUTH.
    // Backend (criteria.ts) and landing page (index.html) MUST match these values.
    // Aligned across all three layers per audit fix.
    uint256 public constant CONSERVATIVE_REP = 480;        // 4.80 stars
    uint256 public constant CONSERVATIVE_REVIEWS = 5;
    uint256 public constant CONSERVATIVE_PRICE = 100_000;  // $0.10 USDC

    uint256 public constant BALANCED_REP = 400;            // 4.00 stars
    uint256 public constant BALANCED_REVIEWS = 3;
    uint256 public constant BALANCED_PRICE = 1_000_000;    // $1.00 USDC

    uint256 public constant AGGRESSIVE_REP = 300;          // 3.00 stars
    uint256 public constant AGGRESSIVE_REVIEWS = 1;
    uint256 public constant AGGRESSIVE_PRICE = 10_000_000; // $10.00 USDC

    // ═══════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════

    error CriteriaNotSet();
    error InvalidPreset();
    error PriceExceedsMaxFee(); // Sanity: can't set max fee above hardcoded cap

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════

    event CriteriaUpdated(
        address indexed principal,
        uint256 minReputation,
        uint256 minReviewCount,
        uint256 maxPriceUSDC,
        bool requireHumanApproval,
        CriteriaPreset preset
    );

    // ═══════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════

    enum CriteriaPreset { Conservative, Balanced, Aggressive, Custom }

    struct Criteria {
        uint256 minReputation;       // × 100 (e.g. 450 = 4.50 stars)
        uint256 minReviewCount;      // Minimum number of completed reviews
        uint256 maxPriceUSDC;        // Max price in USDC atomic units (6 decimals)
        bool requireHumanApproval;   // If true, ALWAYS require human — override everything
        CriteriaPreset preset;
    }

    // ═══════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════

    IERC8004Reputation public immutable reputationRegistry;
    address public immutable escrow;

    mapping(address => Criteria) public principalCriteria;
    mapping(address => bool) public criteriaSet;

    // ═══════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    error ZeroAddress();

    constructor(address _reputationRegistry, address _escrow) Ownable(msg.sender) {
        if (_reputationRegistry == address(0)) revert ZeroAddress();
        if (_escrow == address(0)) revert ZeroAddress();
        reputationRegistry = IERC8004Reputation(_reputationRegistry);
        escrow = _escrow;
    }

    // ═══════════════════════════════════════════════════════════
    // CRITERIA MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    /// @notice Apply a preset criteria configuration for the caller.
    /// @param _preset The preset to apply (0=Conservative, 1=Balanced, 2=Aggressive).
    function applyPreset(CriteriaPreset _preset) external {
        if (_preset == CriteriaPreset.Custom) revert InvalidPreset(); // Must use setCriteria for Custom

        Criteria storage c = principalCriteria[msg.sender];

        if (_preset == CriteriaPreset.Conservative) {
            c.minReputation = CONSERVATIVE_REP;
            c.minReviewCount = CONSERVATIVE_REVIEWS;
            c.maxPriceUSDC = CONSERVATIVE_PRICE;
        } else if (_preset == CriteriaPreset.Balanced) {
            c.minReputation = BALANCED_REP;
            c.minReviewCount = BALANCED_REVIEWS;
            c.maxPriceUSDC = BALANCED_PRICE;
        } else if (_preset == CriteriaPreset.Aggressive) {
            c.minReputation = AGGRESSIVE_REP;
            c.minReviewCount = AGGRESSIVE_REVIEWS;
            c.maxPriceUSDC = AGGRESSIVE_PRICE;
        }

        c.requireHumanApproval = false;
        c.preset = _preset;
        criteriaSet[msg.sender] = true;

        emit CriteriaUpdated(
            msg.sender,
            c.minReputation,
            c.minReviewCount,
            c.maxPriceUSDC,
            c.requireHumanApproval,
            _preset
        );
    }

    /// @notice Set custom criteria for the caller.
    function setCriteria(
        uint256 _minReputation,
        uint256 _minReviewCount,
        uint256 _maxPriceUSDC,
        bool _requireHumanApproval
    ) external {
        Criteria storage c = principalCriteria[msg.sender];
        c.minReputation = _minReputation;
        c.minReviewCount = _minReviewCount;
        c.maxPriceUSDC = _maxPriceUSDC;
        c.requireHumanApproval = _requireHumanApproval;
        c.preset = CriteriaPreset.Custom;
        criteriaSet[msg.sender] = true;

        emit CriteriaUpdated(
            msg.sender,
            _minReputation,
            _minReviewCount,
            _maxPriceUSDC,
            _requireHumanApproval,
            CriteriaPreset.Custom
        );
    }

    // ═══════════════════════════════════════════════════════════
    // CRITERIA EVALUATION
    // ═══════════════════════════════════════════════════════════

    /// @notice Evaluate whether a deal auto-approves or requires human review.
    /// @dev Reads ERC-8004 reputation on-chain. Returns reasons for any failures.
    /// @param _principal The human principal whose criteria to apply.
    /// @param _agentId The ERC-8004 token ID of the service agent.
    /// @param _priceUSDC The deal price in USDC atomic units.
    /// @return autoApprove True if all criteria pass.
    /// @return failedChecks Human-readable list of failed checks (empty if autoApprove=true).
    function evaluateDeal(address _principal, uint256 _agentId, uint256 _priceUSDC)
        external
        view
        returns (bool autoApprove, string[] memory failedChecks)
    {
        // Default to Conservative if no criteria set
        Criteria memory c = criteriaSet[_principal]
            ? principalCriteria[_principal]
            : _conservativeDefaults();

        // requireHumanApproval is a hard override
        if (c.requireHumanApproval) {
            string[] memory reasons = new string[](1);
            reasons[0] = "HUMAN_APPROVAL_REQUIRED";
            return (false, reasons);
        }

        // Fetch on-chain reputation
        IERC8004Reputation.Summary memory rep = reputationRegistry.getSummary(_agentId);

        // Count failures
        string[] memory tempFailed = new string[](4);
        uint256 failCount = 0;

        if (rep.averageValue < c.minReputation) {
            tempFailed[failCount++] = "INSUFFICIENT_REPUTATION";
        }
        if (rep.feedbackCount < c.minReviewCount) {
            tempFailed[failCount++] = "INSUFFICIENT_REVIEWS";
        }
        if (_priceUSDC > c.maxPriceUSDC) {
            tempFailed[failCount++] = "PRICE_EXCEEDS_LIMIT";
        }
        // High value safeguard — always flag >$100 unless explicit override
        if (_priceUSDC > HIGH_VALUE_THRESHOLD) {
            tempFailed[failCount++] = "HIGH_VALUE_SAFEGUARD";
        }

        if (failCount == 0) {
            return (true, new string[](0));
        }

        // Trim array to actual size
        string[] memory result = new string[](failCount);
        for (uint256 i = 0; i < failCount; i++) {
            result[i] = tempFailed[i];
        }
        return (false, result);
    }

    // ═══════════════════════════════════════════════════════════
    // FEE CALCULATION
    // ═══════════════════════════════════════════════════════════

    /// @notice Calculate the Maldo fee for a given deal amount.
    /// @return fee The fee amount (1% of total).
    /// @return net The amount the server receives.
    function calculateFee(uint256 _totalAmount) external pure returns (uint256 fee, uint256 net) {
        fee = (_totalAmount * FEE_BPS) / 10_000;
        net = _totalAmount - fee;
    }

    // ═══════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════

    /// @notice Get the criteria for a principal (returns Conservative defaults if not set).
    function getCriteria(address _principal) external view returns (Criteria memory) {
        if (!criteriaSet[_principal]) return _conservativeDefaults();
        return principalCriteria[_principal];
    }

    // ═══════════════════════════════════════════════════════════
    // INTERNAL
    // ═══════════════════════════════════════════════════════════

    function _conservativeDefaults() internal pure returns (Criteria memory) {
        return Criteria({
            minReputation: CONSERVATIVE_REP,
            minReviewCount: CONSERVATIVE_REVIEWS,
            maxPriceUSDC: CONSERVATIVE_PRICE,
            requireHumanApproval: false,
            preset: CriteriaPreset.Conservative
        });
    }
}
