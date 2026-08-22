/** Shared PostgREST select fragments for public discovery READ queries. */

export const EVENT_DISCOVERY_SELECT = `
  id,
  title,
  description,
  category,
  is_free,
  starts_at,
  ends_at,
  cover_image_url,
  venue_id,
  status,
  venues (
    id,
    name,
    venue_category,
    city,
    region,
    latitude,
    longitude,
    floor_plan_url,
    status,
    district_id,
    kktc_districts ( code )
  ),
  event_locations (
    district_id,
    city,
    region,
    latitude,
    longitude,
    kktc_districts ( code )
  ),
  event_artists (
    sort_order,
    role,
    artists ( id, name, slug )
  )
`.trim();

export const VENUE_DISCOVERY_SELECT = `
  id,
  name,
  venue_category,
  city,
  region,
  latitude,
  longitude,
  floor_plan_url,
  status,
  district_id,
  kktc_districts ( code )
`.trim();

export const DISTRICT_DISCOVERY_SELECT = `
  code,
  name_tr,
  name_en,
  sort_order,
  is_active
`.trim();

export const PUBLIC_EVENT_STATUSES = ["published", "postponed", "completed"] as const;
