"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { RANGE_PRESETS, formatRange, type DayRange } from "@/lib/dates";
import { networkColorVar, networkName, type NetworkId } from "@/lib/networks/meta";

interface FilterBarProps {
  preset: string;
  range: DayRange;
  availableNetworks: NetworkId[];
  activeNetworks: NetworkId[];
  onPendingChange: (pending: boolean) => void;
}

/**
 * Eén filterrij boven alles wat hij bestuurt. Elke grafiek op de pagina kijkt
 * naar dezelfde selectie — geen losse filters per kaart.
 */
export function FilterBar({
  preset,
  range,
  availableNetworks,
  activeNetworks,
  onPendingChange,
}: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(preset === "custom");

  const navigate = (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    onPendingChange(true);
    startTransition(() => {
      router.push(params.toString() ? `/?${params}` : "/", { scroll: false });
      onPendingChange(false);
    });
  };

  const choosePreset = (id: string) => {
    navigate((params) => {
      params.set("periode", id);
      params.delete("van");
      params.delete("tot");
    });
    setShowCustom(false);
  };

  const toggleNetwork = (network: NetworkId) => {
    // Alle netwerken actief = geen filter in de URL; dat houdt links kort.
    const next = activeNetworks.includes(network)
      ? activeNetworks.filter((id) => id !== network)
      : [...activeNetworks, network];

    navigate((params) => {
      params.delete("netwerk");
      if (next.length > 0 && next.length < availableNetworks.length) {
        for (const id of next) params.append("netwerk", id);
      }
    });
  };

  const submitCustom = (formData: FormData) => {
    const from = String(formData.get("van") ?? "");
    const to = String(formData.get("tot") ?? "");
    if (!from || !to) return;
    navigate((params) => {
      params.delete("periode");
      params.set("van", from);
      params.set("tot", to);
    });
  };

  return (
    <div
      className={`sticky top-14 z-20 -mx-4 border-b border-rule bg-plane/95 px-4 py-3 backdrop-blur-md ${
        isPending ? "cursor-progress" : ""
      }`}
    >
      <div className="scroll-x flex items-center gap-2">
        {RANGE_PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="chip"
            data-active={preset === option.id}
            aria-pressed={preset === option.id}
            onClick={() => choosePreset(option.id)}
          >
            {option.label}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          data-active={preset === "custom"}
          aria-pressed={preset === "custom"}
          aria-expanded={showCustom}
          onClick={() => setShowCustom((open) => !open)}
        >
          Eigen periode
        </button>
      </div>

      {showCustom ? (
        <form
          action={submitCustom}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-rule pt-3"
        >
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Van
            <input
              type="date"
              name="van"
              defaultValue={range.from}
              max={range.to}
              className="field tnum py-1.5 text-sm"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-2">
            Tot en met
            <input
              type="date"
              name="tot"
              defaultValue={range.to}
              className="field tnum py-1.5 text-sm"
              required
            />
          </label>
          <button type="submit" className="btn-accent px-3.5 py-2 text-sm">
            Toepassen
          </button>
        </form>
      ) : null}

      {availableNetworks.length > 1 ? (
        <div className="scroll-x mt-2 flex items-center gap-2">
          <span className="eyebrow shrink-0 pr-1">Netwerk</span>
          {availableNetworks.map((network) => {
            const active = activeNetworks.includes(network);
            return (
              <button
                key={network}
                type="button"
                className="chip"
                aria-pressed={active}
                onClick={() => toggleNetwork(network)}
              >
                {/* De kleur volgt het netwerk, ook als het uitgezet is. */}
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-[2px]"
                  style={{
                    backgroundColor: networkColorVar(network),
                    opacity: active ? 1 : 0.35,
                  }}
                />
                {networkName(network)}
              </button>
            );
          })}
        </div>
      ) : null}

      <p className="mt-2 text-xs text-muted">
        <span className="tnum">{formatRange(range)}</span>
        {activeNetworks.length === 0 ? " · geen netwerk geselecteerd" : null}
      </p>
    </div>
  );
}
