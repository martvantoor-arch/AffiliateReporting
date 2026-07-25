import { awinAdapter } from "@/lib/networks/awin";
import { bolAdapter } from "@/lib/networks/bol";
import { daisyconAdapter } from "@/lib/networks/daisycon";
import { tradedoublerAdapter } from "@/lib/networks/tradedoubler";
import { tradetrackerAdapter } from "@/lib/networks/tradetracker";
import { NETWORK_IDS, type NetworkAdapter, type NetworkId } from "@/lib/networks/types";

/**
 * De volgorde hier is de vaste volgorde in de hele app. Een nieuw netwerk voeg
 * je onderaan NETWORK_IDS toe, zodat bestaande kleuren niet verschuiven.
 */
export const adapters: Record<NetworkId, NetworkAdapter> = {
  daisycon: daisyconAdapter,
  tradetracker: tradetrackerAdapter,
  tradedoubler: tradedoublerAdapter,
  bol: bolAdapter,
  awin: awinAdapter,
};

export const adapterList: NetworkAdapter[] = NETWORK_IDS.map((id) => adapters[id]);

export function getAdapter(network: string): NetworkAdapter {
  const adapter = adapters[network as NetworkId];
  if (!adapter) throw new Error(`Onbekend netwerk: ${network}`);
  return adapter;
}

export {
  NETWORK_IDS,
  NETWORK_NAMES,
  networkColorIndex,
  networkColorVar,
  networkName,
} from "@/lib/networks/meta";
export type { NetworkAdapter, NetworkId };
