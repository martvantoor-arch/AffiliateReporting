import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/auth/auth-frame";
import { VerifyForm } from "@/components/auth/verify-form";
import { getCurrentUser, getPendingTwoFactorUserId } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Verificatie" };
export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  if (await getCurrentUser()) redirect("/");
  // Zonder geldige tussenstap is dit scherm niet bruikbaar.
  if (!(await getPendingTwoFactorUserId())) redirect("/inloggen");

  return (
    <AuthFrame
      eyebrow="Stap 2 van 2"
      title="Nog even bevestigen."
      intro="Je wachtwoord klopt. Vul de code van zes cijfers in die je authenticator-app nu laat zien."
      footer={
        <p>
          <Link href="/inloggen" className="font-medium text-ink underline underline-offset-2">
            Terug naar inloggen
          </Link>
        </p>
      }
    >
      <h2 className="font-display text-xl text-ink">Tweestapsverificatie</h2>
      <p className="mt-1 mb-5 text-sm text-ink-2">
        Codes zijn 30 seconden geldig.
      </p>
      <VerifyForm />
    </AuthFrame>
  );
}
