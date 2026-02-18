import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { sepolia } from "wagmi/chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Maldo.eth",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "maldo-poc-demo",
  chains: [sepolia],
  ssr: true,
});
