import { redirect } from "next/navigation";

import { getCurrentUser, type SessionUser } from "@/lib/auth/session";

/** Voor pagina's: geen sessie betekent terug naar het inlogscherm. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/inloggen");
  return user;
}

/** Voor API-routes: geen redirect, maar een 401. */
export async function requireUserOrUnauthorized(): Promise<
  { user: SessionUser } | { response: Response }
> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: Response.json({ error: "Niet ingelogd." }, { status: 401 }),
    };
  }
  return { user };
}
