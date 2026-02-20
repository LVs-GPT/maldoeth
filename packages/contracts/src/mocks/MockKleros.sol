// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IArbitratorV2, IArbitrableV2} from "../interfaces/IArbitrableV2.sol";

/// @title MockKleros
/// @notice Simulates Kleros arbitration for the Maldo PoC on Sepolia.
/// @dev Implements IArbitratorV2. The owner (Maldo deployer) manually resolves disputes
///      by calling giveRuling(), which triggers the full IArbitrableV2 callback on MaldoEscrowX402.
///      This enables complete end-to-end dispute testing without real Kleros jurors.
///      IN MAINNET: replace this address with the real Kleros arbitrator on target chain.
///      Ruling values: 0 = refused/split, 1 = buyer wins (reimburse), 2 = seller wins (pay)
contract MockKleros is IArbitratorV2 {
    // ═══════════════════════════════════════════════════════════
    // ERRORS
    // ═══════════════════════════════════════════════════════════

    error OnlyOwner();
    error DisputeDoesNotExist();
    error DisputeAlreadyResolved();
    error RulingOutOfBounds();
    error InsufficientFee();
    error WithdrawFailed();

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════

    event DisputeCreated(uint256 indexed disputeID, IArbitrableV2 indexed arbitrable, uint256 choices);
    event EvidenceSubmitted(uint256 indexed disputeID, address indexed submitter, string evidenceURI);
    event RulingGiven(uint256 indexed disputeID, uint256 ruling);

    // ═══════════════════════════════════════════════════════════
    // TYPES
    // ═══════════════════════════════════════════════════════════

    enum DisputeStatus { Waiting, Resolved }

    struct Dispute {
        IArbitrableV2 arbitrable;   // The contract that opened this dispute (MaldoEscrowX402)
        uint256 choices;            // Number of ruling options (always 2 for Maldo)
        DisputeStatus status;
        uint256 ruling;             // 0 until resolved
    }

    // ═══════════════════════════════════════════════════════════
    // STORAGE
    // ═══════════════════════════════════════════════════════════

    address public immutable owner;
    uint256 public constant ARBITRATION_COST = 0.001 ether; // Small fee for realism
    uint256 public disputeCount;
    mapping(uint256 => Dispute) public disputes;

    // ═══════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    constructor() {
        owner = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════
    // MODIFIERS
    // ═══════════════════════════════════════════════════════════

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    // ═══════════════════════════════════════════════════════════
    // IArbitratorV2 IMPLEMENTATION
    // ═══════════════════════════════════════════════════════════

    /// @inheritdoc IArbitratorV2
    /// @dev Called by MaldoEscrowX402.dispute() to open a dispute.
    ///      msg.value must be >= ARBITRATION_COST.
    function createDispute(uint256 _numberOfChoices, bytes calldata /*_extraData*/)
        external
        payable
        override
        returns (uint256 disputeID)
    {
        if (msg.value < ARBITRATION_COST) revert InsufficientFee();

        disputeID = disputeCount++;
        disputes[disputeID] = Dispute({
            arbitrable: IArbitrableV2(msg.sender),
            choices: _numberOfChoices,
            status: DisputeStatus.Waiting,
            ruling: 0
        });

        emit DisputeCreated(disputeID, IArbitrableV2(msg.sender), _numberOfChoices);
    }

    /// @inheritdoc IArbitratorV2
    function arbitrationCost(bytes calldata /*_extraData*/) external pure override returns (uint256) {
        return ARBITRATION_COST;
    }

    // ═══════════════════════════════════════════════════════════
    // EVIDENCE SUBMISSION
    // ═══════════════════════════════════════════════════════════

    /// @notice Submit evidence for a dispute.
    /// @dev Anyone can submit evidence — replicates Kleros evidence standard.
    /// @param _disputeID The dispute to submit evidence for.
    /// @param _evidenceURI IPFS URI with the evidence data.
    function submitEvidence(uint256 _disputeID, string calldata _evidenceURI) external {
        if (_disputeID >= disputeCount) revert DisputeDoesNotExist();
        emit EvidenceSubmitted(_disputeID, msg.sender, _evidenceURI);
    }

    // ═══════════════════════════════════════════════════════════
    // RULING (owner-controlled for PoC)
    // ═══════════════════════════════════════════════════════════

    /// @notice Resolve a dispute by giving a ruling. Owner only (simulates Kleros jurors).
    /// @dev Calls rule() on the arbitrable contract (MaldoEscrowX402), which distributes funds.
    /// @param _disputeID The dispute to resolve.
    /// @param _ruling The ruling to apply:
    ///        0 = refused / split equally
    ///        1 = buyer wins (USDC returned to client)
    ///        2 = seller wins (USDC released to server)
    function giveRuling(uint256 _disputeID, uint256 _ruling) external onlyOwner {
        if (_disputeID >= disputeCount) revert DisputeDoesNotExist();

        Dispute storage dispute = disputes[_disputeID];
        if (dispute.status == DisputeStatus.Resolved) revert DisputeAlreadyResolved();
        if (_ruling > dispute.choices) revert RulingOutOfBounds();

        dispute.ruling = _ruling;
        dispute.status = DisputeStatus.Resolved;

        emit RulingGiven(_disputeID, _ruling);

        // ← THE KEY CALLBACK: Kleros pattern — arbitrator calls rule() on the arbitrable
        dispute.arbitrable.rule(_disputeID, _ruling);
    }

    // ═══════════════════════════════════════════════════════════
    // VIEWS
    // ═══════════════════════════════════════════════════════════

    /// @notice Get dispute details.
    function getDispute(uint256 _disputeID)
        external
        view
        returns (address arbitrable, uint256 choices, DisputeStatus status, uint256 ruling)
    {
        if (_disputeID >= disputeCount) revert DisputeDoesNotExist();
        Dispute storage d = disputes[_disputeID];
        return (address(d.arbitrable), d.choices, d.status, d.ruling);
    }

    /// @notice Withdraw accumulated arbitration fees (ETH paid by disputors).
    function withdraw() external onlyOwner {
        (bool ok,) = owner.call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }
}
