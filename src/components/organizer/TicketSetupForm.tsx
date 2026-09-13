"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  saveTicketSetupAction,
  type ActionState,
} from "@/app/[locale]/organizer/actions";

const initialState: ActionState = { ok: false };

type Props = {
  eventId: string;
  zoneId?: string;
  ticketTypeId?: string;
  defaultZoneName?: string;
  defaultCapacity?: number;
  defaultTicketName?: string;
  defaultPrice?: number;
};

export function TicketSetupForm({
  eventId,
  zoneId,
  ticketTypeId,
  defaultZoneName = "",
  defaultCapacity,
  defaultTicketName = "",
  defaultPrice,
}: Props) {
  const t = useTranslations("organizer");
  const tErrors = useTranslations("organizerErrors");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(
    saveTicketSetupAction,
    initialState
  );

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="event_id" value={eventId} />
      {zoneId ? <input type="hidden" name="zone_id" value={zoneId} /> : null}
      {ticketTypeId ? (
        <input type="hidden" name="ticket_type_id" value={ticketTypeId} />
      ) : null}

      <div>
        <h3 className="font-semibold text-slate-900">{t("ticketZoneHeading")}</h3>
        <p className="mt-1 text-xs text-slate-500">{t("ticketZoneHint")}</p>
      </div>

      <div>
        <label htmlFor="zone_name" className="mb-1 block text-sm font-medium text-slate-700">
          {t("fieldZoneName")}
        </label>
        <input
          id="zone_name"
          name="zone_name"
          required
          defaultValue={defaultZoneName}
          className="field-input"
        />
      </div>

      <div>
        <label htmlFor="capacity" className="mb-1 block text-sm font-medium text-slate-700">
          {t("fieldCapacity")}
        </label>
        <input
          id="capacity"
          name="capacity"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={defaultCapacity ?? ""}
          className="field-input"
        />
      </div>

      <div className="border-t border-slate-100 pt-4">
        <h3 className="font-semibold text-slate-900">{t("ticketTypeHeading")}</h3>
        <p className="mt-1 text-xs text-slate-500">{t("ticketTypeHint")}</p>
      </div>

      <div>
        <label htmlFor="ticket_name" className="mb-1 block text-sm font-medium text-slate-700">
          {t("fieldTicketName")}
        </label>
        <input
          id="ticket_name"
          name="ticket_name"
          required
          defaultValue={defaultTicketName}
          className="field-input"
        />
      </div>

      <div>
        <label htmlFor="price" className="mb-1 block text-sm font-medium text-slate-700">
          {t("fieldPriceTry")}
        </label>
        <input
          id="price"
          name="price"
          type="number"
          min={0}
          step="0.01"
          required
          defaultValue={defaultPrice ?? ""}
          className="field-input"
        />
      </div>

      {state.errorCode ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
          {tErrors.has(state.errorCode)
            ? tErrors(state.errorCode)
            : state.message || tErrors("GENERIC")}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary w-full disabled:opacity-60">
        {pending ? t("savingTickets") : t("saveTickets")}
      </button>
    </form>
  );
}
