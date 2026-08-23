"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  buildMapsUrl,
  hasUsableMapsDestination,
  type MapsDestination,
} from "@/lib/discovery/venue-directions";

interface MapsDirectionsChooserProps {
  destination: MapsDestination;
  className?: string;
}

export function MapsDirectionsChooser({
  destination,
  className,
}: MapsDirectionsChooserProps) {
  const t = useTranslations("mapsDirections");
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const usable = hasUsableMapsDestination(destination);
  const googleUrl = usable ? buildMapsUrl(destination, "google") : "";
  const appleUrl = usable ? buildMapsUrl(destination, "apple") : "";

  useEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  if (!usable) return null;

  return (
    <div className={className}>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-brand-700 shadow-sm transition hover:border-accent-300 hover:text-accent-600"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {t("cta")}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label={t("close")}
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id={titleId} className="text-base font-bold text-slate-900">
                  {t("chooserTitle")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">{t("chooserHint")}</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                onClick={() => setOpen(false)}
              >
                {t("close")}
              </button>
            </div>

            <ul className="space-y-2">
              <li>
                <a
                  href={googleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 transition hover:border-accent-300 hover:bg-white"
                >
                  <span>{t("google")}</span>
                  <span aria-hidden>→</span>
                </a>
              </li>
              <li>
                <a
                  href={appleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-900 transition hover:border-accent-300 hover:bg-white"
                >
                  <span>{t("apple")}</span>
                  <span aria-hidden>→</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
