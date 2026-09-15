import { setOrganizerEventOfficialTicketUrlAction } from "@/app/organizer/(app)/events/actions";
import { OrganizerSubmitButton } from "@/components/organizer/OrganizerSubmitButton";
import type { OrganizerMessages } from "@/lib/organizer/i18n";

type TFn = (key: keyof OrganizerMessages) => string;

type Props = {
  eventId: string;
  isDraft: boolean;
  officialTicketUrl: string | null;
  t: TFn;
  ticketOk: boolean;
  ticketError: string | null;
};

function mapTicketError(error: string | null, t: TFn): string | null {
  if (!error) return null;
  switch (error) {
    case "not_draft":
      return t("errTicketNotDraft");
    case "not_found":
    case "event_not_found":
      return t("errEventNotFound");
    case "forbidden":
      return t("errForbidden");
    case "invalid_url":
      return t("errTicketInvalidUrl");
    case "unauthenticated":
      return t("errForbidden");
    default:
      return t("errTicketSaveFailed");
  }
}

export function OfficialTicketUrlPanel({
  eventId,
  isDraft,
  officialTicketUrl,
  t,
  ticketOk,
  ticketError,
}: Props) {
  const errorMessage = mapTicketError(ticketError, t);

  return (
    <section
      className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      data-testid="official-ticket-section"
    >
      <div>
        <h3 className="font-semibold text-slate-900">{t("ticketUrlTitle")}</h3>
        <p className="text-sm text-slate-600">{t("ticketUrlSubtitle")}</p>
      </div>

      {ticketOk ? (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900" role="status">
          {t("msgTicketSaved")}
        </p>
      ) : null}
      {errorMessage ? (
        <p
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
          data-testid="official-ticket-error"
        >
          {errorMessage}
        </p>
      ) : null}

      {isDraft ? (
        <form
          action={setOrganizerEventOfficialTicketUrlAction}
          className="space-y-3"
          data-testid="official-ticket-form"
        >
          <input type="hidden" name="event_id" value={eventId} />
          <div>
            <label
              htmlFor="official_ticket_url"
              className="block text-sm font-medium text-slate-700"
            >
              {t("fieldOfficialTicketUrl")}
            </label>
            <input
              id="official_ticket_url"
              name="official_ticket_url"
              type="text"
              inputMode="url"
              defaultValue={officialTicketUrl ?? ""}
              placeholder="https://"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              data-testid="official-ticket-input"
            />
            <p className="mt-1 text-xs text-slate-500">{t("ticketUrlHint")}</p>
          </div>
          <OrganizerSubmitButton
            label={t("ticketUrlSave")}
            pendingLabel={t("ticketUrlSaving")}
            variant="secondary"
          />
        </form>
      ) : (
        <div data-testid="official-ticket-readonly">
          <p className="text-sm text-slate-900 break-all">
            {officialTicketUrl ? (
              <a
                href={officialTicketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-teal-800 hover:underline"
                data-testid="official-ticket-readonly-value"
              >
                {officialTicketUrl}
              </a>
            ) : (
              <span className="text-slate-500" data-testid="official-ticket-readonly-empty">
                {t("ticketUrlEmpty")}
              </span>
            )}
          </p>
          <p className="mt-2 text-xs text-slate-500">{t("ticketUrlReadOnlyHint")}</p>
        </div>
      )}
    </section>
  );
}
