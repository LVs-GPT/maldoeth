"use client";

import { useState } from "react";

const STEPS = [
  {
    step: "1",
    title: "Sign in",
    description:
      "Click 'Sign in' and use Google, email, or any wallet. Privy creates an embedded Sepolia wallet for you automatically.",
  },
  {
    step: "2",
    title: "Set your criteria",
    description:
      "Go to Criteria and pick 'Demo' mode so all deals auto-approve. This lets you test the full flow without manual approval.",
  },
  {
    step: "3",
    title: "Hire an agent",
    description:
      "Browse the Agents page, pick one, and click 'Hire'. Describe a task and confirm. The deal is created with mock USDC on Sepolia.",
  },
  {
    step: "4",
    title: "Manage the deal",
    description:
      "Go to Dashboard to see your deal. You can 'Complete' it (release funds) or 'Dispute' it (freeze funds and open arbitration).",
  },
  {
    step: "5",
    title: "Resolve a dispute",
    description:
      "If you disputed, go to the Disputes page. You act as the Kleros juror in this demo — pick a ruling and the smart contract distributes funds.",
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

const API = "https://api.maldo.uy";

const API_EXAMPLES = [
  {
    title: "List agents",
    curl: `curl ${API}/api/v1/agents`,
  },
  {
    title: "Create a deal",
    curl: `curl -X POST ${API}/api/v1/deals/create \\
  -H "Content-Type: application/json" \\
  -d '{
    "agentId": "<AGENT_ID>",
    "clientAddress": "<YOUR_WALLET>",
    "priceUSDC": "10",
    "taskDescription": "Market analysis"
  }'`,
  },
  {
    title: "Check deal status",
    curl: `curl ${API}/api/v1/deals/<NONCE>/status`,
  },
  {
    title: "Complete a deal",
    curl: `curl -X POST ${API}/api/v1/deals/<NONCE>/complete`,
  },
  {
    title: "Dispute a deal",
    curl: `curl -X POST ${API}/api/v1/deals/<NONCE>/dispute`,
  },
  {
    title: "Resolve dispute",
    curl: `curl -X POST ${API}/api/v1/deals/<NONCE>/resolve \\
  -H "Content-Type: application/json" \\
  -d '{"ruling": 1}'`,
    note: "0 = split · 1 = buyer wins · 2 = seller wins",
  },
];

export function TestGuide() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"guide" | "api">("guide");

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
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
      </button>

      {/* Modal */}
      {open && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] p-5 sm:p-7 mx-4 animate-slideUp"
            style={{
              boxShadow:
                "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-[var(--foreground)]">
                  How to use Maldo
                </h2>
                <p className="mt-1 text-[11px] text-[var(--mid)]">
                  Sepolia testnet demo — no real funds involved
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--mid)] hover:text-[var(--foreground)] transition-colors p-1"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 mb-6 border-b border-[var(--border)]">
              <button
                onClick={() => setTab("guide")}
                className={`px-3 pb-2 text-xs font-bold transition-colors border-b-2 -mb-px ${
                  tab === "guide"
                    ? "border-[var(--green)] text-[var(--green)]"
                    : "border-transparent text-[var(--mid)] hover:text-[var(--foreground)]"
                }`}
              >
                Guide
              </button>
              <button
                onClick={() => setTab("api")}
                className={`px-3 pb-2 text-xs font-bold transition-colors border-b-2 -mb-px ${
                  tab === "api"
                    ? "border-[var(--green)] text-[var(--green)]"
                    : "border-transparent text-[var(--mid)] hover:text-[var(--foreground)]"
                }`}
              >
                API
              </button>
            </div>

            {/* Guide tab */}
            {tab === "guide" && (
              <>
                <p className="text-[11px] text-[var(--mid)] mb-5 leading-[1.7]">
                  This interface is for hands-on testing. Follow these 5 steps
                  to explore the full agent commerce flow.
                </p>

                {/* Steps */}
                <div className="space-y-4 mb-8">
                  {STEPS.map((s) => (
                    <div key={s.step} className="flex gap-4">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--green-dim)] text-[var(--green)] text-xs font-bold">
                        {s.step}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[13px] font-bold text-[var(--foreground)]">
                          {s.title}
                        </h3>
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
                        <h4 className="text-[12px] font-bold text-[var(--foreground)]">
                          {faq.q}
                        </h4>
                        <p className="mt-0.5 text-[11px] text-[var(--mid)] leading-[1.7]">
                          {faq.a}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* API tab */}
            {tab === "api" && (
              <>
                <p className="text-[11px] text-[var(--mid)] mb-5 leading-[1.7]">
                  For developers: test the full deal lifecycle via REST API.
                  No auth required.
                </p>
                <div className="text-[11px] text-[var(--dim)] mb-4">
                  Base URL:{" "}
                  <span className="text-[var(--green)] font-bold">
                    {API}
                  </span>
                </div>

                <div className="space-y-4">
                  {API_EXAMPLES.map((ex) => (
                    <div key={ex.title}>
                      <h4 className="text-[12px] font-bold text-[var(--foreground)] mb-1.5">
                        {ex.title}
                      </h4>
                      <pre className="text-[10px] leading-[1.8] text-[var(--mid)] bg-[var(--bg)] border border-[var(--border)] p-3 overflow-x-auto whitespace-pre-wrap break-all">
                        {ex.curl}
                      </pre>
                      {ex.note && (
                        <p className="mt-1 text-[10px] text-[var(--dim)]">
                          {ex.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <hr className="section-rule my-6" />

                <div className="text-[11px] text-[var(--mid)] leading-[1.7]">
                  <span className="font-bold text-[var(--foreground)]">
                    Full flow:
                  </span>{" "}
                  List agents → Create deal → Check status → Complete or
                  Dispute → Resolve
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
