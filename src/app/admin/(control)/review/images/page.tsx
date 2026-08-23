import { AdminImagePolicyBanner } from "@/components/admin/AdminImagePolicyBanner";
import { ImageReviewQueue } from "@/components/admin/ImageReviewQueue";
import {
  approveImageFormAction,
  rejectImageFormAction,
} from "@/lib/admin/intake-actions";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { mockAdminIntakeRepository } from "@/lib/admin/repositories/mock-admin-intake-repository";

export default async function AdminImageReviewPage() {
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const intakes = mockAdminIntakeRepository.getByStatus("IMAGE_REVIEW");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t("imageReview")}</h1>
        <p className="mt-1 text-sm text-slate-600">{t("imageReviewSubtitle")}</p>
      </header>
      <AdminImagePolicyBanner t={t} />
      <ImageReviewQueue
        intakes={intakes}
        locale={locale}
        t={t}
        approveAction={approveImageFormAction}
        rejectAction={rejectImageFormAction}
      />
    </div>
  );
}
