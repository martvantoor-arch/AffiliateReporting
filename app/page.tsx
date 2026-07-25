import { AppShell } from "@/components/app-shell";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { requireUser } from "@/lib/auth/guard";
import { getDashboardData } from "@/lib/reporting";

// Cijfers moeten actueel zijn; deze pagina wordt nooit gecached.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = await searchParams;

  const networks = params.netwerk
    ? Array.isArray(params.netwerk)
      ? params.netwerk
      : [params.netwerk]
    : [];

  const data = await getDashboardData(user.id, user.timezone, {
    preset: single(params.periode),
    from: single(params.van),
    to: single(params.tot),
    networks,
  });

  return (
    <AppShell email={user.email}>
      <DashboardView data={data} />
    </AppShell>
  );
}

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
