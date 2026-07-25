"use client";

import { useActionState } from "react";

import { FormError } from "@/components/auth/auth-frame";
import { SubmitButton } from "@/components/submit-button";
import { registerAction, type ActionState } from "@/lib/auth/actions";

const initial: ActionState = {};

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, initial);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />

      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
          E-mailadres
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          autoFocus
          className="field"
          placeholder="jij@voorbeeld.nl"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
          Wachtwoord
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="field"
          aria-describedby="password-help"
        />
        <p id="password-help" className="mt-1.5 text-xs text-muted">
          Minimaal 12 tekens. Een wachtwoordmanager met een lange willekeurige
          reeks is hier het veiligst.
        </p>
      </div>

      <div>
        <label htmlFor="passwordConfirm" className="mb-1.5 block text-sm font-medium text-ink">
          Wachtwoord herhalen
        </label>
        <input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          className="field"
        />
      </div>

      <SubmitButton className="btn-accent w-full px-4 py-3">Account aanmaken</SubmitButton>
    </form>
  );
}
