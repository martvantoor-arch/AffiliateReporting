import Link from "next/link";

import { NavLink } from "@/components/nav-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/lib/auth/actions";

const NAV = [
  { href: "/", label: "Overzicht", icon: "chart" as const },
  { href: "/netwerken", label: "Netwerken", icon: "plug" as const },
  { href: "/account", label: "Account", icon: "user" as const },
];

export function AppShell({
  children,
  email,
}: {
  children: React.ReactNode;
  email: string;
}) {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-rule-strong bg-plane/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="font-display text-lg tracking-tight text-ink">Kasboek</span>
            <span className="eyebrow hidden sm:inline">affiliate</span>
          </Link>

          <nav aria-label="Hoofdmenu" className="ml-4 hidden items-center gap-1 sm:flex">
            {NAV.map((item) => (
              <NavLink key={item.href} href={item.href}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden max-w-[14rem] truncate text-xs text-muted md:inline">
              {email}
            </span>
            <ThemeToggle />
            <form action={logoutAction}>
              <button type="submit" className="btn-quiet px-3 py-2 text-xs">
                Uitloggen
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Ruimte onderaan voor de balk op mobiel. */}
      <main className="mx-auto max-w-6xl px-4 pt-5 pb-24 sm:pb-10">{children}</main>

      <nav
        aria-label="Hoofdmenu"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-rule-strong bg-plane/95 backdrop-blur-md sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex">
          {NAV.map((item) => (
            <li key={item.href} className="flex-1">
              <NavLink href={item.href} variant="tab" icon={item.icon}>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
