import { NextResponse } from "next/server";

import { createPaymentService } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * iyzico merchant webhook (server-to-server).
 * Signature: X-IYZ-SIGNATURE-V3. Never trusts browser callback as substitute.
 * Response body is intentionally minimal — no secrets, no full provider payload.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let rawBody = "";
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      { ok: false, errorCode: "WEBHOOK_BODY_UNREADABLE" },
      { status: 400 }
    );
  }

  let result;
  try {
    const service = createPaymentService("iyzico");
    result = await service.handleProviderWebhook({
      headers: request.headers,
      rawBody,
    });
  } catch {
    return NextResponse.json(
      { ok: false, errorCode: "WEBHOOK_HANDLER_ERROR" },
      { status: 500 }
    );
  }

  const body: Record<string, unknown> = { ok: result.ok };
  if (result.duplicate) body.duplicate = true;
  if (result.ignored) body.ignored = true;
  if (result.noop) body.noop = true;
  if (result.settled) body.settled = true;
  if (result.errorCode) body.errorCode = result.errorCode;
  // orderId is safe opaque UUID for ops correlation; never include amounts/secrets.

  return NextResponse.json(body, { status: result.httpStatus });
}

/** Webhooks are POST-only. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { ok: false, errorCode: "WEBHOOK_METHOD_NOT_ALLOWED" },
    { status: 405 }
  );
}
