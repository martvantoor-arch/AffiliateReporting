import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/auth/auth-frame";
import { RegisterForm } from "@/components/auth/register-form";
import { canRegister } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Account aanmaken" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  if (!(await canRegister())) redirect("/inloggen");

  return (
    <AuthFrame
      eyebrow="Eerste keer"
      title="Maak je kasboek aan."
      intro="Je gegevens blijven op je eigen server staan. API-sleutels worden versleuteld opgeslagen en zijn na het opslaan niet meer op te vragen."
      footer={
        <p>
          Heb je al een account?{" "}
          <Link href="/inloggen" className="font-medium text-ink underline underline-offset-2">
            Inloggen
          </Link>
        </p>
      }
    >
      <h2 className="font-display text-xl text-ink">Account aanmaken</h2>
      <p className="mt-1 mb-5 text-sm text-ink-2">
        Kies een sterk wachtwoord. Tweestapsverificatie kun je daarna in één
        minuut aanzetten.
      </p>
      <RegisterForm />
    </AuthFrame>
  );
}
