import Link from "next/link";

export function TestGuide() {
  return (
    <Link
      href="/how-to"
      className="btn py-1.5 px-3 text-xs border border-[var(--green-dim)] text-[var(--green)] hover:border-[var(--green)] hover:bg-[rgba(0,232,122,0.08)] transition-colors"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
      </svg>
      <span className="hidden sm:inline">how to</span>
    </Link>
  );
}
