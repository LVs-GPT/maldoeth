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
    <nav className="border-b border-[var(--border)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 sm:px-8 lg:px-12">
        {/* Logo */}
        <div className="flex items-center gap-10">
          <Link href="/dashboard" className="group flex items-baseline gap-1.5">
            <span className="font-serif text-xl font-semibold tracking-tight text-[var(--text-primary)]">
              Maldo
            </span>
            <span className="font-serif text-xl font-light italic text-maldo-500">
              .eth
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative px-3 py-1 text-[0.8rem] tracking-wide transition-colors ${
                    isActive
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                  }`}
                >
                  <span className="smallcaps">{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-3 right-3 h-px bg-maldo-500" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <span className="tag border-maldo-800 bg-maldo-500/8 text-maldo-400 text-2xs">
            <span className="status-dot bg-maldo-500 status-dot-live mr-1.5" />
            Sepolia
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
