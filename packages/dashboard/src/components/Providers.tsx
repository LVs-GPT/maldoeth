"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { sepolia } from "viem/chains";
import { ToastProvider } from "./Toast";

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#00c968",
          logo: undefined,
        },
        loginMethods: ["google", "email", "wallet"],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        defaultChain: sepolia,
        supportedChains: [sepolia],
      }}
    >
      <ToastProvider>{children}</ToastProvider>
    </PrivyProvider>
  );
}
