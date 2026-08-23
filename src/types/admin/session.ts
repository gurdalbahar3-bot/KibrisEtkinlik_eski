export interface AdminSession {
  userId: string;
  email?: string;
  role: "super_admin";
}
