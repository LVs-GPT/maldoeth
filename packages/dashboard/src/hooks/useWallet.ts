"use client";

import { usePrivy, useWallets } from "@privy-io/react-auth";

/**
 * Drop-in replacement for wagmi's useAccount().
 * Returns the user's wallet address from Privy (embedded or external).
 */
export function useWallet() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  // Prefer the first connected wallet (embedded or external)
  const wallet = wallets[0];
  const address = wallet?.address as `0x${string}` | undefined;

  return {
    address,
    isConnected: ready && authenticated && !!address,
    user,
  };
}
