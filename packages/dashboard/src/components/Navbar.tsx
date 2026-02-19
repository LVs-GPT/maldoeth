"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { useWallet } from "@/hooks/useWallet";
import { TestGuide } from "./TestGuide";

const NAV_ITEMS = [
  { href: "/agents", label: "Discover" },
  { href: "/my-agent", label: "My Agent" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/how-to", label: "How to" },
];

export function Navbar() {
  const pathname = usePathname();
  const { login, logout } = usePrivy();
  const { address, isConnected } = useWallet();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] border-b border-[var(--border)] bg-[rgba(8,8,8,0.85)] backdrop-blur-[12px]">
      <div className="mx-auto flex max-w-[980px] items-center justify-between px-4 py-3 sm:px-8 sm:py-4">
        {/* Logo */}
        <Link
          href="/agents"
          className="text-sm font-bold tracking-[0.05em] text-[var(--green)] hover:text-[var(--foreground)] transition-colors shrink-0"
        >
          maldo<span className="font-normal text-[var(--mid)]">.eth</span>
        </Link>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-6 ml-8">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-xs tracking-[0.05em] transition-colors ${
                  isActive
                    ? "text-[var(--foreground)]"
                    : "text-[var(--mid)] hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="block h-[2px] mt-1 bg-[var(--green)]" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side — desktop */}
        <div className="hidden md:flex items-center gap-3">
          <TestGuide />
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

        {/* Mobile right side: sign-in + guide + SEPOLIA + hamburger */}
        <div className="flex md:hidden items-center gap-2">
          {isConnected ? (
            <button
              onClick={() => logout()}
              className="btn py-1 px-2.5 text-[10px] border border-[var(--border)] text-[var(--foreground)] hover:border-[var(--green-dim)] hover:text-[var(--green)] transition-colors"
            >
              {address?.slice(0, 6)}&hellip;{address?.slice(-4)}
            </button>
          ) : (
            <button
              onClick={() => login()}
              className="btn btn-primary py-1 px-3 text-[10px]"
            >
              Sign in
            </button>
          )}
          <TestGuide />
          <span className="tag border-[var(--green-dim)] text-[var(--green)] text-[9px] tracking-[0.1em]">
            <span className="status-dot bg-[var(--green)] status-dot-live mr-1" style={{ boxShadow: '0 0 6px var(--green)' }} />
            SEPOLIA
          </span>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex items-center justify-center w-8 h-8 text-[var(--mid)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12h18M3 6h18M3 18h18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--bg)] animate-slideDown">
          <div className="px-4 py-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 text-xs tracking-[0.05em] transition-colors ${
                    isActive
                      ? "text-[var(--foreground)] bg-[var(--surface)]"
                      : "text-[var(--mid)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]"
                  }`}
                >
                  {isActive && (
                    <span className="w-1.5 h-1.5 shrink-0 bg-[var(--green)]" />
                  )}
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
