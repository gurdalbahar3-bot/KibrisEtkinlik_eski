import { AdminPlaceholder } from "@/components/admin/AdminPlaceholder";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import type { AdminMessages } from "@/lib/admin/i18n";

export async function renderAdminPlaceholder(titleKey: keyof AdminMessages) {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);

  return <AdminPlaceholder title={t(titleKey)} t={t} />;
}
