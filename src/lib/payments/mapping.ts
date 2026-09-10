/**
 * Server-side mapping helpers for iyzico Checkout Form (no secrets).
 * Amounts always come from order ledger strings — never from the client.
 */

export function formatIyzicoMoney(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("INVALID_ORDER_TOTAL");
  }
  return amount.toFixed(2);
}

export function splitFullName(fullName: string): { name: string; surname: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const parts = trimmed.split(" ");
  if (parts.length === 1) {
    return { name: parts[0], surname: parts[0] };
  }
  return {
    name: parts[0],
    surname: parts.slice(1).join(" "),
  };
}

export type OrderItemForBasket = {
  id: string;
  snapshot_label: string | null;
  item_type: string;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
};

export type IyzicoBasketLine = {
  id: string;
  name: string;
  category1: string;
  itemType: "VIRTUAL";
  price: string;
};

/**
 * Build iyzico basket lines from DB order items.
 * Line prices use unit_price * quantity (or total_price) so sum matches ledger.
 */
export function buildBasketItemsFromOrderItems(
  items: OrderItemForBasket[],
  orderTotal: number
): IyzicoBasketLine[] {
  if (!items.length) {
    throw new Error("ORDER_ITEMS_MISSING");
  }

  const lines: IyzicoBasketLine[] = items.map((item) => {
    const qty = Number(item.quantity);
    const unit = Number(item.unit_price);
    const total = Number(item.total_price);
    const lineTotal = Number.isFinite(total) ? total : unit * qty;
    if (!Number.isFinite(lineTotal) || lineTotal < 0) {
      throw new Error("INVALID_ORDER_ITEM_PRICE");
    }
    return {
      id: item.id,
      name: (item.snapshot_label?.trim() || item.item_type || "Ticket").slice(
        0,
        120
      ),
      category1: "Events",
      itemType: "VIRTUAL" as const,
      price: formatIyzicoMoney(lineTotal),
    };
  });

  const sum = lines.reduce((acc, line) => acc + Number(line.price), 0);
  const expected = Number(formatIyzicoMoney(orderTotal));
  if (Math.abs(sum - expected) > 0.009) {
    throw new Error("BASKET_TOTAL_MISMATCH");
  }
  return lines;
}

export type StartPaymentPublicDto = {
  provider: "iyzico";
  orderId: string;
  token: string;
  checkoutFormContent: string | null;
  paymentPageUrl: string | null;
  sessionId: string;
};

export function toStartPaymentPublicDto(input: {
  orderId: string;
  sessionId: string;
  providerToken: string;
  paymentPageUrl: string | null | undefined;
  checkoutFormContent: string | null | undefined;
}): StartPaymentPublicDto {
  return {
    provider: "iyzico",
    orderId: input.orderId,
    token: input.providerToken,
    checkoutFormContent: input.checkoutFormContent ?? null,
    paymentPageUrl: input.paymentPageUrl ?? null,
    sessionId: input.sessionId,
  };
}
