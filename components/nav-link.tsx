"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type IconName = "chart" | "plug" | "user";

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  variant?: "top" | "tab";
  icon?: IconName;
}

export function NavLink({ href, children, variant = "top", icon }: NavLinkProps) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  if (variant === "tab") {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors ${
          active ? "text-ink" : "text-muted"
        }`}
      >
        <span
          aria-hidden="true"
          className={`flex h-6 w-10 items-center justify-center rounded-full transition-colors ${
            active ? "bg-accent text-accent-ink" : ""
          }`}
        >
          <Icon name={icon ?? "chart"} />
        </span>
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative rounded-[3px] px-3 py-2 text-sm font-medium transition-colors ${
        active ? "text-ink" : "text-ink-2 hover:text-ink"
      }`}
    >
      {children}
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-2 -bottom-px h-[2px] bg-accent-edge"
        />
      ) : null}
    </Link>
  );
}

function Icon({ name }: { name: IconName }) {
  if (name === "plug") {
    return (
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M6 1.75v3.5M10 1.75v3.5M4 5.25h8v2.1a4 4 0 0 1-4 4 4 4 0 0 1-4-4v-2.1ZM8 11.35v2.9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.5" r="2.75" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M2.75 14c0-2.9 2.35-4.5 5.25-4.5s5.25 1.6 5.25 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.25 13.75V9.5M6.75 13.75V4M11.25 13.75V7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M1 14.75h14" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
