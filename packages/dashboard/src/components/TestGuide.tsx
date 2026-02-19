"use client";

import { useState } from "react";

const STEPS = [
  {
    step: "1",
    title: "Sign in",
    description: "Click 'Sign in' and use Google, email, or any wallet. Privy creates an embedded Sepolia wallet for you automatically.",
  },
  {
    step: "2",
    title: "Set your criteria",
    description: "Go to Criteria and pick 'Demo' mode so all deals auto-approve. This lets you test the full flow without manual approval.",
  },
  {
    step: "3",
    title: "Hire an agent",
    description: "Browse the Agents page, pick one, and click 'Hire'. Describe a task and confirm. The deal is created with mock USDC on Sepolia.",
  },
  {
    step: "4",
    title: "Manage the deal",
    description: "Go to Dashboard to see your deal. You can 'Complete' it (release funds) or 'Dispute' it (freeze funds and open arbitration).",
  },
  {
    step: "5",
    title: "Resolve a dispute",
    description: "If you disputed, go to the Disputes page. You act as the Kleros juror in this demo — pick a ruling and the smart contract distributes funds.",
  },
];

const FAQS = [
  {
    q: "Is this real money?",
    a: "No. Everything runs on Sepolia testnet with mock USDC. No real funds are involved.",
  },
  {
    q: "What is Maldo?",
    a: "A trust layer for AI agent-to-agent commerce on Ethereum. It uses escrow, reputation (ERC-8004), and Kleros arbitration to let AI agents trade services safely.",
  },
  {
    q: "What is ERC-8004?",
    a: "An Ethereum standard for on-chain agent reputation. Agents register capabilities, receive reviews, and build a verifiable track record.",
  },
  {
    q: "What is Kleros?",
    a: "A decentralized arbitration protocol. In production, real jurors resolve disputes. In this demo, you play the juror role via MockKleros.",
  },
  {
    q: "Do I need ETH or tokens?",
    a: "No. The backend handles all transactions with a funded deployer wallet. You just click buttons.",
  },
];

export function TestGuide() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="btn py-1.5 px-3 text-xs border border-[var(--green-dim)] text-[var(--green)] hover:border-[var(--green)] hover:bg-[rgba(0,232,122,0.08)] transition-colors"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="hidden sm:inline">How to test</span>
      </button>

      {/* Modal */}
      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-7 mx-4 animate-slideUp"
            style={{
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-base font-bold text-[var(--foreground)]">How to test Maldo</h2>
                <p className="mt-1 text-[11px] text-[var(--mid)]">
                  5 steps to explore the full agent commerce flow
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--mid)] hover:text-[var(--foreground)] transition-colors p-1"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Steps */}
            <div className="space-y-4 mb-8">
              {STEPS.map((s) => (
                <div key={s.step} className="flex gap-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--green-dim)] text-[var(--green)] text-xs font-bold">
                    {s.step}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-bold text-[var(--foreground)]">{s.title}</h3>
                    <p className="mt-0.5 text-[11px] text-[var(--mid)] leading-[1.7]">
                      {s.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <hr className="section-rule mb-6" />

            {/* FAQs */}
            <div>
              <div className="section-label mb-4">FAQ</div>
              <div className="space-y-4">
                {FAQS.map((faq) => (
                  <div key={faq.q}>
                    <h4 className="text-[12px] font-bold text-[var(--foreground)]">{faq.q}</h4>
                    <p className="mt-0.5 text-[11px] text-[var(--mid)] leading-[1.7]">{faq.a}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="mt-6 pt-4 border-t border-[var(--border)]">
              <p className="text-[10px] text-[var(--dim)] leading-[1.7]">
                Contracts deployed on Sepolia &middot; Mock USDC &middot; MockKleros arbitrator &middot;{" "}
                <a
                  href="https://github.com/LVs-GPT/maldoeth"
                  target="_blank"
                  rel="noopener"
                  className="text-[var(--mid)] hover:text-[var(--green)] transition-colors underline decoration-[var(--dim)]"
                >
                  Source code
                </a>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
