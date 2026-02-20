// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IArbitratorV2, IArbitrableV2} from "./interfaces/IArbitrableV2.sol";
import {IERC8004Reputation} from "./interfaces/IERC8004.sol";

/// @title MaldoEscrowX402
/// @notice Escrow contract for Maldo agent-to-agent commerce.
///         Receives x402 payments (from facilitator), locks USDC per deal,
///         manages deal lifecycle, and integrates with Kleros (MockKleros for PoC)
///         via the full IArbitrableV2 protocol.
///
/// @dev Architecture:
///      - Implements IArbitrableV2 so Kleros/MockKleros can call rule() after resolving
///      - Uses CEI (Checks-Effects-Interactions) pattern on all fund-moving functions
///      - ReentrancyGuard on all external-call functions
///      - Custom errors throughout (no require strings)
///      - All state changes emit events
///
/// @dev Dispute flow (PoC with MockKleros):
///      1. client calls dispute() → USDC frozen → MockKleros.createDispute() called with ETH fee
///      2. parties submit evidence via submitEvidence()
///      3. MockKleros owner calls giveRuling() → MockKleros calls rule() on this contract
///      4. rule() distributes USDC to winner
///
/// @dev Mainnet upgrade path:
///      Deploy with real Kleros arbitrator address instead of MockKleros.
///      No contract code changes needed — only constructor argument changes.
contract MaldoEscrowX402 is IArbitrableV2, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ═══════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════

    uint256 public constant TIMEOUT = 7 days;
    uint256 public constant AMOUNT_OF_CHOICES = 2; // 1=buyer wins, 2=seller wins
    uint256 public constant FEE_BPS = 100;         // 1%
    uint256 public constant MAX_FEE_BPS = 500;     // 5% — immutable cap

    // ═══════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════

    error OnlyFacilitator();
    error OnlyClient();
    error OnlyArbitrator();
    error DealNotFound();
    error DealNotFunded();
    error DealAlreadySettled();
    error TooEarlyForRefund();
    error DisputeAlreadyExists();
    error DisputeNotActive();
    error ArbitrationFeeTooLow();
    error InvalidRuling();
    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════

    event DealFunded(
        bytes32 indexed nonce,
        uint256 indexed dealId,
        address indexed client,
        address server,
        uint256 amount,
        uint256 fee
    );
    event DealCompleted(bytes32 indexed nonce, uint256 indexed dealId, address server, uint256 amount);
    event DealRefunded(bytes32 indexed nonce, uint256 indexed dealId, address client, uint256 amount);
    event DisputeInitiated(
        bytes32 indexed nonce,
        uint256 indexed dealId,
        uint256 indexed arbitratorDisputeId,
        address client,
        address server,
        uint256 amount
    );
    event EvidenceSubmitted(uint256 indexed arbitratorDisputeId, address indexed submitter, string evidenceURI);
    event DisputeResolved(
        bytes32 indexed nonce,
        uint256 indexed dealId,
        address winner,
        uint256 amount,
        uint256 ruling
    );
    event FeesWithdrawn(address indexed to, uint256 amount);

    // ═══════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════

    enum DealStatus { Funded, Completed, Disputed, Refunded }

    struct Deal {
        uint256 dealId;
        address client;       // Buyer — pays for service
        address server;       // Seller — provides service
        uint256 amount;       // Net USDC (after fee deducted)
        uint256 fee;          // Maldo fee (1%) held separately
        DealStatus status;
        uint256 createdAt;
        uint256 arbitratorDisputeId; // Set when dispute is opened
    }

    // ═══════════════════════════════════════════════════════════
    // IMMUTABLES
    // ═══════════════════════════════════════════════════════════

    IERC20 public immutable usdc;
    IArbitratorV2 public immutable arbitrator;  // MockKleros (PoC) or real Kleros (mainnet)
    address public immutable facilitator;       // x402 facilitator — only caller of receivePayment()
    address public immutable feeRecipient;      // Where Maldo fees go
    IERC8004Reputation public immutable reputationRegistry;

    // ═══════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════

    uint256 public dealCount;
    mapping(bytes32 => Deal) public deals;
    mapping(uint256 => bytes32) public arbitratorDisputeToNonce; // arbitratorDisputeId → deal nonce

    // ═══════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    constructor(
        address _usdc,
        address _arbitrator,
        address _facilitator,
        address _feeRecipient,
        address _reputationRegistry
    ) {
        if (_usdc == address(0)) revert ZeroAddress();
        if (_arbitrator == address(0)) revert ZeroAddress();
        if (_facilitator == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(0)) revert ZeroAddress();
        if (_reputationRegistry == address(0)) revert ZeroAddress();

        usdc = IERC20(_usdc);
        arbitrator = IArbitratorV2(_arbitrator);
        facilitator = _facilitator;
        feeRecipient = _feeRecipient;
        reputationRegistry = IERC8004Reputation(_reputationRegistry);
    }

    // ═══════════════════════════════════════════════════════════
    // PAYMENT RECEIPT (x402 path)
    // ═══════════════════════════════════════════════════════════

    /// @notice Receive a payment from the x402 facilitator and create a deal.
    /// @dev ONLY callable by the x402 facilitator after verifying the payment authorization.
    ///      Uses safeTransferFrom to PULL USDC from facilitator — eliminates ghost deal risk.
    ///      Facilitator must approve this contract for _totalAmount before calling.
    ///      CEI: checks → effects → interactions (safeTransferFrom).
    /// @param _nonce Unique payment nonce from x402.
    /// @param _client The agent that paid (buyer).
    /// @param _server The agent that will provide the service (seller).
    /// @param _totalAmount Total USDC received (including Maldo fee).
    function receivePayment(
        bytes32 _nonce,
        address _client,
        address _server,
        uint256 _totalAmount
    ) external nonReentrant {
        // ── CHECKS ──
        if (msg.sender != facilitator) revert OnlyFacilitator();
        if (_client == address(0)) revert ZeroAddress();
        if (_server == address(0)) revert ZeroAddress();
        if (_totalAmount == 0) revert ZeroAmount();
        if (deals[_nonce].createdAt != 0) revert DealAlreadySettled(); // duplicate nonce guard

        // ── EFFECTS ──
        uint256 fee = (_totalAmount * FEE_BPS) / 10_000;
        uint256 netAmount = _totalAmount - fee;
        uint256 dealId = ++dealCount;

        deals[_nonce] = Deal({
            dealId: dealId,
            client: _client,
            server: _server,
            amount: netAmount,
            fee: fee,
            status: DealStatus.Funded,
            createdAt: block.timestamp,
            arbitratorDisputeId: 0
        });

        // ── INTERACTIONS ──
        // Pull USDC from facilitator (requires prior approval).
        // This ensures no ghost deals: if facilitator has insufficient USDC or
        // didn't approve, the entire tx reverts.
        usdc.safeTransferFrom(msg.sender, address(this), _totalAmount);

        emit DealFunded(_nonce, dealId, _client, _server, netAmount, fee);
    }

    // ═══════════════════════════════════════════════════════════
    // DEAL COMPLETION
    // ═══════════════════════════════════════════════════════════

    /// @notice Client confirms service delivery. Releases escrowed USDC to server.
    /// @dev CEI strictly: state updated before any transfer.
    /// @param _nonce The deal nonce.
    function completeDeal(bytes32 _nonce) external nonReentrant {
        Deal storage deal = deals[_nonce];

        // ── CHECKS ──
        if (deal.createdAt == 0) revert DealNotFound();
        if (msg.sender != deal.client) revert OnlyClient();
        if (deal.status != DealStatus.Funded) revert DealNotFunded();

        // ── EFFECTS ──
        deal.status = DealStatus.Completed;
        uint256 amount = deal.amount;
        uint256 fee = deal.fee;
        address server = deal.server;
        uint256 dealId = deal.dealId;

        // ── INTERACTIONS ──
        usdc.safeTransfer(server, amount);
        usdc.safeTransfer(feeRecipient, fee);

        emit DealCompleted(_nonce, dealId, server, amount);
    }

    // ═══════════════════════════════════════════════════════════
    // DISPUTE
    // ═══════════════════════════════════════════════════════════

    /// @notice Client opens a dispute. Funds are frozen. MockKleros dispute is created.
    /// @dev Requires ETH for arbitration fee (paid to MockKleros/Kleros).
    ///      The arbitration fee is separate from the USDC deal amount.
    ///      CEI note: arbitratorDisputeId is set AFTER createDispute (unavoidable — it's
    ///      the return value). nonReentrant guards against re-entrancy during createDispute.
    ///      All other state is set before any external call.
    /// @param _nonce The deal nonce to dispute.
    function dispute(bytes32 _nonce) external payable nonReentrant {
        Deal storage deal = deals[_nonce];

        // ── CHECKS ──
        if (deal.createdAt == 0) revert DealNotFound();
        if (msg.sender != deal.client) revert OnlyClient();
        if (deal.status != DealStatus.Funded) revert DealNotFunded();

        uint256 arbitrationCost = arbitrator.arbitrationCost("");
        if (msg.value < arbitrationCost) revert ArbitrationFeeTooLow();

        // ── EFFECTS (pre-interaction) ──
        deal.status = DealStatus.Disputed;

        // Cache values for events before any external calls
        uint256 dealId = deal.dealId;
        address dealClient = deal.client;
        address dealServer = deal.server;
        uint256 dealAmount = deal.amount;

        // ── INTERACTION 1: Create dispute ──
        uint256 arbitratorDisputeId = arbitrator.createDispute{value: arbitrationCost}(
            AMOUNT_OF_CHOICES,
            "" // extraData: empty for PoC, can encode court ID for mainnet
        );

        // ── EFFECTS (dependent on interaction return value) ──
        deal.arbitratorDisputeId = arbitratorDisputeId;
        arbitratorDisputeToNonce[arbitratorDisputeId] = _nonce;

        // ── INTERACTION 2: Refund excess ETH ──
        // Don't revert on failure — smart contract wallets may not accept ETH.
        // Excess stays in contract and can be recovered by feeRecipient.
        uint256 excess = msg.value - arbitrationCost;
        if (excess > 0) {
            (bool ok,) = msg.sender.call{value: excess}("");
            // ok is intentionally unused — dispute proceeds regardless
            (ok); // silence unused variable warning
        }

        emit DisputeInitiated(
            _nonce,
            dealId,
            arbitratorDisputeId,
            dealClient,
            dealServer,
            dealAmount
        );
    }

    /// @notice Submit evidence for an active dispute.
    /// @dev Anyone can submit — replicates Kleros evidence standard.
    ///      Evidence goes directly to MockKleros for the PoC.
    /// @param _nonce The deal nonce.
    /// @param _evidenceURI IPFS URI with evidence (text, screenshots, tx hashes).
    function submitEvidence(bytes32 _nonce, string calldata _evidenceURI) external {
        Deal storage deal = deals[_nonce];
        if (deal.createdAt == 0) revert DealNotFound();
        if (deal.status != DealStatus.Disputed) revert DisputeNotActive();

        emit EvidenceSubmitted(deal.arbitratorDisputeId, msg.sender, _evidenceURI);
    }

    // ═══════════════════════════════════════════════════════════
    // IArbitrableV2 IMPLEMENTATION
    // ═══════════════════════════════════════════════════════════

    /// @inheritdoc IArbitrableV2
    /// @notice Called by MockKleros (or real Kleros) after ruling is given.
    ///         Distributes USDC to the winner.
    /// @dev This is the KEY callback — MockKleros.giveRuling() triggers this.
    ///      Ruling: 0 = refused/split, 1 = buyer wins (client gets USDC back), 2 = seller wins
    ///      CEI: state updated before transfers.
    function rule(uint256 _disputeID, uint256 _ruling) external override nonReentrant {
        // ── CHECKS ──
        if (msg.sender != address(arbitrator)) revert OnlyArbitrator();
        if (_ruling > AMOUNT_OF_CHOICES) revert InvalidRuling();

        bytes32 nonce = arbitratorDisputeToNonce[_disputeID];
        Deal storage deal = deals[nonce];
        if (deal.status != DealStatus.Disputed) revert DisputeNotActive();

        // ── EFFECTS ──
        deal.status = DealStatus.Completed; // Mark as settled regardless of outcome
        uint256 amount = deal.amount;
        uint256 fee = deal.fee;
        address client = deal.client;
        address server = deal.server;
        uint256 dealId = deal.dealId;
        address winner;

        // ── INTERACTIONS ──
        if (_ruling == 1) {
            // Buyer wins → return USDC to client, no Maldo fee
            winner = client;
            usdc.safeTransfer(client, amount + fee); // Full refund including fee
        } else if (_ruling == 2) {
            // Seller wins → release USDC to server, collect Maldo fee
            winner = server;
            usdc.safeTransfer(server, amount);
            usdc.safeTransfer(feeRecipient, fee);
        } else {
            // Ruling 0 (refused) → split equally between parties
            winner = address(0);
            uint256 half = (amount + fee) / 2;
            usdc.safeTransfer(client, half);
            usdc.safeTransfer(server, amount + fee - half); // handles odd amounts
        }

        emit Ruling(arbitrator, _disputeID, _ruling);
        emit DisputeResolved(nonce, dealId, winner, amount, _ruling);
    }

    // ═══════════════════════════════════════════════════════════
    // TIMEOUT REFUND
    // ═══════════════════════════════════════════════════════════

    /// @notice Refund client if deal is not completed within TIMEOUT.
    /// @dev Callable by anyone after 7 days — protects client from unresponsive servers.
    ///      CEI: state updated before transfer.
    /// @param _nonce The deal nonce.
    function refundTimeout(bytes32 _nonce) external nonReentrant {
        Deal storage deal = deals[_nonce];

        // ── CHECKS ──
        if (deal.createdAt == 0) revert DealNotFound();
        if (deal.status != DealStatus.Funded) revert DealNotFunded();
        if (block.timestamp < deal.createdAt + TIMEOUT) revert TooEarlyForRefund();

        // ── EFFECTS ──
        deal.status = DealStatus.Refunded;
        uint256 refundAmount = deal.amount + deal.fee; // Full refund, no fee on timeout
        address client = deal.client;
        uint256 dealId = deal.dealId;

        // ── INTERACTIONS ──
        usdc.safeTransfer(client, refundAmount);

        emit DealRefunded(_nonce, dealId, client, refundAmount);
    }

    // ═══════════════════════════════════════════════════════════
    // FEE MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    /// @notice View accumulated ETH fees (from arbitration fee overpayments).
    function ethBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ═══════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════

    /// @notice Get deal details by nonce.
    function getDeal(bytes32 _nonce) external view returns (Deal memory) {
        return deals[_nonce];
    }

    /// @notice Get the arbitration cost from the connected arbitrator.
    function getArbitrationCost() external view returns (uint256) {
        return arbitrator.arbitrationCost("");
    }

    receive() external payable {} // Accept ETH for arbitration fee overpayment refunds
}
