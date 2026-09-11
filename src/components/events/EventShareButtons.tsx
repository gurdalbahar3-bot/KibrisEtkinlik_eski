"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type Props = {
  url: string;
  title: string;
};

export function EventShareButtons({ url, title }: Props) {
  const t = useTranslations("eventShare");
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${title} — ${url}`);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      className="mt-8 rounded-2xl border border-slate-100 bg-white p-5 shadow-card"
      aria-labelledby="event-share-title"
      data-testid="event-share"
    >
      <h2
        id="event-share-title"
        className="text-sm font-semibold uppercase tracking-wide text-slate-500"
      >
        {t("title")}
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodedText}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          {t("whatsapp")}
        </a>
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          {t("facebook")}
        </a>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          {copied ? t("copied") : t("copyForInstagram")}
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          {copied ? t("copied") : t("copyForTiktok")}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">{t("hint")}</p>
    </section>
  );
}
