import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { Link } from "@/lib/i18n/navigation";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "categoriesPage" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function CategoriesIndexPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("categoriesPage");

  return (
    <section className="section-container py-10 sm:py-12">
      <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
        ← {t("backHome")}
      </Link>
      <header className="mb-8 mt-4">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">{t("title")}</h1>
        <p className="mt-2 text-slate-600">{t("subtitle")}</p>
      </header>
      <CategoryGrid showHeader={false} />
    </section>
  );
}
