"use client";

import { ReactNode } from "react";

export function LayoutShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-panel)] border-b border-[var(--border)] shrink-0">
        <h1 className="text-sm font-semibold text-[var(--cyan)]">
          OpenFS Incident Response
        </h1>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-[#f851493a] text-[var(--red)]">
          P1
        </span>
        <span className="text-xs text-[var(--text-dim)]">
          Redis OOM on <b className="text-[var(--red)] font-semibold">prod-redis-3</b> — 2025-06-15 09:45 UTC
        </span>
      </div>
      <div className="flex flex-1 min-h-0">{children}</div>
    </div>
  );
}
