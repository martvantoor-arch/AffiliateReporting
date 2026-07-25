"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/guard";
import { destroyOtherSessions } from "@/lib/auth/session";

/** Logt alle andere apparaten uit, maar houdt dit apparaat ingelogd. */
export async function logoutOtherDevicesAction(): Promise<void> {
  const user = await requireUser();
  await destroyOtherSessions(user.id);
  revalidatePath("/account");
}
