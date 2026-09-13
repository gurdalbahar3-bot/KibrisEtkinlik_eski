import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
};

/** Reuse existing Super Admin login; keep locale next path for return. */
export default async function LocaleAdminLoginPage({ params, searchParams }: Props) {
  const { locale: localeRaw } = await params;
  const locale = localeRaw === "en" ? "en" : "tr";
  const { next } = await searchParams;
  const fallback = `/${locale}/admin/events`;
  const safeNext =
    next &&
    (next === fallback || next.startsWith(`/${locale}/admin/`)) &&
    !next.startsWith("//") &&
    !next.includes("://")
      ? next
      : fallback;
  redirect(`/admin/login?next=${encodeURIComponent(safeNext)}`);
}
