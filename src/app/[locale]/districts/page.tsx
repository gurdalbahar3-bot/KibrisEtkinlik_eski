import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DistrictGrid } from "@/components/home/DistrictGrid";
import { Link } from "@/lib/i18n/navigation";
import { districtsRepository } from "@/lib/data/events";

export const revalidate = 300;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "districtsPage" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function DistrictsIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("districtsPage");
  const districts = await districtsRepository.getAll();

  return (
    <section className="section-container py-10 sm:py-12">
      <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
        ← {t("backHome")}
      </Link>
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 text-slate-600">{t("subtitle")}</p>
      </header>
      <DistrictGrid districts={districts} showHeader={false} />
    </section>
  );
}
