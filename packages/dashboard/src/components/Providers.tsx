"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import "@rainbow-me/rainbowkit/styles.css";
import { wagmiConfig } from "@/lib/wagmi";

const queryClient = new QueryClient();

const maldoTheme = darkTheme({
  accentColor: "#00c968",
  accentColorForeground: "#000",
  borderRadius: "small",
  fontStack: "system",
});

// Refine the theme for our aesthetic
maldoTheme.colors.modalBackground = "#111111";
maldoTheme.colors.modalBorder = "#1e1e1e";
maldoTheme.colors.profileForeground = "#111111";
maldoTheme.colors.connectButtonBackground = "#111111";
maldoTheme.colors.connectButtonInnerBackground = "#161616";
maldoTheme.fonts.body = "var(--font-geist-sans), system-ui, sans-serif";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={maldoTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
