"use client";

import { useActionState } from "react";

import { FormError } from "@/components/auth/auth-frame";
import { SubmitButton } from "@/components/submit-button";
import { verifyTwoFactorAction, type ActionState } from "@/lib/auth/actions";

const initial: ActionState = {};

export function VerifyForm() {
  const [state, action] = useActionState(verifyTwoFactorAction, initial);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />

      <div>
        <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-ink">
          Code uit je authenticator-app
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          autoFocus
          // Ruim genoeg voor een herstelcode zoals "a1b2c-d3e4f".
          maxLength={11}
          className="field tnum text-center text-2xl tracking-[0.3em]"
          placeholder="000000"
          aria-describedby="code-help"
        />
        <p id="code-help" className="mt-1.5 text-xs text-muted">
          Werkt je app niet? Vul dan een van je herstelcodes in — die zijn
          eenmalig te gebruiken.
        </p>
      </div>

      <SubmitButton className="btn-accent w-full px-4 py-3">Bevestigen</SubmitButton>
    </form>
  );
}
