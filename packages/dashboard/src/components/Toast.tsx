"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  type: ToastType;
  message: string;
  txHash?: string;
}

interface ToastCtx {
  toast: (type: ToastType, message: string, txHash?: string) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

let nextId = 0;

export function useToast() {
  return useContext(Ctx);
}

const ETHERSCAN = "https://sepolia.etherscan.io/tx/";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((type: ToastType, message: string, txHash?: string) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, type, message, txHash }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const color = (type: ToastType) =>
    type === "success"
      ? "var(--green)"
      : type === "error"
        ? "var(--red)"
        : "var(--mid)";

  return (
    <Ctx.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 max-w-[360px] w-full pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto border bg-[var(--bg)] p-4 shadow-lg animate-slideUp"
              style={{ borderColor: color(t.type) }}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-bold"
                  style={{ color: color(t.type) }}
                >
                  {t.type === "success" ? "✓" : t.type === "error" ? "✗" : "i"}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs text-[var(--foreground)] leading-relaxed">
                    {t.message}
                  </p>
                  {t.txHash && (
                    <a
                      href={`${ETHERSCAN}${t.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block text-[11px] text-[var(--green)] hover:text-[var(--foreground)] transition-colors truncate"
                    >
                      View on Etherscan &rarr;
                    </a>
                  )}
                </div>

                {/* Dismiss */}
                <button
                  onClick={() => dismiss(t.id)}
                  className="shrink-0 text-[var(--dim)] hover:text-[var(--foreground)] transition-colors text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
