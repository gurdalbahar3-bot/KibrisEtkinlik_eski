import type { AdminMessages } from "@/lib/admin/i18n";

interface PublishFeedbackProps {
  success: boolean;
  error?: string;
  t: (key: keyof AdminMessages) => string;
}

export function PublishFeedback({ success, error, t }: PublishFeedbackProps) {
  if (error) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-900"
      >
        {t("publishEventError")}: {error}
      </p>
    );
  }

  if (!success) {
    return null;
  }

  return (
    <p
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
    >
      {t("publishEventSuccess")}
    </p>
  );
}
