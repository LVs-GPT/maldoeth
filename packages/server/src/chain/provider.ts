import { ethers } from "ethers";
import { config } from "../config.js";
import {
  ERC20_ABI,
  ERC8004_IDENTITY_ABI,
  ERC8004_REPUTATION_ABI,
  MALDO_ESCROW_ABI,
  MALDO_ROUTER_ABI,
  MOCK_KLEROS_ABI,
} from "./abis.js";

let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.sepoliaRpcUrl);
  }
  return provider;
}

export function getSigner(): ethers.Wallet {
  if (!signer) {
    if (!config.privateKey) {
      throw new Error("PRIVATE_KEY not set in environment");
    }
    signer = new ethers.Wallet(config.privateKey, getProvider());
  }
  return signer;
}

export function getIdentityRegistry(): ethers.Contract {
  return new ethers.Contract(config.identityRegistry, ERC8004_IDENTITY_ABI, getSigner());
}

export function getReputationRegistry(): ethers.Contract {
  return new ethers.Contract(config.reputationRegistry, ERC8004_REPUTATION_ABI, getSigner());
}

export function getEscrow(): ethers.Contract {
  return new ethers.Contract(config.escrowAddress, MALDO_ESCROW_ABI, getSigner());
}

export function getRouter(): ethers.Contract {
  return new ethers.Contract(config.routerAddress, MALDO_ROUTER_ABI, getSigner());
}

export function getMockKleros(): ethers.Contract {
  return new ethers.Contract(config.mockKlerosAddress, MOCK_KLEROS_ABI, getSigner());
}

export function getUsdc(): ethers.Contract {
  return new ethers.Contract(config.usdcAddress, ERC20_ABI, getSigner());
}
