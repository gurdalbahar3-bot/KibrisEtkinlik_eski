import type { DbAccountType } from "@/types/supabase/database";

export type CustomerSession = {
  userId: string;
  email: string | null;
  fullName: string | null;
  /** Any authenticated storefront identity (customer, organizer, or venue_owner). */
  accountType: DbAccountType;
  verificationStatus: string;
};
