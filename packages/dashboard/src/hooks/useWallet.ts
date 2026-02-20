"use client";

import { useEffect } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

/**
 * Drop-in replacement for wagmi's useAccount().
 * Returns the user's wallet address from Privy (embedded or external).
 * Also persists the wallet address to localStorage for API auth headers.
 */
export function useWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  // Prefer the first connected wallet (embedded or external)
  const wallet = wallets[0];
  const address = wallet?.address as `0x${string}` | undefined;

  // Persist wallet address for API auth headers (F-1 fix)
  useEffect(() => {
    if (address) {
      localStorage.setItem("maldo_wallet_address", address.toLowerCase());
    } else {
      localStorage.removeItem("maldo_wallet_address");
    }
  }, [address]);

  return {
    address,
    isConnected: ready && authenticated && !!address,
    user,
  };
}
