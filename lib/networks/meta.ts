import { NETWORK_IDS, type NetworkId } from "@/lib/networks/types";

/**
 * Netwerk-metadata zonder server-afhankelijkheden, zodat client-componenten
 * namen en kleuren kunnen gebruiken zonder de adapters mee te bundelen.
 */

export const NETWORK_NAMES: Record<NetworkId, string> = {
  daisycon: "Daisycon",
  tradetracker: "TradeTracker",
  tradedoubler: "TradeDoubler",
  bol: "bol.com",
  awin: "Awin",
};

export function networkName(network: string): string {
  return NETWORK_NAMES[network as NetworkId] ?? network;
}

/**
 * Categorische kleurslots uit het gevalideerde palet. De index hangt aan het
 * netwerk, niet aan zijn plek in een gefilterde lijst — wie geleerd heeft dat
 * Daisycon blauw is, ziet dat blauw blijven.
 */
export function networkColorIndex(network: string): number {
  const index = NETWORK_IDS.indexOf(network as NetworkId);
  return index >= 0 ? index : 0;
}

/** CSS-variabele, zodat de kleur met het thema meeschakelt. */
export function networkColorVar(network: string): string {
  return `var(--series-${networkColorIndex(network) + 1})`;
}

export { NETWORK_IDS, type NetworkId };
