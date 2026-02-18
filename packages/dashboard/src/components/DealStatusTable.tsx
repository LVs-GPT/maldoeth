"use client";

interface Deal {
  nonce: string;
  deal_id: number;
  client: string;
  server: string;
  amount: number;
  status: string;
  task_description?: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  Funded: "bg-blue-500/20 text-blue-400",
  Completed: "bg-green-500/20 text-green-400",
  Disputed: "bg-red-500/20 text-red-400",
  Refunded: "bg-zinc-500/20 text-zinc-400",
};

export function DealStatusTable({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 p-8 text-center text-zinc-500">
        No deals yet. Hire an agent to get started.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-zinc-400">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Nonce</th>
            <th className="px-4 py-2 text-left font-medium">Server</th>
            <th className="px-4 py-2 text-right font-medium">Amount</th>
            <th className="px-4 py-2 text-center font-medium">Status</th>
            <th className="px-4 py-2 text-left font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {deals.map((deal) => (
            <tr key={deal.nonce} className="hover:bg-zinc-900/50">
              <td className="px-4 py-2 font-mono text-xs text-zinc-300">
                {deal.nonce.slice(0, 10)}...
              </td>
              <td className="px-4 py-2 font-mono text-xs text-zinc-300">
                {deal.server.slice(0, 10)}...
              </td>
              <td className="px-4 py-2 text-right text-zinc-200">
                ${(deal.amount / 1e6).toFixed(2)}
              </td>
              <td className="px-4 py-2 text-center">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${STATUS_COLORS[deal.status] || "bg-zinc-500/20 text-zinc-400"}`}
                >
                  {deal.status}
                </span>
              </td>
              <td className="px-4 py-2 text-xs text-zinc-500">
                {new Date(deal.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
