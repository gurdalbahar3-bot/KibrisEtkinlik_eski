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
  | "published"
  | "postponed"
  | "cancelled"
  | "completed";

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

export interface DbVenueRow {
  id: string;
  owner_id?: string;
  name: string;
  venue_category: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  latitude: number | null;
  longitude: number | null;
  floor_plan_url: string | null;
  capacity: number | null;
  status: string;
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
  title: string;
  description: string | null;
  category: string;
  is_free: boolean;
  starts_at: string;
  ends_at: string | null;
  cover_image_url: string | null;
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
      create_venue_atomic: {
        Args: {
          p_name: string;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
