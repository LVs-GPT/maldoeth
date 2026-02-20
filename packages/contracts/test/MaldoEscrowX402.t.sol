// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {MaldoEscrowX402} from "../src/MaldoEscrowX402.sol";
import {MockKleros} from "../src/mocks/MockKleros.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Mock USDC for testing
contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    string public symbol = "USDC";
    uint8 public decimals = 6;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "insufficient");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "insufficient");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
}

/// @dev Mock ERC8004 Reputation Registry
contract MockReputation {
    struct Summary { uint256 averageValue; uint256 feedbackCount; }
    mapping(uint256 => Summary) public summaries;

    function postFeedback(uint256 agentId, uint256 value, uint8, string[] calldata, string calldata) external {
        Summary storage s = summaries[agentId];
        // Simple average for testing
        s.averageValue = (s.averageValue * s.feedbackCount + value) / (s.feedbackCount + 1);
        s.feedbackCount++;
    }

    function getSummary(uint256 agentId) external view returns (Summary memory) {
        return summaries[agentId];
    }
}

contract MaldoEscrowX402Test is Test {
    MaldoEscrowX402 public escrow;
    MockKleros public kleros;
    MockUSDC public usdc;
    MockReputation public reputation;

    address public facilitator = makeAddr("facilitator");
    address public feeRecipient = makeAddr("feeRecipient");
    address public client = makeAddr("client");
    address public server = makeAddr("server");
    address public owner = makeAddr("owner");

    uint256 public constant DEAL_AMOUNT = 50_000_000; // $50 USDC
    bytes32 public constant TEST_NONCE = keccak256("test-nonce-1");

    function setUp() public {
        vm.startPrank(owner);

        usdc = new MockUSDC();
        kleros = new MockKleros();
        reputation = new MockReputation();

        escrow = new MaldoEscrowX402(
            address(usdc),
            address(kleros),
            facilitator,
            feeRecipient,
            address(reputation)
        );

        vm.stopPrank();

        // Fund facilitator with USDC and approve escrow to pull (safeTransferFrom pattern)
        usdc.mint(facilitator, DEAL_AMOUNT);
        vm.prank(facilitator);
        usdc.approve(address(escrow), type(uint256).max);
    }

    // ─────────────────────────────────────────────
    // Constructor validation tests
    // ─────────────────────────────────────────────

    function test_constructor_zeroAddress_usdc() public {
        vm.expectRevert(MaldoEscrowX402.ZeroAddress.selector);
        new MaldoEscrowX402(address(0), address(kleros), facilitator, feeRecipient, address(reputation));
    }

    function test_constructor_zeroAddress_arbitrator() public {
        vm.expectRevert(MaldoEscrowX402.ZeroAddress.selector);
        new MaldoEscrowX402(address(usdc), address(0), facilitator, feeRecipient, address(reputation));
    }

    function test_constructor_zeroAddress_facilitator() public {
        vm.expectRevert(MaldoEscrowX402.ZeroAddress.selector);
        new MaldoEscrowX402(address(usdc), address(kleros), address(0), feeRecipient, address(reputation));
    }

    function test_constructor_zeroAddress_feeRecipient() public {
        vm.expectRevert(MaldoEscrowX402.ZeroAddress.selector);
        new MaldoEscrowX402(address(usdc), address(kleros), facilitator, address(0), address(reputation));
    }

    // ─────────────────────────────────────────────
    // receivePayment tests
    // ─────────────────────────────────────────────

    function test_receivePayment_success() public {
        vm.prank(facilitator);
        escrow.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);

        MaldoEscrowX402.Deal memory deal = escrow.getDeal(TEST_NONCE);
        assertEq(deal.client, client);
        assertEq(deal.server, server);
        assertEq(uint256(deal.status), uint256(MaldoEscrowX402.DealStatus.Funded));
        assertEq(deal.fee, (DEAL_AMOUNT * 100) / 10_000); // 1%
        assertEq(deal.amount, DEAL_AMOUNT - deal.fee);
        assertGt(deal.createdAt, 0);
    }

    function test_receivePayment_onlyFacilitator() public {
        vm.expectRevert(MaldoEscrowX402.OnlyFacilitator.selector);
        vm.prank(client);
        escrow.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);
    }

    function test_receivePayment_duplicateNonce() public {
        vm.startPrank(facilitator);
        escrow.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);

        // Fund facilitator again for second attempt
        usdc.mint(facilitator, DEAL_AMOUNT);

        vm.expectRevert(MaldoEscrowX402.DealAlreadySettled.selector);
        escrow.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);
        vm.stopPrank();
    }

    function test_receivePayment_zeroAmount() public {
        vm.expectRevert(MaldoEscrowX402.ZeroAmount.selector);
        vm.prank(facilitator);
        escrow.receivePayment(TEST_NONCE, client, server, 0);
    }

    function test_receivePayment_ghostDealPrevention() public {
        // Create a second escrow where facilitator has NO USDC
        address poorFacilitator = makeAddr("poorFacilitator");
        MaldoEscrowX402 escrow2 = new MaldoEscrowX402(
            address(usdc), address(kleros), poorFacilitator, feeRecipient, address(reputation)
        );

        // poorFacilitator has 0 USDC — safeTransferFrom should revert
        vm.prank(poorFacilitator);
        vm.expectRevert(); // ERC20 transfer will fail
        escrow2.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);
    }

    // ─────────────────────────────────────────────
    // completeDeal tests
    // ─────────────────────────────────────────────

    function test_completeDeal_success() public {
        // Fund deal
        vm.prank(facilitator);
        escrow.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);

        uint256 serverBalanceBefore = usdc.balanceOf(server);
        uint256 feeRecipientBefore = usdc.balanceOf(feeRecipient);

        // Complete deal
        vm.prank(client);
        escrow.completeDeal(TEST_NONCE);

        MaldoEscrowX402.Deal memory deal = escrow.getDeal(TEST_NONCE);
        assertEq(uint256(deal.status), uint256(MaldoEscrowX402.DealStatus.Completed));

        uint256 fee = (DEAL_AMOUNT * 100) / 10_000;
        uint256 net = DEAL_AMOUNT - fee;

        assertEq(usdc.balanceOf(server) - serverBalanceBefore, net);
        assertEq(usdc.balanceOf(feeRecipient) - feeRecipientBefore, fee);
    }

    function test_completeDeal_onlyClient() public {
        vm.prank(facilitator);
        escrow.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);

        vm.expectRevert(MaldoEscrowX402.OnlyClient.selector);
        vm.prank(server); // server tries to complete their own deal
        escrow.completeDeal(TEST_NONCE);
    }

    function test_completeDeal_alreadyCompleted() public {
        vm.prank(facilitator);
        escrow.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);

        vm.prank(client);
        escrow.completeDeal(TEST_NONCE);

        vm.expectRevert(MaldoEscrowX402.DealNotFunded.selector);
        vm.prank(client);
        escrow.completeDeal(TEST_NONCE);
    }

    // ─────────────────────────────────────────────
    // Timeout refund tests
    // ─────────────────────────────────────────────

    function test_refundTimeout_success() public {
        vm.prank(facilitator);
        escrow.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);

        uint256 clientBalanceBefore = usdc.balanceOf(client);

        // Fast-forward past timeout
        vm.warp(block.timestamp + 7 days + 1);

        escrow.refundTimeout(TEST_NONCE); // Callable by anyone

        assertEq(usdc.balanceOf(client) - clientBalanceBefore, DEAL_AMOUNT); // Full refund
        assertEq(uint256(escrow.getDeal(TEST_NONCE).status), uint256(MaldoEscrowX402.DealStatus.Refunded));
    }

    function test_refundTimeout_tooEarly() public {
        vm.prank(facilitator);
        escrow.receivePayment(TEST_NONCE, client, server, DEAL_AMOUNT);

        vm.expectRevert(MaldoEscrowX402.TooEarlyForRefund.selector);
        escrow.refundTimeout(TEST_NONCE);
    }

    // ─────────────────────────────────────────────
    // END-TO-END DISPUTE FLOW TESTS
    // ─────────────────────────────────────────────

    function _createAndFundDeal() internal returns (bytes32 nonce) {
        nonce = TEST_NONCE;
        vm.prank(facilitator);
        escrow.receivePayment(nonce, client, server, DEAL_AMOUNT);
    }

    function test_dispute_buyerWins_fullFlow() public {
        bytes32 nonce = _createAndFundDeal();

        uint256 clientBalanceBefore = usdc.balanceOf(client);
        uint256 arbitrationCost = kleros.ARBITRATION_COST();

        // Step 1: Client opens dispute, pays arbitration fee in ETH
        vm.deal(client, arbitrationCost);
        vm.prank(client);
        escrow.dispute{value: arbitrationCost}(nonce);

        assertEq(uint256(escrow.getDeal(nonce).status), uint256(MaldoEscrowX402.DealStatus.Disputed));

        // Step 2: Both parties submit evidence
        vm.prank(client);
        escrow.submitEvidence(nonce, "ipfs://QmClientEvidence...");

        vm.prank(server);
        escrow.submitEvidence(nonce, "ipfs://QmServerEvidence...");

        // Step 3: MockKleros owner gives ruling (buyer wins = ruling 1)
        uint256 disputeId = escrow.getDeal(nonce).arbitratorDisputeId;
        vm.prank(owner);
        kleros.giveRuling(disputeId, 1); // ← Triggers rule() callback on escrow

        // Step 4: Verify outcome — client got full refund (amount + fee)
        MaldoEscrowX402.Deal memory deal = escrow.getDeal(nonce);
        assertEq(uint256(deal.status), uint256(MaldoEscrowX402.DealStatus.Completed));
        assertEq(usdc.balanceOf(client) - clientBalanceBefore, DEAL_AMOUNT); // Full refund
        assertEq(usdc.balanceOf(server), 0); // Server gets nothing
    }

    function test_dispute_sellerWins_fullFlow() public {
        bytes32 nonce = _createAndFundDeal();

        uint256 serverBalanceBefore = usdc.balanceOf(server);
        uint256 feeRecipientBefore = usdc.balanceOf(feeRecipient);
        uint256 arbitrationCost = kleros.ARBITRATION_COST();

        // Client opens dispute
        vm.deal(client, arbitrationCost);
        vm.prank(client);
        escrow.dispute{value: arbitrationCost}(nonce);

        // MockKleros owner gives ruling (seller wins = ruling 2)
        uint256 disputeId = escrow.getDeal(nonce).arbitratorDisputeId;
        vm.prank(owner);
        kleros.giveRuling(disputeId, 2);

        // Verify: server gets net amount, fee recipient gets fee
        uint256 fee = (DEAL_AMOUNT * 100) / 10_000;
        uint256 net = DEAL_AMOUNT - fee;

        assertEq(usdc.balanceOf(server) - serverBalanceBefore, net);
        assertEq(usdc.balanceOf(feeRecipient) - feeRecipientBefore, fee);
    }

    function test_dispute_split_fullFlow() public {
        bytes32 nonce = _createAndFundDeal();
        uint256 arbitrationCost = kleros.ARBITRATION_COST();

        vm.deal(client, arbitrationCost);
        vm.prank(client);
        escrow.dispute{value: arbitrationCost}(nonce);

        uint256 clientBefore = usdc.balanceOf(client);
        uint256 serverBefore = usdc.balanceOf(server);

        // Ruling 0 = refused/split
        uint256 disputeId = escrow.getDeal(nonce).arbitratorDisputeId;
        vm.prank(owner);
        kleros.giveRuling(disputeId, 0);

        // Both get ~half
        uint256 clientGot = usdc.balanceOf(client) - clientBefore;
        uint256 serverGot = usdc.balanceOf(server) - serverBefore;
        assertEq(clientGot + serverGot, DEAL_AMOUNT); // Total adds up
        assertApproxEqAbs(clientGot, serverGot, 1);   // ~equal split (1 wei tolerance)
    }

    function test_dispute_cannotDisputeCompleted() public {
        bytes32 nonce = _createAndFundDeal();

        vm.prank(client);
        escrow.completeDeal(nonce);

        uint256 arbitrationCost = kleros.ARBITRATION_COST();
        vm.deal(client, arbitrationCost);

        vm.expectRevert(MaldoEscrowX402.DealNotFunded.selector);
        vm.prank(client);
        escrow.dispute{value: arbitrationCost}(nonce);
    }

    function test_dispute_onlyClient() public {
        bytes32 nonce = _createAndFundDeal();
        uint256 arbitrationCost = kleros.ARBITRATION_COST();
        vm.deal(server, arbitrationCost);

        vm.expectRevert(MaldoEscrowX402.OnlyClient.selector);
        vm.prank(server);
        escrow.dispute{value: arbitrationCost}(nonce);
    }

    function test_dispute_insufficientArbitrationFee() public {
        bytes32 nonce = _createAndFundDeal();

        vm.deal(client, 0.0005 ether); // Less than ARBITRATION_COST (0.001 ETH)
        vm.expectRevert(MaldoEscrowX402.ArbitrationFeeTooLow.selector);
        vm.prank(client);
        escrow.dispute{value: 0.0005 ether}(nonce);
    }

    function test_rule_onlyArbitrator() public {
        bytes32 nonce = _createAndFundDeal();
        uint256 arbitrationCost = kleros.ARBITRATION_COST();

        vm.deal(client, arbitrationCost);
        vm.prank(client);
        escrow.dispute{value: arbitrationCost}(nonce);

        uint256 disputeId = escrow.getDeal(nonce).arbitratorDisputeId;

        vm.expectRevert(MaldoEscrowX402.OnlyArbitrator.selector);
        vm.prank(client); // client tries to call rule() directly
        escrow.rule(disputeId, 1);
    }

    // ─────────────────────────────────────────────
    // FUZZ TESTS
    // ─────────────────────────────────────────────

    function testFuzz_receivePayment_feeCalculation(uint256 amount) public {
        vm.assume(amount > 0 && amount <= 1_000_000_000_000); // up to $1M USDC

        usdc.mint(facilitator, amount);

        bytes32 nonce = keccak256(abi.encode(amount));
        vm.prank(facilitator);
        escrow.receivePayment(nonce, client, server, amount);

        MaldoEscrowX402.Deal memory deal = escrow.getDeal(nonce);
        uint256 expectedFee = (amount * 100) / 10_000;

        assertEq(deal.fee, expectedFee);
        assertEq(deal.amount, amount - expectedFee);
        assertEq(deal.fee + deal.amount, amount); // No USDC lost
        // Verify fee never exceeds MAX_FEE_BPS = 5%
        assertLe(deal.fee * 10_000, amount * 500);
    }
}
