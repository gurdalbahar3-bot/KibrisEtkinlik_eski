import "server-only";

import type { PaymentProvider } from "@/lib/payments/provider";
import {
  IyzicoPaymentProvider,
  isForbiddenIyzicoProductionBaseUrl,
} from "@/lib/payments/providers/iyzico";
import type { PaymentProviderCode } from "@/lib/payments/types";

export function getPaymentProvider(
  code: PaymentProviderCode = "iyzico"
): PaymentProvider {
  if (isForbiddenIyzicoProductionBaseUrl()) {
    throw new Error(
      "Refusing iyzico production base URL in Phase B1 (sandbox-only)."
    );
  }

  switch (code) {
    case "iyzico":
    case "stub":
      return new IyzicoPaymentProvider();
    default: {
      const _exhaustive: never = code;
      throw new Error(`Unknown payment provider: ${_exhaustive}`);
    }
  }
}
