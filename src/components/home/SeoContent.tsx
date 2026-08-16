"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export function SeoContent() {
  const t = useTranslations("seoContent");
  const [open, setOpen] = useState(false);

  return (
    <section className="border-t border-slate-200 py-10 sm:py-14" aria-labelledby="seo-content-title">
      <div className="section-container max-w-3xl">
        <button
          type="button"
          id="seo-content-title"
          className="flex w-full items-center justify-between gap-4 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="text-xl font-bold text-slate-900 sm:text-2xl">{t("title")}</span>
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {open ? t("collapse") : t("expand")}
          </span>
        </button>

        <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">{t("summary")}</p>

        {open && (
          <div className="mt-6 space-y-4 border-t border-slate-100 pt-6 text-sm leading-relaxed text-slate-600 sm:text-base">
            <p>{t("p1")}</p>
            <p>{t("p2")}</p>
            <p className="rounded-xl bg-brand-50 px-4 py-3 text-brand-900">{t("p3")}</p>
          </div>
        )}
      </div>
    </section>
  );
}
