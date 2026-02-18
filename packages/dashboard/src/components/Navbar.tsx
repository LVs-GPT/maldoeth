"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/criteria", label: "Criteria" },
  { href: "/agents", label: "Agents" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 z-[100] border-b border-[var(--border)] bg-[rgba(8,8,8,0.85)] backdrop-blur-[12px]">
      <div className="mx-auto flex max-w-[980px] items-center justify-between px-6 py-4 sm:px-8">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-sm font-bold tracking-[0.05em] text-[var(--green)] hover:text-[var(--foreground)] transition-colors">
            maldo<span className="font-normal text-[var(--mid)]">.eth</span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
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
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <span className="tag border-[var(--green-dim)] text-[var(--green)] text-[10px] tracking-[0.1em]">
            <span className="status-dot bg-[var(--green)] status-dot-live mr-1.5" style={{ boxShadow: '0 0 6px var(--green)' }} />
            SEPOLIA
          </span>
          <ConnectButton
            accountStatus="address"
            chainStatus="none"
            showBalance={false}
          />
        </div>
      </div>
    </nav>
  );
}
