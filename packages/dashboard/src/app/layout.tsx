import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Maldo.eth",
  description: "Trust layer for AI agent-to-agent commerce on Ethereum",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistMono.variable} min-h-screen antialiased`}
      >
        <Providers>
          <div className="grid-bg" />
          <Navbar />
          <main className="relative z-[1] mx-auto max-w-[980px] px-6 py-10 sm:px-8">
            {children}
          </main>
          <footer className="relative z-[1] border-t border-[var(--border)]">
            <div className="mx-auto max-w-[980px] px-6 py-12 sm:px-8">
              <div className="flex items-center justify-between flex-wrap gap-6">
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-bold text-[var(--green)]">maldo.eth</span>
                  <span className="text-[11px] text-[var(--mid)]">
                    Trust layer for agentic commerce &middot;{" "}
                    <a href="https://sepolia.etherscan.io/address/0x8004A818BFB912233c491871b3d84c89A494BD9e" target="_blank" rel="noopener" className="text-[var(--mid)] hover:text-[var(--foreground)] transition-colors underline decoration-[var(--dim)]">ERC-8004</a> &middot;{" "}
                    <a href="https://sepolia.etherscan.io/address/0x050F6703697727BdE54a8A753a18A1E269F58209" target="_blank" rel="noopener" className="text-[var(--mid)] hover:text-[var(--foreground)] transition-colors underline decoration-[var(--dim)]">x402</a> &middot;{" "}
                    <a href="https://sepolia.etherscan.io/address/0x05D54DB4F36dCcf095B0945eB4dDD014bAe17FC2" target="_blank" rel="noopener" className="text-[var(--mid)] hover:text-[var(--foreground)] transition-colors underline decoration-[var(--dim)]">Kleros</a>
                  </span>
                </div>
                <div className="flex gap-6 flex-wrap">
                  <a href="https://github.com/LVs-GPT/maldoeth" target="_blank" rel="noopener" className="text-xs text-[var(--mid)] hover:text-[var(--foreground)] transition-colors">GitHub</a>
                </div>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
