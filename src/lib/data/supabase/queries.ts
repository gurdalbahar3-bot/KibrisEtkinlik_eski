/** Shared PostgREST select fragments for public discovery READ queries. */

export const EVENT_DISCOVERY_SELECT = `
  id,
  title,
  description,
  category,
  is_free,
  official_ticket_url,
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
  address,
  city,
  region,
  latitude,
  longitude,
  floor_plan_url,
  status,
  district_id,
  kktc_districts ( code )
`.trim();

/** Detail-only ticket catalog. Public SELECT is gated by event_is_published (034). */
export const EVENT_TICKET_OFFER_SELECT = `
  id,
  event_id,
  zone_id,
  name,
  price,
  description,
  max_per_order,
  is_active,
  event_ticket_zones (
    id,
    event_id,
    name,
    zone_type,
    sale_mode,
    capacity,
    reserved_count,
    sold_count,
    description,
    sort_order,
    is_active
  )
`.trim();

export const DISTRICT_DISCOVERY_SELECT = `
  code,
  name_tr,
  name_en,
  sort_order,
  is_active
`.trim();

/** Public statuses visible on event detail (includes past `completed`). */
export const PUBLIC_EVENT_STATUSES = ["published", "postponed", "completed"] as const;

/**
 * Homepage / listing / search discovery pool.
 * Excludes `completed` — past events must not inflate discovery lists.
 * Callers still apply Cyprus-timezone date >= today for upcoming-only surfaces.
 */
export const DISCOVERY_LIST_STATUSES = ["published", "postponed"] as const;
