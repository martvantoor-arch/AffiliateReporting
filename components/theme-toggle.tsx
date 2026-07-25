"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "kasboek-theme";
const CHANGE_EVENT = "kasboek-theme-change";

/**
 * De waarheid over het thema staat op het document, waar het inline script in
 * de layout hem al voor de eerste paint neerzet. We lezen die stand uit als
 * externe store, zodat React bij hydratatie niet met zichzelf in de knoop komt.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

function getSnapshot(): Theme {
  const stamped = document.documentElement.dataset.theme;
  return stamped === "light" || stamped === "dark" ? stamped : "system";
}

function getServerSnapshot(): Theme {
  return "system";
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const apply = (next: Theme) => {
    if (next === "system") {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem(STORAGE_KEY);
    } else {
      document.documentElement.dataset.theme = next;
      localStorage.setItem(STORAGE_KEY, next);
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  const label =
    theme === "system"
      ? "Thema: systeem"
      : theme === "light"
        ? "Thema: licht"
        : "Thema: donker";

  return (
    <button
      type="button"
      onClick={() => apply(theme === "system" ? "light" : theme === "light" ? "dark" : "system")}
      title={label}
      aria-label={`${label}. Klik om te wisselen.`}
      className="btn-quiet flex size-9 items-center justify-center"
    >
      {theme === "system" ? <SystemIcon /> : theme === "light" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3.05 3.05l1.13 1.13M11.82 11.82l1.13 1.13M12.95 3.05l-1.13 1.13M4.18 11.82l-1.13 1.13"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 9.8A5.8 5.8 0 0 1 6.2 2.5a5.8 5.8 0 1 0 7.3 7.3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="1.75"
        y="2.75"
        width="12.5"
        height="8.5"
        rx="1.25"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M5.5 13.75h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
