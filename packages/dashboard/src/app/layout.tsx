import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
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
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
        style={{ "--font-serif": "Georgia, 'Cambria', 'Times New Roman', serif" } as React.CSSProperties}
      >
        <Providers>
          <Navbar />
          <main className="mx-auto max-w-5xl px-6 py-10 sm:px-8 lg:px-12">
            {children}
          </main>
          <footer className="mt-20 border-t border-[var(--border)]">
            <div className="mx-auto max-w-5xl px-6 py-6 sm:px-8 lg:px-12">
              <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                <span className="font-serif italic">Maldo.eth</span>
                <span>Trust layer for AI agent commerce &middot; Sepolia</span>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
