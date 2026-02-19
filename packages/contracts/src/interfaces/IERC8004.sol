// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8004Identity
/// @notice Interface for ERC-8004 Agent Identity Registry (IdentityRegistryUpgradeable).
/// @dev Deployed on Sepolia: 0x8004A818BFB912233c491871b3d84c89A494BD9e
/// @dev Extends ERC-721 with agent-specific registration and wallet management.
interface IERC8004Identity {
    /// @dev Register a new agent — mints ERC-721 NFT to msg.sender.
    /// @return agentId The minted NFT token ID.
    function register() external returns (uint256 agentId);

    /// @dev Register with an agent URI (points to agent-card.json metadata).
    /// @param agentURI IPFS or data URI of the agent-card.json.
    /// @return agentId The minted NFT token ID.
    function register(string memory agentURI) external returns (uint256 agentId);

    /// @dev Get the metadata URI for an agent.
    function tokenURI(uint256 tokenId) external view returns (string memory);

    /// @dev Get the owner of an agent NFT.
    function ownerOf(uint256 tokenId) external view returns (address);

    /// @dev Get the verified wallet address for an agent.
    function getAgentWallet(uint256 agentId) external view returns (address);

    /// @dev Update the agent's metadata URI.
    function setAgentURI(uint256 agentId, string calldata newURI) external;

    /// @dev Emitted when a new agent is registered.
    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);

    /// @dev Emitted when an agent's URI is updated.
    event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy);
}

/// @title IERC8004Reputation
/// @notice Interface for ERC-8004 Agent Reputation Registry.
/// @dev Deployed on Sepolia: 0x8004B663056A597Dffe9eCcC1965A193B7388713
interface IERC8004Reputation {
    struct Summary {
        uint256 averageValue; // e.g. 482 = 4.82 stars (2 decimals)
        uint256 feedbackCount;
    }

    /// @dev Post feedback for an agent after a completed or resolved deal.
    /// @param agentId The ERC-8004 token ID of the agent being rated.
    /// @param value The rating value (e.g. 500 = 5.00, using 2 decimals).
    /// @param decimals Number of decimals in value (always 2 for Maldo).
    /// @param tags Context tags e.g. ["deal-completed", "rating-5"].
    /// @param feedbackURI IPFS URI with extended feedback data.
    function postFeedback(
        uint256 agentId,
        uint256 value,
        uint8 decimals,
        string[] calldata tags,
        string calldata feedbackURI
    ) external;

    /// @dev Get the aggregated reputation summary for an agent.
    function getSummary(uint256 agentId) external view returns (Summary memory);
}
