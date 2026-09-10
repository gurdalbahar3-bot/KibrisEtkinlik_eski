import { NextResponse } from "next/server";

import { localePaymentResultPath } from "@/lib/payments/settlement";
import { createPaymentService } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Extract CF token from iyzico callback. Browser params besides token are
 * never trusted for settlement (status / paymentId / amount ignored).
 */
async function extractCallbackToken(request: Request): Promise<{
  token: string;
  locale: string;
}> {
  const url = new URL(request.url);
  let token = url.searchParams.get("token")?.trim() ?? "";
  let locale = url.searchParams.get("locale")?.trim() ?? "";

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await request.json()) as Record<string, unknown>;
        if (!token && typeof body.token === "string") {
          token = body.token.trim();
        }
        if (!locale && typeof body.locale === "string") {
          locale = body.locale.trim();
        }
      } catch {
        // ignore malformed JSON — fall through
      }
    } else {
      try {
        const form = await request.formData();
        if (!token) {
          token = String(form.get("token") ?? "").trim();
        }
        if (!locale) {
          locale = String(form.get("locale") ?? "").trim();
        }
      } catch {
        // ignore
      }
    }
  }

  const normalizedLocale = locale.toLowerCase().startsWith("en") ? "en" : "tr";
  return { token, locale: normalizedLocale };
}

function redirectResult(
  request: Request,
  kind: "success" | "failure",
  locale: string,
  query: Record<string, string | undefined>
): NextResponse {
  const path = localePaymentResultPath(locale, kind, query);
  return NextResponse.redirect(new URL(path, request.url), 303);
}

async function processCallback(request: Request): Promise<NextResponse> {
  const { token, locale } = await extractCallbackToken(request);

  // Deliberately ignore: status, paymentId, conversationId, paidPrice from client.
  if (!token) {
    return redirectResult(request, "failure", locale, {
      code: "CALLBACK_TOKEN_REQUIRED",
    });
  }

  let settled;
  try {
    const service = createPaymentService("iyzico");
    settled = await service.handleProviderCallback({ token, locale });
  } catch {
    return redirectResult(request, "failure", locale, {
      code: "CALLBACK_HANDLER_ERROR",
    });
  }

  if (settled.success) {
    return redirectResult(request, "success", locale, {
      orderId: settled.orderId,
      noop: settled.noop ? "1" : undefined,
    });
  }

  return redirectResult(request, "failure", locale, {
    orderId: settled.orderId,
    code: settled.errorCode ?? "PAYMENT_FAILED",
  });
}

/** iyzico Checkout Form posts token here (primary). */
export async function POST(request: Request): Promise<NextResponse> {
  return processCallback(request);
}

/**
 * iyzico CF contract is POST. GET is not used for settlement; redirect failure.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale")?.toLowerCase().startsWith("en")
    ? "en"
    : "tr";
  return redirectResult(request, "failure", locale, {
    code: "CALLBACK_GET_NOT_SUPPORTED",
  });
}
