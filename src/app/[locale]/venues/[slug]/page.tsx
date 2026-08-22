import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EventGrid } from "@/components/events/EventGrid";
import { Link } from "@/lib/i18n/navigation";
import { eventsRepository, venuesRepository } from "@/lib/data/events";
import { queryVenueSlugs } from "@/lib/supabase/queries/discovery";

export const revalidate = 300;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateStaticParams() {
  try {
    const slugs = await queryVenueSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const venue = await venuesRepository.getBySlug(slug);
  if (!venue) return {};
  return {
    title: `${venue.name} | Global Event Discovery`,
    description: locale === "tr"
      ? `${venue.name} mekanındaki yaklaşan etkinlikler.`
      : `Upcoming events at ${venue.name}.`,
  };
}

export default async function VenueDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const venue = await venuesRepository.getBySlug(slug);
  if (!venue) notFound();

  const t = await getTranslations("venuesPage");
  const tDist = await getTranslations("districts");
  const tVenueType = await getTranslations("venueTypes");
  const events = await eventsRepository.getByVenueSlug(slug);

  return (
    <section className="section-container py-10 sm:py-12">
      <Link href="/venues" className="text-sm font-medium text-brand-700 hover:underline">
        ← {t("backVenues")}
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl shadow-card">
          <Image src={venue.photo} alt={venue.name} fill className="object-cover" priority />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{venue.name}</h1>
          <p className="mt-3 text-slate-600">
            {tDist(venue.district)} · {tVenueType(venue.venueType as "outdoor" | "culture" | "arena" | "beach")}
          </p>
          <p className="mt-2 text-sm font-medium text-brand-700">
            {t("upcoming", { count: venue.upcomingEventCount })}
          </p>
        </div>
      </div>

      <h2 className="mb-6 mt-12 text-2xl font-bold text-slate-900">{t("eventsAtVenue")}</h2>
      {events.length > 0 ? (
        <EventGrid events={events} />
      ) : (
        <p className="text-slate-500">{t("noEvents")}</p>
      )}
    </section>
  );
}
