// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IERC8004Identity
/// @notice Interface for ERC-8004 Agent Identity Registry.
/// @dev Deployed on Sepolia: 0x8004A818BFB912233c491871b3d84c89A494BD9e
interface IERC8004Identity {
    /// @dev Mint a new agent identity NFT.
    /// @param to The operator address that will own the NFT.
    /// @param uri IPFS URI of the agent-card.json metadata.
    /// @return tokenId The minted NFT token ID (agentId).
    function mint(address to, string memory uri) external returns (uint256 tokenId);

    /// @dev Get the metadata URI for an agent.
    function tokenURI(uint256 tokenId) external view returns (string memory);

    /// @dev Get the owner of an agent NFT.
    function ownerOf(uint256 tokenId) external view returns (address);
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
