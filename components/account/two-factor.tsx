"use client";

import Image from "next/image";
import { useActionState, useState, useTransition } from "react";

import { FormError, FormSuccess } from "@/components/auth/auth-frame";
import { SubmitButton } from "@/components/submit-button";
import {
  disableTotpAction,
  enableTotpAction,
  startTotpSetup,
  type ActionState,
  type TotpEnableState,
  type TotpSetup,
} from "@/lib/auth/actions";

const enableInitial: TotpEnableState = {};
const disableInitial: ActionState = {};

export function TwoFactor({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<TotpSetup | null>(null);
  const [starting, startTransition] = useTransition();
  const [startError, setStartError] = useState<string | null>(null);
  const [enableState, enableAction] = useActionState(enableTotpAction, enableInitial);
  const [disableState, disableAction] = useActionState(disableTotpAction, disableInitial);

  const begin = () => {
    setStartError(null);
    startTransition(async () => {
      try {
        setSetup(await startTotpSetup());
      } catch {
        setStartError("Het instellen kon niet worden gestart. Probeer het opnieuw.");
      }
    });
  };

  // Zodra het aanzetten gelukt is, tonen we de herstelcodes één keer.
  if (enableState.recoveryCodes) {
    return (
      <div className="space-y-4">
        <FormSuccess message={enableState.success} />
        <div className="rounded-[3px] border border-rule bg-sunken p-4">
          <p className="text-sm font-semibold text-ink">Je herstelcodes</p>
          <p className="mt-1 text-xs text-ink-2">
            Bewaar deze codes buiten je telefoon. Elke code werkt één keer en
            brengt je binnen als je je authenticator-app kwijt bent. Je ziet ze
            hierna niet meer.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-1.5">
            {enableState.recoveryCodes.map((code) => (
              <li key={code} className="tnum rounded-[2px] bg-surface px-2 py-1.5 text-sm text-ink">
                {code}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  if (enabled) {
    return (
      <form action={disableAction} className="space-y-3">
        <p className="flex items-center gap-2 text-sm">
          <span aria-hidden="true" style={{ color: "var(--good)" }}>
            ✓
          </span>
          <span className="text-ink">Tweestapsverificatie staat aan.</span>
        </p>
        <FormError message={disableState.error} />
        <FormSuccess message={disableState.success} />
        <div>
          <label htmlFor="totp-off-password" className="mb-1.5 block text-sm text-ink-2">
            Uitzetten? Bevestig met je wachtwoord.
          </label>
          <input
            id="totp-off-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="field max-w-sm"
          />
        </div>
        <SubmitButton className="btn-quiet px-4 py-2.5 text-sm">
          Tweestapsverificatie uitzetten
        </SubmitButton>
      </form>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-2">
          Met tweestapsverificatie is je wachtwoord alleen niet genoeg om binnen
          te komen. Je hebt een authenticator-app nodig, bijvoorbeeld die van je
          wachtwoordmanager.
        </p>
        {startError ? <FormError message={startError} /> : null}
        <button
          type="button"
          onClick={begin}
          disabled={starting}
          aria-busy={starting}
          className="btn-accent px-4 py-2.5 text-sm"
        >
          {starting ? "Bezig…" : "Instellen"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        <li>
          <p className="text-sm text-ink">
            <span className="tnum mr-1.5 text-muted">01</span>
            Scan deze QR-code met je authenticator-app.
          </p>
          <div className="mt-2 inline-block rounded-[3px] border border-rule bg-white p-2">
            <Image
              src={setup.qrDataUrl}
              alt="QR-code voor tweestapsverificatie"
              width={200}
              height={200}
              unoptimized
            />
          </div>
        </li>
        <li>
          <p className="text-sm text-ink">
            <span className="tnum mr-1.5 text-muted">02</span>
            Lukt scannen niet? Voer de code handmatig in.
          </p>
          <code className="tnum mt-2 block max-w-md rounded-[3px] border border-rule bg-sunken px-3 py-2 text-sm break-all text-ink">
            {setup.secret}
          </code>
        </li>
        <li>
          <form action={enableAction}>
            <label htmlFor="totp-code" className="text-sm text-ink">
              <span className="tnum mr-1.5 text-muted">03</span>
              Vul de code van zes cijfers in die je app laat zien.
            </label>
            <div className="mt-2 flex flex-wrap items-start gap-2">
              <input
                id="totp-code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                className="field tnum max-w-[10rem] text-center text-xl tracking-[0.25em]"
                placeholder="000000"
              />
              <SubmitButton className="btn-accent px-4 py-2.5 text-sm">Aanzetten</SubmitButton>
            </div>
            {enableState.error ? (
              <div className="mt-3">
                <FormError message={enableState.error} />
              </div>
            ) : null}
          </form>
        </li>
      </ol>
    </div>
  );
}
