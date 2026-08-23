import type { AdminMessages } from "@/lib/admin/i18n";
import { IMAGE_POLICY_EXAMPLE } from "@/types/admin/image-policy";

interface AdminImagePolicyBannerProps {
  t: (key: keyof AdminMessages) => string;
}

export function AdminImagePolicyBanner({ t }: AdminImagePolicyBannerProps) {
  return (
    <aside
      className="rounded-xl border border-brand-200 bg-brand-50/80 p-4 text-sm text-slate-700"
      aria-label={t("imagePolicyTitle")}
    >
      <h2 className="font-semibold text-brand-900">{t("imagePolicyTitle")}</h2>
      <p className="mt-2 font-medium text-brand-800">{t("imagePolicySteps")}</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-slate-600">
        <li>{t("imagePolicyNoRandom")}</li>
        <li>{t("imagePolicyAiRule")}</li>
        <li>{t("imagePolicyExample")}</li>
      </ul>
      <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-500">
        {IMAGE_POLICY_EXAMPLE.eventTitle}: {IMAGE_POLICY_EXAMPLE.eventDistrictId} ≠{" "}
        {IMAGE_POLICY_EXAMPLE.invalidImageDistrictId} → BLOCKED
      </p>
    </aside>
  );
}
