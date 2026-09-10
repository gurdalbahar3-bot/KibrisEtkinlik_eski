"use client";

import { useFormStatus } from "react-dom";

import { startOrderPaymentAction } from "@/lib/customer/checkout-actions";

function PaySubmit({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="order-pay-submit"
      disabled={pending}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-700 px-4 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function OrderPayButton({
  locale,
  orderId,
  label,
  pendingLabel,
}: {
  locale: "tr" | "en";
  orderId: string;
  label: string;
  pendingLabel: string;
}) {
  return (
    <form action={startOrderPaymentAction} data-testid="order-pay-form">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="order_id" value={orderId} />
      <PaySubmit label={label} pendingLabel={pendingLabel} />
    </form>
  );
}
