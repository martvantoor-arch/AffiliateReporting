"use client";

import { useActionState, useState } from "react";

import { FormError, FormSuccess } from "@/components/auth/auth-frame";
import { SubmitButton } from "@/components/submit-button";
import { saveAccountAction, type AccountActionState } from "@/lib/accounts/actions";
import type { NetworkDescriptor } from "@/lib/networks/descriptors";

const initial: AccountActionState = {};

export interface ExistingAccount {
  id: string;
  label: string;
  /** Alleen de niet-geheime instellingen; sleutels komen nooit terug. */
  settings: Record<string, string>;
  /** Welke geheime velden al gevuld zijn, zodat we dat kunnen aangeven. */
  filledSecrets: string[];
}

export function AccountForm({
  descriptor,
  account,
  onDone,
}: {
  descriptor: NetworkDescriptor;
  account?: ExistingAccount;
  onDone?: () => void;
}) {
  const [state, action] = useActionState(saveAccountAction, initial);

  // Sommige velden horen bij een keuze (bijvoorbeeld Daisycon: basic of OAuth2).
  const [choices, setChoices] = useState<Record<string, string>>(() => {
    const start: Record<string, string> = {};
    for (const field of descriptor.fields) {
      if (field.type === "select") {
        start[field.name] =
          account?.settings[field.name] ?? field.options?.[0]?.value ?? "";
      }
    }
    return start;
  });

  const visible = descriptor.fields.filter((field) => {
    if (!field.showWhen) return true;
    return choices[field.showWhen.field] === field.showWhen.value;
  });

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="network" value={descriptor.id} />
      {account ? <input type="hidden" name="accountId" value={account.id} /> : null}

      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      {state.details && Object.keys(state.details).length > 0 ? (
        <dl className="rounded-[3px] border border-rule bg-sunken p-3 text-xs">
          <dt className="font-semibold text-ink">Gevonden id&apos;s</dt>
          {Object.entries(state.details).map(([id, name]) => (
            <dd key={id} className="tnum mt-1 text-ink-2">
              {id} {name ? `— ${name}` : ""}
            </dd>
          ))}
        </dl>
      ) : null}

      <div>
        <label
          htmlFor={`${descriptor.id}-label`}
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          Naam voor dit account
        </label>
        <input
          id={`${descriptor.id}-label`}
          name="label"
          type="text"
          defaultValue={account?.label ?? descriptor.name}
          className="field"
          maxLength={60}
        />
        <p className="mt-1.5 text-xs text-muted">
          Handig als je meerdere accounts bij hetzelfde netwerk hebt.
        </p>
      </div>

      {visible.map((field) => {
        const inputId = `${descriptor.id}-${field.name}`;
        const alreadyFilled = account?.filledSecrets.includes(field.name) ?? false;

        if (field.type === "select") {
          return (
            <div key={field.name}>
              <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
                {field.label}
              </label>
              <select
                id={inputId}
                name={field.name}
                className="field"
                value={choices[field.name] ?? ""}
                onChange={(event) =>
                  setChoices((current) => ({
                    ...current,
                    [field.name]: event.target.value,
                  }))
                }
              >
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {field.help ? (
                <p className="mt-1.5 text-xs text-muted">{field.help}</p>
              ) : null}
            </div>
          );
        }

        return (
          <div key={field.name}>
            <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
              {field.label}
              {field.required ? null : (
                <span className="ml-1.5 text-xs font-normal text-muted">optioneel</span>
              )}
            </label>
            <input
              id={inputId}
              name={field.name}
              type={field.type === "password" ? "password" : "text"}
              autoComplete="off"
              spellCheck={false}
              defaultValue={field.secret ? "" : (account?.settings[field.name] ?? "")}
              placeholder={
                alreadyFilled ? "•••••••• (laat leeg om te behouden)" : field.placeholder
              }
              className="field"
              aria-describedby={field.help ? `${inputId}-help` : undefined}
            />
            {field.help ? (
              <p id={`${inputId}-help`} className="mt-1.5 text-xs text-muted">
                {field.help}
              </p>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SubmitButton className="btn-accent px-4 py-2.5 text-sm">
          {account ? "Wijzigingen opslaan" : `${descriptor.name} koppelen`}
        </SubmitButton>
        {onDone ? (
          <button type="button" onClick={onDone} className="btn-quiet px-4 py-2.5 text-sm">
            Sluiten
          </button>
        ) : null}
      </div>
    </form>
  );
}
