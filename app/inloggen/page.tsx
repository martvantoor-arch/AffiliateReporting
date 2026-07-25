import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";
import { canRegister } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Inloggen" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const registrationOpen = await canRegister();

  return (
    <AuthFrame
      eyebrow="Kasboek"
      title="Al je affiliate-inkomsten op één plek."
      intro="Vijf netwerken, één overzicht. Inloggen en je ziet direct wat er binnenkomt, wat nog in behandeling staat en of je voor of achter loopt op vorige maand."
      footer={
        registrationOpen ? (
          <p>
            Nog geen account?{" "}
            <Link href="/registreren" className="font-medium text-ink underline underline-offset-2">
              Account aanmaken
            </Link>
          </p>
        ) : (
          <p className="text-muted">
            Deze installatie is gesloten voor nieuwe registraties.
          </p>
        )
      }
    >
      <h2 className="font-display text-xl text-ink">Inloggen</h2>
      <p className="mt-1 mb-5 text-sm text-ink-2">
        Welkom terug. Vul je gegevens in om verder te gaan.
      </p>
      <LoginForm />
    </AuthFrame>
  );
}
