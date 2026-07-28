import { formatEur } from "@/lib/format";
import { networkName } from "@/lib/networks/meta";
import { sendToUser, type PushMessage } from "@/lib/push/send";

/** Eén nieuw binnengekomen transactie, genoeg om een melding van te maken. */
export interface NewSale {
  network: string;
  programName: string | null;
  commissionEur: number;
  status: string;
}

/**
 * Meer dan dit aantal wordt één samenvattende melding. Twintig losse trillingen
 * omdat een netwerk een achterstand inhaalt is geen notificatie maar een straf.
 */
const SUMMARY_THRESHOLD = 3;

/**
 * Stelt de melding samen voor nieuwe sales. Geeft het aantal apparaten terug
 * dat bereikt is; 0 betekent simpelweg dat er niets in te stellen viel.
 */
export async function notifyNewSales(userId: string, sales: NewSale[]): Promise<number> {
  const message = buildSaleMessage(sales);
  if (!message) return 0;
  return sendToUser(userId, message);
}

/**
 * De melding zelf, los van het versturen — zo is de tekst te testen zonder
 * database of pushdienst.
 */
export function buildSaleMessage(sales: NewSale[]): PushMessage | null {
  // Afgekeurde regels zijn geen nieuws om je telefoon voor te laten trillen.
  const relevant = sales.filter((sale) => sale.status !== "rejected");
  if (relevant.length === 0) return null;

  const total = relevant.reduce((sum, sale) => sum + sale.commissionEur, 0);

  return {
    title: title(relevant, total),
    body: body(relevant),
    url: "/",
    // Vaste tag: een tweede ronde vervangt de vorige melding op je scherm.
    tag: "kasboek-sale",
  };
}

function title(sales: NewSale[], total: number): string {
  if (sales.length === 1) return `Nieuwe sale — ${formatEur(total)}`;
  return `${sales.length} nieuwe sales — ${formatEur(total)}`;
}

function body(sales: NewSale[]): string {
  if (sales.length === 1) {
    const sale = sales[0];
    const where = networkName(sale.network);
    return sale.programName ? `${where} · ${sale.programName}` : where;
  }

  if (sales.length <= SUMMARY_THRESHOLD) {
    return sales
      .map((sale) => {
        const where = networkName(sale.network);
        const what = sale.programName ? `${where} · ${sale.programName}` : where;
        return `${what} — ${formatEur(sale.commissionEur)}`;
      })
      .join("\n");
  }

  // Bij veel regels tellen de netwerken meer dan de losse programma's.
  const perNetwork = new Map<string, number>();
  for (const sale of sales) {
    perNetwork.set(sale.network, (perNetwork.get(sale.network) ?? 0) + 1);
  }
  const parts = [...perNetwork.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([network, count]) => `${networkName(network)} (${count})`);
  return parts.join(", ");
}
