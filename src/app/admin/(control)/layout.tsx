import { logoutAdminAction } from "@/app/admin/login/actions";
import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminAuth } from "@/lib/admin/auth";
import { getAdminMessages, resolveAdminLocale } from "@/lib/admin/i18n";

export default async function AdminControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = getAdminAuth();
  await auth.requireSuperAdmin();

  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);

  return (
    <AdminShell messages={messages} logoutAction={logoutAdminAction}>
      {children}
    </AdminShell>
  );
}
