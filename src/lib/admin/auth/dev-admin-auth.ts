import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AdminAuthPort } from "@/lib/admin/auth/port";
import type { AdminSession } from "@/types/admin/session";

export const ADMIN_SESSION_COOKIE = "ged_admin_dev_session";

const DEV_SESSION_VALUE = "super_admin";

function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

async function readDevSession(): Promise<AdminSession | null> {
  if (!isDevAuthEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_SESSION_COOKIE);

  if (sessionCookie?.value !== DEV_SESSION_VALUE) {
    return null;
  }

  return {
    userId: "dev-super-admin",
    email: "super-admin@dev.local",
    role: "super_admin",
  };
}

/** Development-only auth adapter. Production always returns null until Supabase is wired. */
export const devAdminAuth: AdminAuthPort = {
  async getSession() {
    return readDevSession();
  },

  async isSuperAdmin() {
    const session = await readDevSession();
    return session?.role === "super_admin";
  },

  async requireSuperAdmin() {
    const session = await readDevSession();
    if (!session) {
      redirect("/admin/login");
    }
    return session;
  },
};

export async function setDevAdminSession(): Promise<void> {
  if (!isDevAuthEnabled()) {
    throw new Error("Development admin login is not available in production.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, DEV_SESSION_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    path: "/admin",
    secure: false,
  });
}

export async function clearDevAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}
