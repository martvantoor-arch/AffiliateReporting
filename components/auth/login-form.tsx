"use client";

import { useActionState } from "react";

import { FormError } from "@/components/auth/auth-frame";
import { SubmitButton } from "@/components/submit-button";
import { loginAction, type ActionState } from "@/lib/auth/actions";

const initial: ActionState = {};

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initial);

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
          autoComplete="current-password"
          required
          className="field"
        />
      </div>

      <SubmitButton className="btn-accent w-full px-4 py-3">Inloggen</SubmitButton>
    </form>
  );
}
