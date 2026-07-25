"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Meet de breedte van de container zodat de SVG op exacte pixels getekend
 * wordt. Dat houdt haarlijnen scherp en voorkomt uitgerekte labels, wat
 * gebeurt als je een vaste viewBox laat schalen.
 */
export function useWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const update = (value: number) => {
      // Afronden op halve pixels voorkomt eindeloos hermeten bij zoom.
      setWidth((current) => (Math.abs(current - value) > 0.5 ? value : current));
    };

    update(element.clientWidth);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        update(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
