import { notFound } from "next/navigation";

import { OrumcekDraftDetailView } from "@/components/admin/OrumcekDraftDetailView";
import {
  createAdminTranslator,
  getAdminMessages,
  resolveAdminLocale,
} from "@/lib/admin/i18n";
import { getDraftById, getObservationsForDraft } from "@/lib/orumcek/store";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminOrumcekDraftDetailPage({ params }: Props) {
  const { id } = await params;
  const locale = await resolveAdminLocale();
  const messages = getAdminMessages(locale);
  const t = createAdminTranslator(messages);
  const draft = getDraftById(id);
  if (!draft) {
    notFound();
  }

  return (
    <OrumcekDraftDetailView
      draft={draft}
      observations={getObservationsForDraft(draft)}
      locale={locale}
      t={t}
    />
  );
}
