"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Ververst het dashboard vanzelf. Twee momenten, want een webapp op een
 * telefoon staat het grootste deel van de tijd bevroren op de achtergrond:
 *
 * 1. elke `minutes` minuten zolang het scherm zichtbaar is;
 * 2. zodra je terugkomt in de app, als de cijfers ondertussen oud zijn geworden.
 *
 * `router.refresh()` haalt alleen de servercomponenten opnieuw op; je scrollpositie
 * en geopende tabellen blijven staan.
 */
export function AutoRefresh({ minutes = 30 }: { minutes?: number }) {
  const router = useRouter();

  useEffect(() => {
    const intervalMs = Math.max(1, minutes) * 60 * 1000;
    let last = Date.now();

    const refresh = () => {
      last = Date.now();
      router.refresh();
    };

    const timer = setInterval(() => {
      // Op de achtergrond heeft verversen geen zin: dat kost accu en het
      // resultaat is bij terugkomst toch alweer verouderd.
      if (document.visibilityState === "visible") refresh();
    }, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last >= intervalMs) {
        refresh();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [minutes, router]);

  return null;
}
