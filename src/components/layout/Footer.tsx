import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";

export function Footer() {
  const t = useTranslations("footer");
  const tMeta = useTranslations("meta");
  const tNav = useTranslations("nav");

  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300">
      <div className="section-container grid gap-10 py-12 md:grid-cols-3">
        <div>
          <p className="text-lg font-semibold text-white">{tMeta("siteName")}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("tagline")}</p>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t("discover")}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/events" className="hover:text-white">
                {tNav("events")}
              </Link>
            </li>
            <li>
              <Link href="/venues" className="hover:text-white">
                {tNav("venues")}
              </Link>
            </li>
            <li>
              <Link href="/categories" className="hover:text-white">
                {tNav("categories")}
              </Link>
            </li>
            <li>
              <Link href="/districts" className="hover:text-white">
                {tNav("districts")}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t("about")}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">{t("aboutText")}</p>
        </div>
      </div>

      <div className="border-t border-slate-800">
        <div className="section-container py-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {tMeta("siteName")}. {t("rights")}
        </div>
      </div>
    </footer>
  );
}
