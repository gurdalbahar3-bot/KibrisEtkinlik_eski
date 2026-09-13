"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { approveEventAction } from "@/lib/admin/approve-event-action";
import { publishEventAction } from "@/lib/admin/publish-event-action";
import { isEventUuid } from "@/lib/admin/publish-event-result";
import { buildDeterministicSlug } from "@/lib/data/adapters/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const ALLOWED_RETURN_BASES = new Set([
  "/admin/review/events",
  "/tr/admin/events",
  "/en/admin/events",
]);

function resolveDetailBase(formData: FormData): string {
  const raw = String(formData.get("returnBase") ?? "").trim();
  return ALLOWED_RETURN_BASES.has(raw) ? raw : "/admin/review/events";
}

function publicEventPath(locale: "tr" | "en", title: string, id: string): string {
  const slug = buildDeterministicSlug(title, id);
  return locale === "en" ? `/en/events/${slug}` : `/tr/etkinlikler/${slug}`;
}

function successRedirect(returnBase: string, eventId: string, publicPath: string): never {
  revalidatePath("/admin/review/events");
  revalidatePath(`/admin/review/events/${eventId}`);
  revalidatePath("/admin/publishing");
  revalidatePath(`/admin/publishing/${eventId}`);
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath("/tr/admin/events");
  revalidatePath("/en/admin/events");
  revalidatePath(`/tr/admin/events/${eventId}`);
  revalidatePath(`/en/admin/events/${eventId}`);
  revalidatePath("/tr", "layout");
  revalidatePath("/en", "layout");

  redirect(
    `${returnBase}/${encodeURIComponent(eventId)}?published=${encodeURIComponent(eventId)}&publicPath=${encodeURIComponent(publicPath)}`
  );
}

/**
 * Super Admin Approval V1: approve_event (once) then publish_event.
 * Idempotent against double-submit: already-published → success; already-approved → publish only.
 */
export async function approveAndPublishEventFormAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const localeRaw = String(formData.get("locale") ?? "tr").trim();
  const locale: "tr" | "en" = localeRaw === "en" ? "en" : "tr";
  const returnBase = resolveDetailBase(formData);

  if (!isEventUuid(eventId)) {
    redirect(`${returnBase}?approvePublishError=${encodeURIComponent("EVENT_NOT_FOUND")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: eventRow, error: eventReadError } = await supabase
    .from("events")
    .select("id, title, status")
    .eq("id", eventId)
    .maybeSingle();

  if (eventReadError) {
    redirect(
      `${returnBase}/${encodeURIComponent(eventId)}?approvePublishError=${encodeURIComponent(eventReadError.message)}`
    );
  }

  const row = eventRow as { id: string; title: string; status: string } | null;
  if (!row) {
    redirect(
      `${returnBase}/${encodeURIComponent(eventId)}?approvePublishError=${encodeURIComponent("EVENT_NOT_FOUND")}`
    );
  }

  const publicPath = publicEventPath(locale, row.title || "event", eventId);
  const status = String(row.status);

  // Double-submit / refresh after success: do not re-call approve_event.
  if (status === "published") {
    successRedirect(returnBase, eventId, publicPath);
  }

  // Already approved (e.g. first submit approved, second raced): skip approve_event.
  if (status === "in_review") {
    const approve = await approveEventAction(eventId);
    if (!approve.ok) {
      // Re-read: a concurrent successful submit may have already published.
      const { data: afterApprove } = await supabase
        .from("events")
        .select("id, status")
        .eq("id", eventId)
        .maybeSingle();
      const afterStatus = String((afterApprove as { status?: string } | null)?.status ?? "");
      if (afterStatus === "published") {
        successRedirect(returnBase, eventId, publicPath);
      }
      if (afterStatus === "approved") {
        // Fall through to publish below.
      } else {
        redirect(
          `${returnBase}/${encodeURIComponent(eventId)}?approvePublishError=${encodeURIComponent(approve.message)}`
        );
      }
    }
  } else if (status !== "approved" && status !== "unpublished") {
    redirect(
      `${returnBase}/${encodeURIComponent(eventId)}?approvePublishError=${encodeURIComponent(`approve_event failed: INVALID_TRANSITION`)}`
    );
  }

  const publish = await publishEventAction(eventId);
  if (!publish.ok) {
    const { data: afterPublish } = await supabase
      .from("events")
      .select("id, status")
      .eq("id", eventId)
      .maybeSingle();
    const afterStatus = String((afterPublish as { status?: string } | null)?.status ?? "");
    if (afterStatus === "published") {
      successRedirect(returnBase, eventId, publicPath);
    }
    redirect(
      `${returnBase}/${encodeURIComponent(eventId)}?approved=${encodeURIComponent(eventId)}&approvePublishError=${encodeURIComponent(publish.message)}`
    );
  }

  successRedirect(returnBase, eventId, publicPath);
}
