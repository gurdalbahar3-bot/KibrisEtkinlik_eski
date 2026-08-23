import { redirect } from "next/navigation";

import type { AdminAuthPort } from "@/lib/admin/auth/port";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminSession } from "@/types/admin/session";

async function readSupabaseAdminSession(): Promise<AdminSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: isSuperAdmin, error: rpcError } = await supabase.rpc("is_super_admin");

  if (rpcError || !isSuperAdmin) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? undefined,
    role: "super_admin",
  };
}

/** Supabase Auth session + is_super_admin() RPC (authenticated + RLS). */
export const supabaseAdminAuth: AdminAuthPort = {
  async getSession() {
    return readSupabaseAdminSession();
  },

  async isSuperAdmin() {
    const session = await readSupabaseAdminSession();
    return session?.role === "super_admin";
  },

  async requireSuperAdmin() {
    const session = await readSupabaseAdminSession();
    if (!session) {
      redirect("/admin/login");
    }
    return session;
  },
};
