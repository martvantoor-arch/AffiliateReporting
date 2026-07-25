"use client";

import { useState } from "react";

import { AccountForm, type ExistingAccount } from "@/components/networks/account-form";
import { CsvImport } from "@/components/networks/csv-import";
import { TestButton } from "@/components/networks/test-button";
import { SubmitButton } from "@/components/submit-button";
import { SyncButton } from "@/components/dashboard/sync-button";
import { deleteAccountAction, toggleAccountAction } from "@/lib/accounts/actions";
import { formatRelative } from "@/lib/format";
import { networkColorVar } from "@/lib/networks/meta";
import type { NetworkDescriptor } from "@/lib/networks/descriptors";
import type { NetworkId } from "@/lib/networks/types";

export interface ManagedAccount extends ExistingAccount {
  network: NetworkId;
  networkName: string;
  enabled: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  transactionCount: number;
}

export function NetworkManager({
  descriptors,
  accounts,
}: {
  descriptors: NetworkDescriptor[];
  accounts: ManagedAccount[];
}) {
  const [adding, setAdding] = useState<NetworkId | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <section aria-labelledby="gekoppeld">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">01 — Gekoppeld</p>
            <h2 id="gekoppeld" className="font-display mt-1 text-2xl text-ink">
              Jouw netwerken
            </h2>
          </div>
          {accounts.length > 0 ? <SyncButton /> : null}
        </div>

        {accounts.length === 0 ? (
          <p className="mt-4 text-sm text-ink-2">
            Nog niets gekoppeld. Kies hieronder een netwerk om te beginnen.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {accounts.map((account) => {
              const descriptor = descriptors.find((d) => d.id === account.network);
              const isEditing = editing === account.id;

              return (
                <li key={account.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-3 shrink-0 rounded-[2px]"
                          style={{ backgroundColor: networkColorVar(account.network) }}
                        />
                        <h3 className="truncate font-semibold text-ink">{account.label}</h3>
                        {!account.enabled ? (
                          <span className="rounded-full border border-rule-strong px-2 py-0.5 text-xs text-muted">
                            uitgezet
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {account.networkName} ·{" "}
                        <span className="tnum">{account.transactionCount}</span> transacties
                        opgeslagen · laatst opgehaald{" "}
                        <span className="tnum">{formatRelative(account.lastSyncAt)}</span>
                      </p>
                      {account.lastSyncMessage ? (
                        <p
                          className="mt-2 text-xs"
                          style={{
                            color:
                              account.lastSyncStatus === "error"
                                ? "var(--critical)"
                                : account.lastSyncStatus === "partial"
                                  ? "var(--warning)"
                                  : "var(--ink-2)",
                          }}
                        >
                          {account.lastSyncStatus === "error" ? "✕ " : ""}
                          {account.lastSyncMessage}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <SyncButton accountId={account.id} variant="quiet" />
                      {/* Om vast te stellen of er überhaupt omzet is: kijk een
                          half jaar terug in plaats van de standaard 45 dagen. */}
                      <SyncButton
                        accountId={account.id}
                        variant="quiet"
                        lookbackDays={183}
                        label="6 maanden"
                      />
                      <button
                        type="button"
                        className="btn-quiet px-3 py-2 text-xs"
                        onClick={() => setEditing(isEditing ? null : account.id)}
                        aria-expanded={isEditing}
                      >
                        {isEditing ? "Sluiten" : "Bewerken"}
                      </button>
                      <form action={toggleAccountAction}>
                        <input type="hidden" name="accountId" value={account.id} />
                        <SubmitButton className="btn-quiet px-3 py-2 text-xs">
                          {account.enabled ? "Uitzetten" : "Aanzetten"}
                        </SubmitButton>
                      </form>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-rule pt-3">
                    <TestButton accountId={account.id} />
                  </div>

                  {isEditing && descriptor ? (
                    <div className="mt-4 border-t border-rule pt-4">
                      <AccountForm
                        descriptor={descriptor}
                        account={account}
                        onDone={() => setEditing(null)}
                      />
                      <form
                        action={deleteAccountAction}
                        className="mt-6 border-t border-rule pt-4"
                        onSubmit={(event) => {
                          if (
                            !window.confirm(
                              `"${account.label}" verwijderen? Ook alle opgehaalde transacties van dit account gaan weg.`,
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="accountId" value={account.id} />
                        <SubmitButton className="btn-quiet px-3 py-2 text-xs">
                          Dit account verwijderen
                        </SubmitButton>
                        <p className="mt-1.5 text-xs text-muted">
                          Dit verwijdert ook de <span className="tnum">{account.transactionCount}</span>{" "}
                          opgeslagen transacties van dit account.
                        </p>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="toevoegen" className="ledger-rule pt-6">
        <p className="eyebrow">02 — Toevoegen</p>
        <h2 id="toevoegen" className="font-display mt-1 text-2xl text-ink">
          Netwerk koppelen
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-ink-2">
          Sleutels worden versleuteld opgeslagen en zijn daarna niet meer op te
          vragen — ook niet door jou. Gebruik waar mogelijk een sleutel met
          alleen leesrechten.
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {descriptors.map((descriptor) => {
            const isOpen = adding === descriptor.id;
            const existing = accounts.filter((a) => a.network === descriptor.id).length;

            return (
              <li
                key={descriptor.id}
                className={`card p-4 ${isOpen ? "sm:col-span-2" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-3 shrink-0 rounded-[2px]"
                        style={{ backgroundColor: networkColorVar(descriptor.id) }}
                      />
                      <h3 className="font-semibold text-ink">{descriptor.name}</h3>
                      {existing > 0 ? (
                        <span className="tnum text-xs text-muted">
                          {existing}× gekoppeld
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs text-ink-2">{descriptor.credentialsHelp}</p>
                    <a
                      href={descriptor.docsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-1.5 inline-block text-xs text-ink underline underline-offset-2"
                    >
                      Documentatie van {descriptor.name} ↗
                    </a>
                    {descriptor.maturity === "needs-verification" ? (
                      <p className="mt-2 text-xs" style={{ color: "var(--warning)" }}>
                        <span aria-hidden="true">!</span>{" "}
                        <span className="text-ink-2">
                          Deze koppeling is gebouwd op de gepubliceerde
                          documentatie, maar niet tegen een live account
                          nagelopen. Test de verbinding na het opslaan; als
                          velden niet kloppen, staat het in de melding.
                        </span>
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn-quiet shrink-0 px-3 py-2 text-xs"
                    onClick={() => setAdding(isOpen ? null : descriptor.id)}
                    aria-expanded={isOpen}
                  >
                    {isOpen ? "Sluiten" : existing > 0 ? "Nog een" : "Koppelen"}
                  </button>
                </div>

                {isOpen ? (
                  <div className="mt-4 border-t border-rule pt-4">
                    <AccountForm descriptor={descriptor} onDone={() => setAdding(null)} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {accounts.length > 0 ? (
        <section aria-labelledby="import" className="ledger-rule pt-6">
          <p className="eyebrow">03 — Handmatig</p>
          <h2 id="import" className="font-display mt-1 text-2xl text-ink">
            CSV importeren
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-2">
            Werkt een API niet mee, of wil je oude cijfers inlezen? Exporteer je
            transacties bij het netwerk en upload het bestand hier. Kolomnamen
            worden automatisch herkend; dezelfde regels twee keer importeren
            levert geen dubbele bedragen op.
          </p>
          <div className="card mt-4 p-4">
            <CsvImport accounts={accounts} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
