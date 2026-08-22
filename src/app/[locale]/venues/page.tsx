import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PosterImage } from "@/components/ui/PosterImage";
import { Link } from "@/lib/i18n/navigation";
import { discoveryVenuesRepository } from "@/lib/data/discovery-repository";
import { getVenueImage, getVenueImageSources } from "@/lib/ui/venue-image";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "venuesPage" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function VenuesListingPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("venuesPage");
  const tDist = await getTranslations("districts");
  const tVenueType = await getTranslations("venueTypes");

  const raw = await searchParams;
  const q = typeof raw.q === "string" ? raw.q.trim() : "";
  const venues = q
    ? await discoveryVenuesRepository.searchByName(q)
    : await discoveryVenuesRepository.getAll();

  return (
    <section className="section-container py-10 sm:py-12">
      <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
        ← {t("backHome")}
      </Link>
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 text-slate-600">{t("subtitle")}</p>
        {q && (
          <p className="mt-2 text-sm text-slate-500">
            {t("searchResults", { query: q, count: venues.length })}
          </p>
        )}
      </header>

      {venues.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
          <p className="text-lg font-medium text-slate-700">{t("emptyTitle")}</p>
          <p className="mt-2 text-sm text-slate-500">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {venues.map((venue) => {
            const imageSrc = venue.photo?.trim() ? getVenueImage(venue) : "";
            const fallbackSources = venue.photo?.trim()
              ? getVenueImageSources(venue).filter((url) => url !== imageSrc)
              : [];
            return (
              <li key={venue.id}>
                <Link
                  href={{ pathname: "/venues/[slug]", params: { slug: venue.slug } }}
                  className="group block overflow-hidden rounded-2xl bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-card-hover"
                >
                  <div className="relative aspect-[16/10]">
                    <PosterImage
                      src={imageSrc}
                      fallbackSources={fallbackSources}
                      alt={venue.name}
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <h2 className="font-bold text-slate-900 group-hover:text-brand-700">{venue.name}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {tDist(venue.district)} ·{" "}
                      {tVenueType(venue.venueType as "outdoor" | "culture" | "arena" | "beach")}
                    </p>
                    <p className="mt-2 text-xs font-medium text-brand-700">
                      {t("upcoming", { count: venue.upcomingEventCount })}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
