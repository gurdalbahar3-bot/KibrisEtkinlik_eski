import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { PosterImage } from "@/components/ui/PosterImage";
import { venuesRepository } from "@/lib/data/events";
export function VenueSection() {
  const t = useTranslations("venuesSection");
  const tDist = useTranslations("districts");
  const tVenueType = useTranslations("venueTypes");
  const tPage = useTranslations("venuesPage");
  const venues = venuesRepository.getAll();

  return (
    <section id="populer-mekanlar" className="bg-slate-50 py-12 sm:py-16" aria-labelledby="venues-title">
      <div className="section-container">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="venues-title" className="section-title">
              {t("title")}
            </h2>
            <p className="section-subtitle">{t("subtitle")}</p>
          </div>
          <Link
            href="/venues"
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            {tPage("viewAll")} →
          </Link>
        </header>

        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 scrollbar-hide sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          {venues.map((venue) => (
            <li key={venue.id} className="w-[min(280px,85vw)] shrink-0 snap-start sm:w-auto">
              <Link
                href={{ pathname: "/venues/[slug]", params: { slug: venue.slug } }}
                className="group block overflow-hidden rounded-2xl bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <div className="relative aspect-[16/10]">
                  <PosterImage
                    src={venue.photo}
                    alt={venue.name}
                    sizes="(max-width: 640px) 85vw, 25vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />                </div>
                <div className="p-4">
                  <h3 className="font-bold text-slate-900 group-hover:text-brand-700">{venue.name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {tDist(venue.district)} · {tVenueType(venue.venueType as "outdoor" | "culture" | "arena" | "beach")}
                  </p>
                  <p className="mt-2 text-xs font-medium text-brand-700">
                    {t("upcoming", { count: venue.upcomingEventCount })}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
