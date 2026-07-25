"use client";

import { useActionState } from "react";

import { FormError, FormSuccess } from "@/components/auth/auth-frame";
import { SubmitButton } from "@/components/submit-button";
import { changePasswordAction, type ActionState } from "@/lib/auth/actions";

const initial: ActionState = {};

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initial);

  return (
    <form action={action} className="max-w-sm space-y-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      <div>
        <label htmlFor="current" className="mb-1.5 block text-sm font-medium text-ink">
          Huidig wachtwoord
        </label>
        <input
          id="current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
          className="field"
        />
      </div>

      <div>
        <label htmlFor="next" className="mb-1.5 block text-sm font-medium text-ink">
          Nieuw wachtwoord
        </label>
        <input
          id="next"
          name="next"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="field"
        />
        <p className="mt-1.5 text-xs text-muted">
          Minimaal 12 tekens. Andere apparaten worden hierna uitgelogd.
        </p>
      </div>

      <div>
        <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-ink">
          Nieuw wachtwoord herhalen
        </label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="field"
        />
      </div>

      <SubmitButton className="btn-accent px-4 py-2.5 text-sm">
        Wachtwoord wijzigen
      </SubmitButton>
    </form>
  );
}
