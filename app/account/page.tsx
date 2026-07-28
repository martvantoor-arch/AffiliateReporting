import type { Metadata } from "next";

import { PasswordForm } from "@/components/account/password-form";
import { PushToggle } from "@/components/account/push-toggle";
import { TwoFactor } from "@/components/account/two-factor";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { formatRelative } from "@/lib/format";
import { logoutOtherDevicesAction } from "@/lib/account/actions";
import { pushEnabled } from "@/lib/push/send";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();

  const [sessionCount, syncRuns, transactionCount, pushDevices] = await Promise.all([
    prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
    prisma.syncRun.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    prisma.transaction.count({ where: { account: { userId: user.id } } }),
    prisma.pushSubscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, label: true, createdAt: true, lastOkAt: true },
    }),
  ]);

  return (
    <AppShell email={user.email}>
      <div className="rise">
        <p className="eyebrow">Instellingen</p>
        <h1 className="font-display mt-2 text-3xl leading-tight text-ink sm:text-4xl">
          Account
        </h1>
        <span
          aria-hidden="true"
          className="accent-underline mt-3 block h-[6px] w-24 bg-accent"
        />
        <p className="mt-4 text-sm text-ink-2">
          Ingelogd als <span className="text-ink">{user.email}</span> ·{" "}
          <span className="tnum">{transactionCount}</span> transacties opgeslagen
        </p>
      </div>

      <div className="mt-8 space-y-8">
        <section className="card p-4 sm:p-5" aria-labelledby="tweestaps">
          <p className="eyebrow">01 — Beveiliging</p>
          <h2 id="tweestaps" className="font-display mt-1 mb-4 text-xl text-ink">
            Tweestapsverificatie
          </h2>
          <TwoFactor enabled={user.totpEnabled} />
        </section>

        <section className="card p-4 sm:p-5" aria-labelledby="wachtwoord">
          <p className="eyebrow">02 — Wachtwoord</p>
          <h2 id="wachtwoord" className="font-display mt-1 mb-4 text-xl text-ink">
            Wachtwoord wijzigen
          </h2>
          <PasswordForm />
        </section>

        <section className="card p-4 sm:p-5" aria-labelledby="meldingen">
          <p className="eyebrow">03 — Meldingen</p>
          <h2 id="meldingen" className="font-display mt-1 mb-4 text-xl text-ink">
            Melding bij een nieuwe sale
          </h2>
          <PushToggle configured={pushEnabled()} />

          {pushDevices.length > 0 ? (
            <ul className="mt-4 divide-y divide-rule border-t border-rule">
              {pushDevices.map((device) => (
                <li
                  key={device.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 py-2 text-sm"
                >
                  <span className="text-ink">{device.label ?? "Onbekend apparaat"}</span>
                  <span className="tnum text-xs text-muted">
                    {device.lastOkAt
                      ? `laatste melding ${formatRelative(device.lastOkAt.toISOString())}`
                      : `aangezet ${formatRelative(device.createdAt.toISOString())}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="card p-4 sm:p-5" aria-labelledby="sessies">
          <p className="eyebrow">04 — Apparaten</p>
          <h2 id="sessies" className="font-display mt-1 text-xl text-ink">
            Actieve sessies
          </h2>
          <p className="mt-2 text-sm text-ink-2">
            Er zijn <span className="tnum">{sessionCount}</span> actieve
            sessie(s), dit apparaat meegerekend.
          </p>
          {sessionCount > 1 ? (
            <form action={logoutOtherDevicesAction} className="mt-3">
              <SubmitButton className="btn-quiet px-4 py-2.5 text-sm">
                Andere apparaten uitloggen
              </SubmitButton>
            </form>
          ) : null}
        </section>

        <section className="card p-4 sm:p-5" aria-labelledby="synclog">
          <p className="eyebrow">05 — Logboek</p>
          <h2 id="synclog" className="font-display mt-1 text-xl text-ink">
            Laatste ophaalacties
          </h2>
          {syncRuns.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Nog niets opgehaald.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule">
              {syncRuns.map((run) => (
                <li key={run.id} className="py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      aria-hidden="true"
                      style={{
                        color:
                          run.status === "error"
                            ? "var(--critical)"
                            : run.status === "partial"
                              ? "var(--warning)"
                              : "var(--good)",
                      }}
                    >
                      {run.status === "error" ? "✕" : run.status === "partial" ? "!" : "✓"}
                    </span>
                    <span className="text-ink">{run.network ?? "alle netwerken"}</span>
                    <span className="tnum text-xs text-muted">
                      {formatRelative(run.startedAt.toISOString())} · {run.trigger}
                    </span>
                  </div>
                  {run.message ? (
                    <p className="mt-0.5 text-xs text-ink-2">{run.message}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
