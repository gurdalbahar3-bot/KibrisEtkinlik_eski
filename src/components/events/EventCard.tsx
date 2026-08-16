import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { PosterImage } from "@/components/ui/PosterImage";
import { formatEventDate } from "@/lib/seo/jsonld";
import type { DiscoveryEvent } from "@/types/event";

interface EventCardProps {
  event: DiscoveryEvent;
  priority?: boolean;
}

export function EventCard({ event, priority = false }: EventCardProps) {
  const t = useTranslations("eventCard");
  const tCat = useTranslations("categories");
  const tDist = useTranslations("districts");
  const locale = useLocale() as "tr" | "en";
  const { day, month, weekday } = formatEventDate(event.date, locale);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-card-hover">
      <Link
        href={{ pathname: "/events/[slug]", params: { slug: event.slug } }}
        className="relative block aspect-[4/5] overflow-hidden"
      >
        <PosterImage
          src={event.poster}
          alt={event.title}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className="object-cover transition duration-500 group-hover:scale-105"
          priority={priority}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        {event.isFree && (
          <span className="absolute left-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow">
            {t("free")}
          </span>
        )}
        <div className="absolute bottom-3 left-3 right-3">
          <p className="text-xs font-bold uppercase tracking-widest text-white">
            {day} {month}
          </p>
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/80">
            {weekday} · {event.startTime}
          </p>
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <Link
          href={{ pathname: "/events/[slug]", params: { slug: event.slug } }}
          className="group/title flex items-start justify-between gap-2"
        >
          <h3 className="line-clamp-2 text-base font-bold leading-snug text-slate-900 group-hover/title:text-brand-700">
            {event.title}
          </h3>
          <span
            className="mt-0.5 shrink-0 text-brand-600 opacity-0 transition group-hover:opacity-100"
            aria-hidden
          >
            →
          </span>
        </Link>
        {event.artist && (
          <p className="line-clamp-1 text-xs font-medium text-slate-500">{event.artist}</p>
        )}
        <p className="line-clamp-1 text-sm text-slate-600">
          {event.venue}
          <span className="text-slate-400"> · </span>
          {tDist(event.district)}
        </p>
        <div className="mt-auto pt-2">
          <span className="inline-flex rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            {tCat(event.category)}
          </span>
        </div>
      </div>
    </article>
  );
}
