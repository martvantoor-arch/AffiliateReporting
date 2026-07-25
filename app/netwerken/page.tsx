import type { Metadata } from "next";

import { AppShell } from "@/components/app-shell";
import { NetworkManager, type ManagedAccount } from "@/components/networks/network-manager";
import { requireUser } from "@/lib/auth/guard";
import { decryptJson } from "@/lib/crypto";
import { prisma } from "@/lib/db";
import { getNetworkDescriptors } from "@/lib/networks/descriptors";
import { networkName } from "@/lib/networks/meta";
import type { NetworkId } from "@/lib/networks/types";

export const metadata: Metadata = { title: "Netwerken" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ welkom?: string }>;
}

export default async function NetworksPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const { welkom } = await searchParams;

  const rows = await prisma.networkAccount.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { transactions: true } } },
  });

  const accounts: ManagedAccount[] = rows.map((row) => {
    // Alleen wélke geheimen gevuld zijn gaat naar de client, nooit de waarden.
    let filledSecrets: string[] = [];
    try {
      const credentials = decryptJson<Record<string, string>>(row.credentials);
      filledSecrets = Object.entries(credentials)
        .filter(([, value]) => Boolean(value))
        .map(([key]) => key);
    } catch {
      filledSecrets = [];
    }

    return {
      id: row.id,
      network: row.network as NetworkId,
      networkName: networkName(row.network),
      label: row.label,
      enabled: row.enabled,
      settings: JSON.parse(row.settings || "{}") as Record<string, string>,
      filledSecrets,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncMessage: row.lastSyncMessage,
      transactionCount: row._count.transactions,
    };
  });

  return (
    <AppShell email={user.email}>
      <div className="rise">
        <p className="eyebrow">Instellingen</p>
        <h1 className="font-display mt-2 text-3xl leading-tight text-ink sm:text-4xl">
          Netwerken
        </h1>
        <span
          aria-hidden="true"
          className="accent-underline mt-3 block h-[6px] w-24 bg-accent"
        />
        {welkom ? (
          <p className="mt-4 max-w-2xl rounded-[3px] border border-rule bg-surface p-3 text-sm text-ink-2">
            Je account staat. Koppel nu je eerste netwerk — daarna vult het
            overzicht zich met cijfers. Vergeet niet tweestapsverificatie aan te
            zetten op de accountpagina.
          </p>
        ) : (
          <p className="mt-4 max-w-2xl text-sm text-ink-2">
            Beheer hier je koppelingen, test of de sleutels werken en haal je
            cijfers op.
          </p>
        )}
      </div>

      <div className="mt-8">
        <NetworkManager descriptors={getNetworkDescriptors()} accounts={accounts} />
      </div>
    </AppShell>
  );
}
