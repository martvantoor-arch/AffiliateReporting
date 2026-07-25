import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Kader voor de inlogschermen. Links het merk met een groot cijfer-motief,
 * rechts het formulier — op mobiel netjes onder elkaar.
 */
export function AuthFrame({
  eyebrow,
  title,
  intro,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-display text-lg text-ink">Kasboek</span>
          <span className="eyebrow hidden sm:inline">affiliate</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16 lg:py-16">
        {/* Sfeerkolom: op kleine schermen alleen de kop, geen ruis. */}
        <div className="rise">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="font-display mt-3 text-[clamp(2rem,8vw,3.25rem)] leading-[1.02] text-ink">
            {title}
          </h1>
          <span
            aria-hidden="true"
            className="accent-underline mt-4 block h-[7px] w-32 bg-accent"
          />
          {intro ? <p className="mt-5 max-w-md text-ink-2">{intro}</p> : null}

          <ul className="mt-8 hidden space-y-2.5 lg:block">
            {["Daisycon", "TradeTracker", "TradeDoubler", "bol.com", "Awin"].map(
              (name, index) => (
                <li
                  key={name}
                  className="rise flex items-center gap-3 text-sm text-ink-2"
                  style={{ animationDelay: `${200 + index * 60}ms` }}
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-[2px]"
                    style={{ backgroundColor: `var(--series-${index + 1})` }}
                  />
                  <span className="tnum text-xs text-muted">
                    0{index + 1}
                  </span>
                  {name}
                </li>
              ),
            )}
          </ul>
        </div>

        <div className="rise card p-5 sm:p-7" style={{ animationDelay: "120ms" }}>
          {children}
          {footer ? (
            <div className="mt-6 border-t border-rule pt-4 text-sm text-ink-2">
              {footer}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-[3px] border p-2.5 text-sm"
      style={{ borderColor: "var(--critical)", color: "var(--ink)" }}
    >
      <span aria-hidden="true" className="font-semibold" style={{ color: "var(--critical)" }}>
        ✕
      </span>
      {message}
    </p>
  );
}

export function FormSuccess({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-[3px] border p-2.5 text-sm"
      style={{ borderColor: "var(--good)", color: "var(--ink)" }}
    >
      <span aria-hidden="true" className="font-semibold" style={{ color: "var(--good)" }}>
        ✓
      </span>
      {message}
    </p>
  );
}
