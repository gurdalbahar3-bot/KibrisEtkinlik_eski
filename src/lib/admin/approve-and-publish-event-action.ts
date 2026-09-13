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

/**
 * Super Admin Approval V1: existing approve_event + publish_event RPCs only.
 * Dev-cookie auth stays fail-closed inside the nested actions.
 */
export async function approveAndPublishEventFormAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "").trim();
  const localeRaw = String(formData.get("locale") ?? "tr").trim();
  const locale: "tr" | "en" = localeRaw === "en" ? "en" : "tr";
  const returnBase = resolveDetailBase(formData);

  if (!isEventUuid(eventId)) {
    redirect(`${returnBase}?approvePublishError=${encodeURIComponent("EVENT_NOT_FOUND")}`);
  }

  const approve = await approveEventAction(eventId);
  if (!approve.ok) {
    redirect(
      `${returnBase}/${encodeURIComponent(eventId)}?approvePublishError=${encodeURIComponent(approve.message)}`
    );
  }

  const publish = await publishEventAction(eventId);
  if (!publish.ok) {
    redirect(
      `${returnBase}/${encodeURIComponent(eventId)}?approved=${encodeURIComponent(eventId)}&approvePublishError=${encodeURIComponent(publish.message)}`
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select("id, title")
    .eq("id", eventId)
    .maybeSingle();

  const title = (eventRow as { title?: string } | null)?.title ?? "event";
  const publicPath = publicEventPath(locale, title, eventId);

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
