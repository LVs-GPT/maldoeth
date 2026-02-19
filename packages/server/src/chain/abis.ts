// Minimal ABIs for interacting with deployed contracts

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
] as const;

export const ERC8004_IDENTITY_ABI = [
  // Registration (3 overloads in the real contract)
  "function register() external returns (uint256 agentId)",
  "function register(string memory agentURI) external returns (uint256 agentId)",
  // Read
  "function tokenURI(uint256 tokenId) external view returns (string memory)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function getAgentWallet(uint256 agentId) external view returns (address)",
  // Update
  "function setAgentURI(uint256 agentId, string calldata newURI) external",
  // Events — Registered is the primary indexing event
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
] as const;

export const ERC8004_REPUTATION_ABI = [
  "function postFeedback(uint256 agentId, uint256 value, uint8 decimals, string[] calldata tags, string calldata feedbackURI) external",
  "function getSummary(uint256 agentId) external view returns (tuple(uint256 averageValue, uint256 feedbackCount))",
] as const;

export const MALDO_ESCROW_ABI = [
  "function receivePayment(bytes32 _nonce, address _client, address _server, uint256 _totalAmount) external",
  "function completeDeal(bytes32 _nonce) external",
  "function dispute(bytes32 _nonce) external payable",
  "function submitEvidence(bytes32 _nonce, string calldata _evidenceURI) external",
  "function refundTimeout(bytes32 _nonce) external",
  "function getDeal(bytes32 _nonce) external view returns (tuple(uint256 dealId, address client, address server, uint256 amount, uint256 fee, uint8 status, uint256 createdAt, uint256 arbitratorDisputeId))",
  "function getArbitrationCost() external view returns (uint256)",
  "function dealCount() external view returns (uint256)",
  "event DealFunded(bytes32 indexed nonce, uint256 indexed dealId, address indexed client, address server, uint256 amount, uint256 fee)",
  "event DealCompleted(bytes32 indexed nonce, uint256 indexed dealId, address server, uint256 amount)",
  "event DealRefunded(bytes32 indexed nonce, uint256 indexed dealId, address client, uint256 amount)",
  "event DisputeInitiated(bytes32 indexed nonce, uint256 indexed dealId, uint256 indexed arbitratorDisputeId, address client, address server, uint256 amount)",
  "event DisputeResolved(bytes32 indexed nonce, uint256 indexed dealId, address winner, uint256 amount, uint256 ruling)",
] as const;

export const MALDO_ROUTER_ABI = [
  "function applyPreset(uint8 _preset) external",
  "function setCriteria(uint256 _minReputation, uint256 _minReviewCount, uint256 _maxPriceUSDC, bool _requireHumanApproval) external",
  "function evaluateDeal(address _principal, uint256 _agentId, uint256 _priceUSDC) external view returns (bool autoApprove, string[] memory failedChecks)",
  "function calculateFee(uint256 _totalAmount) external pure returns (uint256 fee, uint256 net)",
  "function getCriteria(address _principal) external view returns (tuple(uint256 minReputation, uint256 minReviewCount, uint256 maxPriceUSDC, bool requireHumanApproval, uint8 preset))",
  "function criteriaSet(address) external view returns (bool)",
] as const;

export const MOCK_KLEROS_ABI = [
  "function giveRuling(uint256 _disputeID, uint256 _ruling) external",
  "function getDispute(uint256 _disputeID) external view returns (address arbitrable, uint256 choices, uint8 status, uint256 ruling)",
  "function arbitrationCost(bytes calldata) external pure returns (uint256)",
] as const;
