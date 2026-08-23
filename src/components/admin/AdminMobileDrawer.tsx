"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AdminSidebarNav } from "@/components/admin/AdminSidebarNav";
import { useAdminT } from "@/components/admin/AdminI18nProvider";

interface AdminMobileDrawerProps {
  title: string;
  logoutLabel: string;
  logoutAction: () => Promise<void>;
}

export function AdminMobileDrawer({ title, logoutLabel, logoutAction }: AdminMobileDrawerProps) {
  const [open, setOpen] = useState(false);
  const t = useAdminT();
  const dialogId = useId();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const focusableSelector =
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    focusablesFirst();

    function focusablesFirst() {
      dialogRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    }

    const trigger = triggerRef.current;

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-700 text-slate-200 lg:hidden"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => setOpen(true)}
      >
        <span className="sr-only">{t("navMenu")}</span>
        <span aria-hidden className="text-lg">
          ☰
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label={t("closeMenu")}
            onClick={() => setOpen(false)}
          />
          <div
            ref={dialogRef}
            id={dialogId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-y-0 left-0 flex w-[min(100%,20rem)] flex-col bg-slate-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <p id={titleId} className="font-semibold text-white">
                {title}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label={t("closeMenu")}
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <AdminSidebarNav />
            </div>
            <form action={logoutAction} className="border-t border-slate-800 p-3">
              <button
                type="submit"
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-700 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                {logoutLabel}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
