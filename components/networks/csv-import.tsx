"use client";

import { useActionState, useState } from "react";

import { FormError, FormSuccess } from "@/components/auth/auth-frame";
import { SubmitButton } from "@/components/submit-button";
import { importCsvAction, type AccountActionState } from "@/lib/accounts/actions";
import type { NetworkId } from "@/lib/networks/types";

const initial: AccountActionState = {};

interface ImportTarget {
  id: string;
  label: string;
  network: NetworkId;
  networkName: string;
}

export function CsvImport({ accounts }: { accounts: ImportTarget[] }) {
  const [state, action] = useActionState(importCsvAction, initial);
  const [selected, setSelected] = useState(accounts[0]?.id ?? "");

  const target = accounts.find((account) => account.id === selected);

  return (
    <form action={action} className="space-y-4">
      <FormError message={state.error} />
      <FormSuccess message={state.success} />

      {/* Het netwerk volgt uit het gekozen account, zodat ze nooit botsen. */}
      <input type="hidden" name="network" value={target?.network ?? ""} />

      <div>
        <label htmlFor="csv-account" className="mb-1.5 block text-sm font-medium text-ink">
          Bij welk account horen deze regels?
        </label>
        <select
          id="csv-account"
          name="accountId"
          className="field"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          required
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label} ({account.networkName})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="csv-file" className="mb-1.5 block text-sm font-medium text-ink">
          CSV-bestand
        </label>
        <input
          id="csv-file"
          name="file"
          type="file"
          accept=".csv,text/csv,text/plain"
          required
          className="field file:mr-3 file:rounded-[3px] file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-sm file:text-ink"
          aria-describedby="csv-help"
        />
        <p id="csv-help" className="mt-1.5 text-xs text-muted">
          Nodig zijn een datumkolom en een commissiekolom. Herkend worden onder
          andere: datum, transactiedatum, commissie, vergoeding, provisie, omzet,
          status, programma en valuta. Puntkomma en komma als scheidingsteken
          werken beide.
        </p>
      </div>

      <SubmitButton className="btn-accent px-4 py-2.5 text-sm" pendingLabel="Importeren…">
        Importeren
      </SubmitButton>
    </form>
  );
}
