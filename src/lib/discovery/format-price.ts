/** Catalog prices are numeric TRY (schema has no currency column; JSON-LD already uses TRY). */
export function formatTicketPrice(amount: number, locale: "tr" | "en"): string {
  return new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-GB", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}
