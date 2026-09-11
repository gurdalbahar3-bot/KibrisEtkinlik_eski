/**
 * Reservation engine pure helpers — mirror DB semantics (040 capacity, deposits, holds).
 * Never trust client availability/price; RPCs remain source of truth.
 */

export const RESERVATION_STATUS = {
  pendingPayment: "pending_payment",
  confirmed: "confirmed",
  used: "used",
  cancelled: "cancelled",
  expired: "expired",
} as const;

export const HOLD_TTL_MINUTES = 10;

/** Shared-table capacity: confirmed+used entry_passes vs effective capacity. */
export function evaluateSharedTableCapacity(input: {
  effectiveCapacity: number;
  usedPassCount: number;
  requestedGuests: number;
}): { ok: true; remaining: number } | { ok: false; errorCode: string; remaining: number } {
  const capacity = Math.max(0, Math.floor(input.effectiveCapacity));
  const used = Math.max(0, Math.floor(input.usedPassCount));
  const request = Math.floor(input.requestedGuests);
  const remaining = Math.max(0, capacity - used);

  if (!Number.isFinite(request) || request <= 0) {
    return { ok: false, errorCode: "INVALID_PASS_COUNT", remaining };
  }
  if (request > remaining) {
    return { ok: false, errorCode: "TABLE_CAPACITY_EXCEEDED", remaining };
  }
  return { ok: true, remaining: remaining - request };
}

/**
 * Example: capacity 10, groups 3+4+2+1 = 10 → full; +1 rejected.
 */
export function simulateSharedTableGroups(
  capacity: number,
  groupSizes: number[]
): { accepted: number[]; rejectedAt: number | null; remaining: number } {
  let used = 0;
  const accepted: number[] = [];
  for (let i = 0; i < groupSizes.length; i++) {
    const size = groupSizes[i]!;
    const check = evaluateSharedTableCapacity({
      effectiveCapacity: capacity,
      usedPassCount: used,
      requestedGuests: size,
    });
    if (!check.ok) {
      return { accepted, rejectedAt: i, remaining: capacity - used };
    }
    used += size;
    accepted.push(size);
  }
  return { accepted, rejectedAt: null, remaining: capacity - used };
}

export function computeTableDepositDue(input: {
  basePrice: number;
  depositAmount: number | null | undefined;
}): {
  currency: "TRY";
  basePrice: number;
  depositAmount: number;
  remainingAmount: number;
  amountDueNow: number;
} {
  const base = Number(input.basePrice);
  const deposit = Math.max(0, Number(input.depositAmount ?? 0));
  if (!Number.isFinite(base) || base < 0) {
    throw new Error("INVALID_PRICE");
  }
  if (!Number.isFinite(deposit) || deposit < 0 || deposit > base) {
    throw new Error("INVALID_DEPOSIT");
  }
  const remaining = base - deposit;
  return {
    currency: "TRY",
    basePrice: base,
    depositAmount: deposit,
    remainingAmount: remaining,
    amountDueNow: deposit > 0 ? deposit : base,
  };
}

export function assertTryCurrency(currency: string | null | undefined): boolean {
  return (currency ?? "").trim().toUpperCase() === "TRY";
}

export function evaluateHoldState(input: {
  orderStatus: string;
  expiresAt: string;
  nowMs?: number;
}): "active_hold" | "expired" | "not_hold" {
  if (input.orderStatus !== RESERVATION_STATUS.pendingPayment) {
    return "not_hold";
  }
  const now = input.nowMs ?? Date.now();
  if (new Date(input.expiresAt).getTime() < now) {
    return "expired";
  }
  return "active_hold";
}

/** Exclusive resource_locks semantics during online hold (MVP). */
export function evaluateTableLockConflict(input: {
  hasActiveLock: boolean;
  lockOwnerUserId: string | null;
  requesterUserId: string;
}): { ok: true } | { ok: false; errorCode: "TABLE_LOCKED" } {
  if (!input.hasActiveLock) return { ok: true };
  if (input.lockOwnerUserId === input.requesterUserId) return { ok: true };
  return { ok: false, errorCode: "TABLE_LOCKED" };
}

export function buildMixedCartTableItem(input: {
  tableId: string;
  packageId: string;
  guestCount: number;
}): {
  item_type: "table";
  table_id: string;
  package_id: string;
  guest_count: number;
} {
  if (!input.tableId || !input.packageId) {
    throw new Error("MISSING_TABLE_OR_PACKAGE");
  }
  if (!Number.isInteger(input.guestCount) || input.guestCount <= 0) {
    throw new Error("GUEST_COUNT_REQUIRED");
  }
  return {
    item_type: "table",
    table_id: input.tableId,
    package_id: input.packageId,
    guest_count: input.guestCount,
  };
}

export const PACKAGE_SALE_CATEGORIES = ["table", "bistro", "vip"] as const;
export type PackageSaleCategory = (typeof PACKAGE_SALE_CATEGORIES)[number];

export function isPackageSaleCategory(value: string): value is PackageSaleCategory {
  return (PACKAGE_SALE_CATEGORIES as readonly string[]).includes(value);
}

export const VENUE_TABLE_TYPES = ["vip", "standard", "other"] as const;
export const VENUE_AREA_TYPES = [
  "hall",
  "stage",
  "entrance",
  "vip",
  "standard",
  "other",
] as const;
