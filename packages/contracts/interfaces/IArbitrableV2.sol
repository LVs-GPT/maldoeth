// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IArbitratorV2
/// @notice Minimal arbitrator interface from Kleros v2.
interface IArbitratorV2 {
    /// @dev Create a dispute. Must be called by the arbitrable contract.
    /// @param _numberOfChoices Number of choices the arbitrator can choose from.
    /// @param _extraData Additional info about the dispute.
    /// @return disputeID The identifier of the dispute created.
    function createDispute(uint256 _numberOfChoices, bytes calldata _extraData)
        external
        payable
        returns (uint256 disputeID);

    /// @dev Compute the cost of arbitration.
    /// @param _extraData Additional info about the dispute.
    /// @return cost The arbitration cost in ETH.
    function arbitrationCost(bytes calldata _extraData) external view returns (uint256 cost);
}

/// @title IArbitrableV2
/// @notice Arbitrable interface. Must be implemented by MaldoEscrowX402.
/// @dev Kleros calls rule() on this contract after resolving a dispute.
interface IArbitrableV2 {
    /// @dev Emitted when a dispute is created.
    event DisputeRequest(
        IArbitratorV2 indexed _arbitrator,
        uint256 indexed _arbitratorDisputeID,
        uint256 _externalDisputeID,
        uint256 _templateId,
        string _templateUri
    );

    /// @dev Emitted when a ruling is given.
    event Ruling(IArbitratorV2 indexed _arbitrator, uint256 indexed _disputeID, uint256 _ruling);

    /// @dev Called by the arbitrator to give a ruling.
    /// @param _disputeID The dispute ID in the arbitrator contract.
    /// @param _ruling The ruling. 0 = refused, 1 = buyer wins, 2 = seller wins.
    function rule(uint256 _disputeID, uint256 _ruling) external;
}
