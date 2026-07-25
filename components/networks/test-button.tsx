"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { testAccountAction, type AccountActionState } from "@/lib/accounts/actions";

const initial: AccountActionState = {};

/** Doet één lichte aanroep bij het netwerk om te zien of de sleutels werken. */
export function TestButton({ accountId }: { accountId: string }) {
  const [state, action] = useActionState(testAccountAction, initial);

  return (
    <div>
      <form action={action} className="inline">
        <input type="hidden" name="accountId" value={accountId} />
        <SubmitButton className="btn-quiet px-3 py-2 text-xs" pendingLabel="Testen…">
          Verbinding testen
        </SubmitButton>
      </form>

      {state.error || state.success ? (
        <p
          role="status"
          className="mt-2 text-xs"
          style={{ color: state.error ? "var(--critical)" : "var(--good)" }}
        >
          <span aria-hidden="true">{state.error ? "✕" : "✓"}</span>{" "}
          <span className="text-ink-2">{state.error ?? state.success}</span>
        </p>
      ) : null}

      {state.details && Object.keys(state.details).length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {Object.entries(state.details).map(([id, name]) => (
            <li key={id} className="tnum text-xs text-muted">
              {id}
              {name ? ` — ${name}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
