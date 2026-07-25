import { adapterList } from "@/lib/networks";
import type { AdapterMaturity, CredentialField, NetworkId } from "@/lib/networks/types";

/** Alleen de data uit een adapter, zonder functies — dus veilig door te geven
 * aan een client-component. */
export interface NetworkDescriptor {
  id: NetworkId;
  name: string;
  docsUrl: string;
  credentialsHelp: string;
  maturity: AdapterMaturity;
  fields: CredentialField[];
}

export function getNetworkDescriptors(): NetworkDescriptor[] {
  return adapterList.map((adapter) => ({
    id: adapter.id,
    name: adapter.name,
    docsUrl: adapter.docsUrl,
    credentialsHelp: adapter.credentialsHelp,
    maturity: adapter.maturity,
    fields: adapter.fields,
  }));
}
