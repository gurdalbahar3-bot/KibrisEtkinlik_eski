/**
 * Minimal Supabase Database types for public discovery READ queries.
 * Hand-maintained — expand as queries grow (no generated types yet).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type DbEventStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "published"
  | "postponed"
  | "unpublished"
  | "cancelled"
  | "completed";

export type DbEventChangeRequestType = "postpone" | "reschedule";

export type DbEventChangeRequestStatus = "pending" | "accepted" | "rejected";

export type DbEventChangeDecision = "accept" | "reject";

export interface DbEventChangeRequestRow {
  id: string;
  event_id: string;
  requester_id: string;
  change_type: DbEventChangeRequestType;
  proposed_start: string | null;
  proposed_end: string | null;
  reason: string | null;
  status: DbEventChangeRequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface DbKktcDistrictRow {
  id?: string;
  code: string;
  name_tr: string;
  name_en: string;
  sort_order: number;
  is_active: boolean;
}

export interface DbVenueAreaRow {
  id: string;
  venue_id: string;
  name: string;
  area_type: string | null;
  capacity: number | null;
  sort_order: number | null;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  height: number | null;
  rotation: number | null;
  shape: string | null;
  created_at?: string;
}

export interface DbVenueTableRow {
  id: string;
  venue_id: string;
  area_id: string | null;
  table_number: string;
  capacity: number;
  table_type: string | null;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  depth: number | null;
  height: number | null;
  elevation: number | null;
  rotation: number | null;
  shape: string | null;
  created_at?: string;
}

export interface DbVenueSeatRow {
  id: string;
  venue_id: string;
  area_id: string | null;
  section: string | null;
  row_label: string | null;
  seat_number: string;
  seat_type: string | null;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  depth: number | null;
  height: number | null;
  rotation: number | null;
  shape: string | null;
  created_at?: string;
}

export interface DbVenueLayoutObjectRow {
  id: string;
  venue_id: string;
  area_id: string | null;
  object_type: string;
  name: string | null;
  position_x: number | null;
  position_y: number | null;
  width: number | null;
  depth: number | null;
  height: number | null;
  elevation: number | null;
  rotation: number | null;
  shape: string | null;
  z_index: number;
  is_visible: boolean;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

export type RpcResultJson = {
  success: boolean;
  error_code?: string;
  venue_id?: string;
};

export type DbVenueStatus = "draft" | "in_review" | "active" | "hidden" | "archived";

export interface DbVenueRow {
  id: string;
  owner_id?: string;
  created_by?: string;
  name: string;
  venue_category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  floor_plan_url: string | null;
  capacity: number | null;
  status: DbVenueStatus | string;
  district_id: string | null;
  organization_id?: string | null;
  layout_canvas_width?: number | null;
  layout_canvas_height?: number | null;
  layout_grid_size?: number | null;
  created_at?: string;
  updated_at?: string;
  kktc_districts: Pick<DbKktcDistrictRow, "code"> | null;
}

export interface DbEventLocationRow {
  event_id: string;
  address: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  district_id: string | null;
  kktc_districts: Pick<DbKktcDistrictRow, "code"> | null;
}

export interface DbArtistRow {
  id: string;
  name: string;
  slug: string;
}

export interface DbEventArtistRow {
  sort_order: number | null;
  role: string | null;
  artists: DbArtistRow | null;
}

export type DbAccountType = "customer" | "venue_owner" | "organizer";

export type DbVerificationStatus = "pending" | "approved" | "rejected" | "not_required";

export type DbApplicationType = "venue_owner" | "organizer";

export type DbApplicationStatus = "pending" | "under_review" | "approved" | "rejected";

export interface DbProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  account_type: DbAccountType | string | null;
}

export interface DbProfileRowFull extends DbProfileRow {
  email: string;
  phone: string | null;
  account_type: DbAccountType;
  verification_status: DbVerificationStatus;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbAccountApplicationRow {
  id: string;
  applicant_id: string;
  type: DbApplicationType;
  status: DbApplicationStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  submitted_at: string;
}

export type DbApproveAccountDecision = "approve" | "reject";

export interface DbApproveAccountApplicationResult {
  success: boolean;
  error_code?: string;
  application_id?: string;
  decision?: DbApproveAccountDecision;
  account_type?: string;
  verification_status?: string;
  organization_id?: string | null;
}

export interface DbPublishEventResult {
  success: boolean;
  error_code?: string;
  event_id?: string;
  status?: string;
  noop?: boolean;
}

export interface DbApproveEventResult {
  success: boolean;
  error_code?: string;
  event_id?: string;
  status?: string;
}

export interface DbAdminAuditLogRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  target_type: string;
  target_id: string;
  old_state: Json | null;
  new_state: Json | null;
  metadata: Json;
  created_at: string;
}

export interface DbEventRow {
  id: string;
  owner_id: string;
  created_by?: string;
  title: string;
  description: string | null;
  category: string;
  is_free: boolean;
  starts_at: string;
  ends_at: string | null;
  cover_image_url: string | null;
  official_ticket_url?: string | null;
  venue_id: string;
  status: DbEventStatus;
  review_status?: string | null;
  venues: DbVenueRow | null;
  event_locations: DbEventLocationRow | DbEventLocationRow[] | null;
  event_artists: DbEventArtistRow[] | null;
}

export interface DbEventTicketZoneRow {
  id: string;
  event_id: string;
  name: string;
  zone_type: string;
  sale_mode: string;
  capacity: number;
  reserved_count: number;
  sold_count: number;
  description: string | null;
  sort_order: number | null;
  is_active: boolean;
}

export interface DbEventTicketTypeRow {
  id: string;
  event_id: string;
  zone_id: string;
  name: string;
  price: number | string;
  description: string | null;
  max_per_order: number | null;
  is_active: boolean;
  event_ticket_zones: DbEventTicketZoneRow | DbEventTicketZoneRow[] | null;
}

export type DbOrderStatus =
  | "draft"
  | "pending_payment"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled_by_organizer";

export interface DbOrderRow {
  id: string;
  customer_id: string;
  event_id: string;
  status: DbOrderStatus | string;
  subtotal_amount: number | string;
  total_amount: number | string;
  currency: string | null;
  expires_at: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  amount_paid_online: number | string | null;
  amount_remaining: number | string | null;
  amount_due_now: number | string | null;
}

export interface DbOrderItemRow {
  id: string;
  order_id: string;
  item_type: string;
  reference_id: string | null;
  zone_id: string | null;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
  snapshot_label: string | null;
  created_at: string;
  amount_due_now: number | string | null;
}

export interface DbOrderItemSelectionRow {
  id: string;
  order_item_id: string;
  selection_type: string;
  package_item_id: string | null;
  package_upgrade_id: string | null;
  upgrade_option_id: string | null;
  snapshot_item_name: string;
  snapshot_option_name: string | null;
  snapshot_category: string | null;
  quantity: number;
  unit_price_delta: number | string;
  line_total_delta: number | string;
  created_at: string;
}

export type DbTicketStatus =
  | "pending_payment"
  | "active"
  | "transferred"
  | "used"
  | "cancelled"
  | "cancelled_by_organizer";

export interface DbTicketRow {
  id: string;
  event_id: string;
  ticket_type_id: string;
  zone_id: string;
  order_id: string;
  order_item_id: string | null;
  holder_id: string;
  status: DbTicketStatus | string;
  qr_code_id: string | null;
  confirmed_at: string | null;
  created_at: string;
}

export interface DbCustomerProfileRow {
  profile_id: string;
  preferred_city: string | null;
  created_at: string;
}

export type DbPaymentStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "refunded_partial"
  | "refunded_full";

export interface DbPaymentRow {
  id: string;
  order_id: string | null;
  provider: string | null;
  provider_payment_id: string | null;
  amount: number | string | null;
  currency: string;
  status: DbPaymentStatus | string;
  payment_method: string | null;
  paid_at: string | null;
  created_at: string | null;
}

export type DbPaymentSessionStatus =
  | "created"
  | "redirected"
  | "awaiting_provider"
  | "succeeded"
  | "failed"
  | "expired"
  | "cancelled";

export interface DbPaymentSessionRow {
  id: string;
  order_id: string;
  provider: string;
  provider_token: string | null;
  conversation_id: string;
  status: DbPaymentSessionStatus | string;
  amount: number | string;
  currency: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export type DbPaymentWebhookProcessingStatus =
  | "received"
  | "processing"
  | "processed"
  | "ignored"
  | "failed";

export interface DbPaymentWebhookEventRow {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string | null;
  payload: Json;
  processing_status: DbPaymentWebhookProcessingStatus | string;
  order_id: string | null;
  payment_id: string | null;
  error_code: string | null;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      venues: {
        Row: Omit<DbVenueRow, "kktc_districts">;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      kktc_districts: {
        Row: Required<Pick<DbKktcDistrictRow, "id" | "code" | "name_tr" | "name_en" | "sort_order" | "is_active">>;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      venue_areas: {
        Row: {
          id: string;
          venue_id: string;
          name: string;
          area_type: string | null;
          capacity: number | null;
          sort_order: number | null;
          position_x: number | null;
          position_y: number | null;
          width: number | null;
          height: number | null;
          rotation: number | null;
          shape: string | null;
          created_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      venue_tables: {
        Row: {
          id: string;
          venue_id: string;
          area_id: string | null;
          table_number: string;
          capacity: number;
          table_type: string | null;
          position_x: number | null;
          position_y: number | null;
          width: number | null;
          depth: number | null;
          height: number | null;
          elevation: number | null;
          rotation: number | null;
          shape: string | null;
          created_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      venue_seats: {
        Row: {
          id: string;
          venue_id: string;
          area_id: string | null;
          section: string | null;
          row_label: string | null;
          seat_number: string;
          seat_type: string | null;
          position_x: number | null;
          position_y: number | null;
          width: number | null;
          depth: number | null;
          height: number | null;
          rotation: number | null;
          shape: string | null;
          created_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      venue_layout_objects: {
        Row: {
          id: string;
          venue_id: string;
          area_id: string | null;
          object_type: string;
          name: string | null;
          position_x: number | null;
          position_y: number | null;
          width: number | null;
          depth: number | null;
          height: number | null;
          elevation: number | null;
          rotation: number | null;
          shape: string | null;
          z_index: number;
          is_visible: boolean;
          created_by: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          phone: string | null;
          full_name: string | null;
          account_type: DbAccountType;
          verification_status: DbVerificationStatus;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: {
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          status: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      organization_memberships: {
        Row: {
          id: string;
          organization_id: string;
          profile_id: string;
          status: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      organizer_profiles: {
        Row: {
          profile_id: string;
          organization_name: string | null;
          organization_id: string | null;
          created_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          owner_id: string;
          venue_id: string;
          title: string;
          description: string | null;
          category: string;
          is_free: boolean;
          is_wedding: boolean;
          status: DbEventStatus | string;
          starts_at: string;
          ends_at: string | null;
          cover_image_url: string | null;
          organization_id: string | null;
          created_at?: string | null;
          review_submitted_at?: string | null;
        };
        Insert: Record<string, never>;
        Update: {
          title?: string;
          description?: string | null;
          category?: string;
          is_free?: boolean;
          is_wedding?: boolean;
          cover_image_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      account_applications: {
        Row: {
          id: string;
          applicant_id: string;
          type: DbApplicationType;
          status: DbApplicationStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          rejection_reason: string | null;
          submitted_at: string;
        };
        Insert: {
          applicant_id: string;
          type: DbApplicationType;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      admin_audit_log: {
        Row: DbAdminAuditLogRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      event_change_requests: {
        Row: DbEventChangeRequestRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      event_ticket_zones: {
        Row: DbEventTicketZoneRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      event_ticket_types: {
        Row: Omit<DbEventTicketTypeRow, "event_ticket_zones">;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      orders: {
        Row: DbOrderRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      order_items: {
        Row: DbOrderItemRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      order_item_selections: {
        Row: DbOrderItemSelectionRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      tickets: {
        Row: DbTicketRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      customer_profiles: {
        Row: DbCustomerProfileRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      payments: {
        Row: DbPaymentRow;
        Insert: {
          order_id?: string | null;
          provider?: string | null;
          provider_payment_id?: string | null;
          amount?: number | string | null;
          currency: string;
          status: string;
          payment_method?: string | null;
          paid_at?: string | null;
          created_at?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [];
      };
      payment_sessions: {
        Row: DbPaymentSessionRow;
        Insert: {
          order_id: string;
          provider: string;
          provider_token?: string | null;
          conversation_id: string;
          status?: string;
          amount: number | string;
          currency: string;
          expires_at: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: string;
          provider_token?: string | null;
          updated_at?: string;
          expires_at?: string;
        };
        Relationships: [];
      };
      payment_webhook_events: {
        Row: DbPaymentWebhookEventRow;
        Insert: {
          provider: string;
          provider_event_id: string;
          event_type?: string | null;
          payload: Json;
          processing_status?: string;
          order_id?: string | null;
          payment_id?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          received_at?: string;
          processed_at?: string | null;
        };
        Update: {
          processing_status?: string;
          order_id?: string | null;
          payment_id?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          processed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      approve_account_application: {
        Args: {
          p_application_id: string;
          p_decision: string;
          p_rejection_reason: string | null;
          p_organization_id: string | null;
        };
        Returns: Json;
      };
      can_manage_venue: {
        Args: {
          p_venue_id: string;
        };
        Returns: boolean;
      };
      create_venue_atomic: {
        Args: {
          p_name: string;
          p_owner_id?: string | null;
          p_venue_category?: string | null;
          p_address?: string | null;
          p_city?: string | null;
          p_region?: string | null;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_capacity?: number | null;
          p_district_id?: string | null;
          p_organization_id?: string | null;
          p_floor_plan_url?: string | null;
        };
        Returns: Json;
      };
      create_event_atomic: {
        Args: {
          p_title: string;
          p_venue_id: string;
          p_category: string;
          p_starts_at: string;
          p_description?: string | null;
          p_ends_at?: string | null;
          p_cover?: string | null;
          p_is_free?: boolean | null;
          p_is_wedding?: boolean | null;
          p_owner_id?: string | null;
          p_organization_id?: string | null;
        };
        Returns: Json;
      };
      publish_event: {
        Args: {
          p_event_id: string;
        };
        Returns: Json;
      };
      postpone_event: {
        Args: {
          p_event_id: string;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      reschedule_event: {
        Args: {
          p_event_id: string;
          p_starts_at: string;
          p_ends_at?: string | null;
        };
        Returns: Json;
      };
      submit_event_for_review: {
        Args: {
          p_event_id: string;
        };
        Returns: Json;
      };
      approve_event: {
        Args: {
          p_event_id: string;
        };
        Returns: Json;
      };
      unpublish_event: {
        Args: {
          p_event_id: string;
        };
        Returns: Json;
      };
      cancel_event: {
        Args: {
          p_event_id: string;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      complete_event: {
        Args: {
          p_event_id: string;
        };
        Returns: Json;
      };
      propose_event_schedule_change: {
        Args: {
          p_event_id: string;
          p_change_type: DbEventChangeRequestType;
          p_proposed_start?: string | null;
          p_proposed_end?: string | null;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      decide_event_change_request: {
        Args: {
          p_request_id: string;
          p_decision: DbEventChangeDecision;
        };
        Returns: Json;
      };
      upsert_artist_atomic: {
        Args: {
          p_name: string;
          p_slug?: string | null;
          p_bio?: string | null;
          p_image_url?: string | null;
          p_is_active?: boolean | null;
          p_artist_id?: string | null;
        };
        Returns: Json;
      };
      set_event_artists_atomic: {
        Args: {
          p_event_id: string;
          p_artists: Json;
        };
        Returns: Json;
      };
      set_event_official_ticket_url: {
        Args: {
          p_event_id: string;
          p_url?: string | null;
        };
        Returns: Json;
      };
      update_venue_atomic: {
        Args: {
          p_venue_id: string;
          p_name?: string | null;
          p_venue_category?: string | null;
          p_address?: string | null;
          p_city?: string | null;
          p_region?: string | null;
          p_district_id?: string | null;
          p_latitude?: number | null;
          p_longitude?: number | null;
          p_capacity?: number | null;
          p_floor_plan_url?: string | null;
          p_organization_id?: string | null;
        };
        Returns: Json;
      };
      submit_venue_for_review: {
        Args: {
          p_venue_id: string;
        };
        Returns: Json;
      };
      approve_venue: {
        Args: {
          p_venue_id: string;
        };
        Returns: Json;
      };
      hide_venue: {
        Args: {
          p_venue_id: string;
        };
        Returns: Json;
      };
      unhide_venue: {
        Args: {
          p_venue_id: string;
        };
        Returns: Json;
      };
      archive_venue: {
        Args: {
          p_venue_id: string;
        };
        Returns: Json;
      };
      save_venue_layout_batch_atomic: {
        Args: {
          p_venue_id: string;
          p_canvas?: Json | null;
          p_areas?: Json[];
          p_tables?: Json[];
          p_seats?: Json[];
          p_objects?: Json[];
        };
        Returns: Json;
      };
      create_mixed_cart_atomic: {
        Args: {
          p_event_id: string;
          p_items: Json;
        };
        Returns: Json;
      };
      checkout_ticket_only_atomic: {
        Args: {
          p_event_id: string;
          p_zone_id: string;
          p_ticket_type_id: string;
          p_quantity: number;
        };
        Returns: Json;
      };
      expire_due_pending_orders_atomic: {
        Args: Record<string, never>;
        Returns: Json;
      };
      expire_order_atomic: {
        Args: {
          p_order_id: string;
        };
        Returns: Json;
      };
      confirm_payment_atomic: {
        Args: {
          p_order_id: string;
          p_provider: string;
          p_provider_payment_id: string;
          p_amount: number;
          p_currency: string;
          p_payment_method?: string | null;
        };
        Returns: Json;
      };
      fail_payment_atomic: {
        Args: {
          p_order_id: string;
          p_provider?: string | null;
          p_provider_payment_id?: string | null;
          p_currency?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      event_status: DbEventStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
