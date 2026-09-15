"use client";

import { useFormStatus } from "react-dom";

type Props = {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
};

const VARIANT_CLASS: Record<NonNullable<Props["variant"]>, string> = {
  primary:
    "bg-teal-700 text-white hover:bg-teal-800 disabled:bg-teal-400",
  secondary:
    "border border-teal-200 bg-white text-teal-900 hover:bg-teal-50 disabled:opacity-60",
  danger:
    "border border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 disabled:opacity-60",
};

export function OrganizerSubmitButton({
  label,
  pendingLabel,
  variant = "primary",
  className = "",
}: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition ${VARIANT_CLASS[variant]} ${className}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
