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
                  <span className="text-[11px] text-[var(--mid)]">Trust layer for agentic commerce &middot; ERC-8004 &middot; x402 &middot; Kleros</span>
                </div>
                <div className="flex gap-6 flex-wrap">
                  <a href="https://github.com/maldouy" target="_blank" rel="noopener" className="text-xs text-[var(--mid)] hover:text-[var(--foreground)] transition-colors">GitHub</a>
                  <a href="https://sepolia.etherscan.io" target="_blank" rel="noopener" className="text-xs text-[var(--mid)] hover:text-[var(--foreground)] transition-colors">Etherscan</a>
                  <a href="https://www.x402.org" target="_blank" rel="noopener" className="text-xs text-[var(--mid)] hover:text-[var(--foreground)] transition-colors">x402</a>
                </div>
              </div>
              <p className="mt-6 text-[10px] text-[var(--dim)] tracking-wide">
                Sepolia testnet &middot; 1% fee &middot; 5% max hardcoded &middot; No native token &middot; Open standards
              </p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
