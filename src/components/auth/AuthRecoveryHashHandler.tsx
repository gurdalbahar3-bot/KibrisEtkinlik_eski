"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { establishRecoverySessionAction } from "@/lib/auth/password-recovery-actions";
import {
  isSafePasswordResetReturnTo,
  passwordResetPath,
} from "@/lib/auth/password-recovery";

/**
 * Catches implicit Supabase recovery redirects that land on Site URL with
 * `#access_token=…&refresh_token=…&type=recovery` (hash is invisible to the server).
 * Preserves allowlisted `returnTo` from the current query string when present.
 * Does not interfere with customer/organizer password login forms.
 */
export function AuthRecoveryHashHandler({ locale }: { locale: string }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (typeof window === "undefined") return;

    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : "";
    if (!raw) return;

    const params = new URLSearchParams(raw);
    if (params.get("type") !== "recovery") return;

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (!accessToken || !refreshToken) return;

    started.current = true;

    const search = new URLSearchParams(window.location.search);
    const returnToRaw = search.get("returnTo");
    const returnTo = isSafePasswordResetReturnTo(returnToRaw) ? returnToRaw : null;
    const returnQuery = returnTo
      ? `?returnTo=${encodeURIComponent(returnTo)}`
      : "";

    void (async () => {
      const result = await establishRecoverySessionAction({
        locale,
        accessToken,
        refreshToken,
      });

      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`
      );

      if (result.ok) {
        router.replace(`${passwordResetPath(locale)}${returnQuery}`);
      } else {
        router.replace(
          `${passwordResetPath(locale)}${
            returnQuery ? `${returnQuery}&error=recovery` : "?error=recovery"
          }`
        );
      }
    })();
  }, [locale, router]);

  return null;
}
