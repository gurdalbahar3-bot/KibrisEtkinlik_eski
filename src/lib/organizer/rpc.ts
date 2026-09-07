import type { Json } from "@/types/supabase/database";

export type OrganizerRpcPayload = {
  success?: boolean;
  error_code?: string;
  event_id?: string;
  status?: string;
};

export function parseOrganizerRpcJson(data: Json | null): OrganizerRpcPayload {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  return data as OrganizerRpcPayload;
}

const EVENT_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isEventUuid(value: string): boolean {
  return EVENT_UUID_RE.test(value);
}
