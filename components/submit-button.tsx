"use client";

import { useFormStatus } from "react-dom";

/**
 * Knop die zichzelf uitschakelt terwijl het formulier verstuurd wordt, zodat
 * dubbel klikken geen tweede sync of tweede account oplevert.
 */
export function SubmitButton({
  children,
  className = "btn-accent px-4 py-2.5",
  pendingLabel,
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      name={name}
      value={value}
      className={className}
    >
      {pending ? (pendingLabel ?? "Bezig…") : children}
    </button>
  );
}
