"use client";

import { useState, useTransition } from "react";

import { syncNowAction } from "@/lib/accounts/actions";

/**
 * Haalt bij alle actieve netwerken de recente transacties op. De knop blijft
 * bezig-staan aangeven tot de server klaar is; dat kan bij vijf netwerken een
 * halve minuut duren.
 */
export function SyncButton({
  accountId,
  /** Eén luide knop per pagina; losse rijen krijgen de rustige variant. */
  variant = "accent",
  /** Verder terugkijken dan de standaard 45 dagen. */
  lookbackDays,
  label,
}: {
  accountId?: string;
  variant?: "accent" | "quiet";
  lookbackDays?: number;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      try {
        const formData = new FormData();
        if (accountId) formData.set("accountId", accountId);
        if (lookbackDays) formData.set("lookbackDays", String(lookbackDays));
        await syncNowAction(formData);
      } catch {
        setError("Het ophalen is niet gelukt. Probeer het opnieuw.");
      }
    });
  };

  const quiet = variant === "quiet";

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={run}
        disabled={isPending}
        className={
          quiet
            ? "btn-quiet inline-flex items-center gap-1.5 px-3 py-2 text-xs"
            : "btn-accent inline-flex items-center gap-2 px-4 py-2.5 text-sm"
        }
        aria-busy={isPending}
      >
        <RefreshIcon spinning={isPending} />
        {isPending ? "Bezig…" : (label ?? (quiet ? "Ophalen" : "Cijfers ophalen"))}
      </button>
      {error ? (
        <p className="mt-1.5 text-xs" style={{ color: "var(--critical)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={spinning ? "animate-spin" : undefined}
    >
      <path
        d="M14 8a6 6 0 1 1-1.76-4.24"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d="M14 1.5V4.5H11"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
