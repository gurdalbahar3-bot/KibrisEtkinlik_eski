import type { ComponentProps } from "react";
import { Link } from "@/lib/i18n/navigation";

type LinkHref = ComponentProps<typeof Link>["href"];

interface SectionHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  titleId?: string;
  cta?: { href: LinkHref; label: string };
  variant?: "light" | "dark";
  className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  titleId,
  cta,
  variant = "light",
  className = "",
}: SectionHeaderProps) {
  const isDark = variant === "dark";

  return (
    <header className={`flex flex-wrap items-end justify-between gap-5 sm:gap-6 ${className}`}>
      <div className="max-w-2xl">
        {eyebrow && (
          <p
            className={`mb-2 text-[11px] font-bold uppercase tracking-[0.22em] ${
              isDark ? "text-accent-400" : "text-accent-500"
            }`}
          >
            {eyebrow}
          </p>
        )}
        <h2
          id={titleId}
          className={`text-balance font-extrabold tracking-tight sm:text-4xl lg:text-[2.35rem] lg:leading-[1.12] ${
            isDark ? "text-white" : "text-platform-navy"
          } text-3xl`}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            className={`mt-2 max-w-xl text-balance text-base sm:mt-3 sm:text-lg ${
              isDark ? "text-white/70" : "text-slate-600"
            }`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {cta && (
        <Link
          href={cta.href}
          className={`inline-flex min-h-11 shrink-0 items-center rounded-full px-5 text-sm font-semibold transition ${
            isDark
              ? "border border-white/20 bg-white/10 text-white hover:bg-white/20"
              : "border border-slate-200 bg-white text-brand-700 shadow-sm hover:border-accent-300 hover:text-accent-600"
          }`}
        >
          {cta.label} →
        </Link>
      )}
    </header>
  );
}
