"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";

const NAV_ITEMS = [
  { href: "/agents", label: "Agents" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/criteria", label: "Criteria" },
  { href: "/disputes", label: "Disputes", accent: true },
];

export function Navbar() {
  const pathname = usePathname();
  const { login, logout } = usePrivy();
  const { address, isConnected } = useWallet();

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] border-b border-[var(--border)] bg-[rgba(8,8,8,0.85)] backdrop-blur-[12px]">
      <div className="mx-auto flex max-w-[980px] items-center justify-between px-6 py-4 sm:px-8">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <Link href="/agents" className="text-sm font-bold tracking-[0.05em] text-[var(--green)] hover:text-[var(--foreground)] transition-colors">
            maldo<span className="font-normal text-[var(--mid)]">.eth</span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const accentColor = (item as any).accent ? "var(--red)" : "var(--green)";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`text-xs tracking-[0.05em] transition-colors ${
                    isActive
                      ? "text-[var(--foreground)]"
                      : (item as any).accent
                        ? "text-[var(--red)] hover:text-[var(--foreground)]"
                        : "text-[var(--mid)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {item.label}
                  {isActive && (
                    <span className="block h-[2px] mt-1" style={{ backgroundColor: accentColor }} />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <span className="tag border-[var(--green-dim)] text-[var(--green)] text-[10px] tracking-[0.1em]">
            <span className="status-dot bg-[var(--green)] status-dot-live mr-1.5" style={{ boxShadow: '0 0 6px var(--green)' }} />
            SEPOLIA
          </span>
          {isConnected ? (
            <button
              onClick={() => logout()}
              className="btn py-1.5 px-4 text-xs border border-[var(--border)] text-[var(--foreground)] hover:border-[var(--green-dim)] hover:text-[var(--green)] transition-colors"
            >
              {address?.slice(0, 6)}&hellip;{address?.slice(-4)}
            </button>
          ) : (
            <button
              onClick={() => login()}
              className="btn btn-primary py-1.5 px-4 text-xs"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
