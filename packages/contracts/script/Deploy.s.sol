// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MaldoEscrowX402} from "../src/MaldoEscrowX402.sol";
import {MaldoRouter} from "../src/MaldoRouter.sol";
import {MockKleros} from "../src/mocks/MockKleros.sol";

/// @title Deploy
/// @notice Deploys MockKleros → MaldoEscrowX402 → MaldoRouter to Sepolia.
///         Run with:
///         forge script script/Deploy.s.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --verify
contract Deploy is Script {
    // Sepolia addresses
    address constant USDC_SEPOLIA = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address constant IDENTITY_REGISTRY = 0x8004A818BFB912233c491871b3d84c89A494BD9e;
    address constant REPUTATION_REGISTRY = 0x8004B663056A597Dffe9eCcC1965A193B7388713;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // x402 facilitator: reads from env, defaults to deployer for PoC testing
        address facilitator = vm.envOr("X402_FACILITATOR", deployer);

        console2.log("Deploying Maldo PoC contracts to Sepolia");
        console2.log("Deployer:", deployer);
        console2.log("Facilitator:", facilitator);
        console2.log("USDC:", USDC_SEPOLIA);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy MockKleros
        MockKleros mockKleros = new MockKleros();
        console2.log("MockKleros deployed:", address(mockKleros));
        console2.log("  Arbitration cost:", mockKleros.ARBITRATION_COST(), "wei");

        // 2. Deploy MaldoEscrowX402
        MaldoEscrowX402 escrow = new MaldoEscrowX402(
            USDC_SEPOLIA,
            address(mockKleros),
            facilitator,     // x402 facilitator (deployer for PoC, Coinbase for prod)
            deployer,        // feeRecipient — deployer wallet for PoC
            REPUTATION_REGISTRY
        );
        console2.log("MaldoEscrowX402 deployed:", address(escrow));

        // 3. Deploy MaldoRouter
        MaldoRouter router = new MaldoRouter(
            REPUTATION_REGISTRY,
            address(escrow)
        );
        console2.log("MaldoRouter deployed:", address(router));

        vm.stopBroadcast();

        // Print summary for .env update
        console2.log("\n=== UPDATE YOUR .env ===");
        console2.log("MOCK_KLEROS_ADDRESS=", address(mockKleros));
        console2.log("MALDO_ESCROW_ADDRESS=", address(escrow));
        console2.log("MALDO_ROUTER_ADDRESS=", address(router));
        console2.log("\n=== UPDATE landing index.html ===");
        console2.log("Replace 'Deploying...' with:");
        console2.log("  MaldoEscrowX402:", address(escrow));
        console2.log("  MaldoRouter:    ", address(router));
        console2.log("  MockKleros:     ", address(mockKleros));
    }
}
