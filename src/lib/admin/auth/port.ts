import type { AdminSession } from "@/types/admin/session";

export interface AdminAuthPort {
  getSession(): Promise<AdminSession | null>;
  isSuperAdmin(): Promise<boolean>;
  requireSuperAdmin(): Promise<AdminSession>;
}
