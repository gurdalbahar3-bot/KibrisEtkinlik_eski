import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EventGrid } from "@/components/events/EventGrid";
import { Link } from "@/lib/i18n/navigation";
import { CATEGORY_KEYS } from "@/lib/data/categories";
import { discoveryEventsRepository } from "@/lib/data/discovery-repository";
import type { EventCategory } from "@/types/event";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string; category: string }>;
};

export function generateStaticParams() {
  return CATEGORY_KEYS.map((category) => ({ category }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, category } = await params;
  if (!CATEGORY_KEYS.includes(category as EventCategory)) return {};

  const tCat = await getTranslations({ locale, namespace: "categories" });
  const t = await getTranslations({ locale, namespace: "categoriesPage" });

  return {
    title: t("metaCategoryTitle", { category: tCat(category as EventCategory) }),
    description: t("metaCategoryDescription", { category: tCat(category as EventCategory) }),
  };
}

export default async function CategoryEventsPage({ params }: Props) {
  const { locale, category } = await params;
  setRequestLocale(locale);

  if (!CATEGORY_KEYS.includes(category as EventCategory)) {
    notFound();
  }

  const tCat = await getTranslations("categories");
  const t = await getTranslations("categoriesPage");
  const events = await discoveryEventsRepository.getByCategory(category as EventCategory);

  return (
    <section className="section-container py-10 sm:py-12">
      <Link href="/categories" className="text-sm font-medium text-brand-700 hover:underline">
        ← {t("backCategories")}
      </Link>
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          {tCat(category as EventCategory)}
        </h1>
        <p className="mt-2 text-slate-600">{t("categorySubtitle")}</p>
      </header>
      <EventGrid events={events} />
    </section>
  );
}
