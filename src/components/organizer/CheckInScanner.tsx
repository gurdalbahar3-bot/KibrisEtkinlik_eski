"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import {
  organizerCheckInScanAction,
  type CheckInActionState,
} from "@/app/organizer/(app)/events/check-in-actions";

type Messages = {
  title: string;
  subtitle: string;
  tokenLabel: string;
  tokenPlaceholder: string;
  submit: string;
  scanning: string;
  success: string;
  alreadyUsed: string;
  invalid: string;
  wrongEvent: string;
  cancelled: string;
  revoked: string;
  forbidden: string;
  expired: string;
  notActive: string;
  postponed: string;
  cameraHint: string;
  startCamera: string;
  stopCamera: string;
  cameraUnsupported: string;
};

type Props = {
  eventId: string;
  messages: Messages;
};

const initial: CheckInActionState = {
  success: false,
  errorCode: null,
  scanResult: null,
  ticketId: null,
};

function resultMessage(
  state: CheckInActionState,
  m: Messages
): { tone: "ok" | "warn" | "err"; text: string } | null {
  if (state.success) {
    return { tone: "ok", text: m.success };
  }
  if (!state.errorCode) return null;
  switch (state.errorCode) {
    case "ALREADY_USED":
      return { tone: "warn", text: m.alreadyUsed };
    case "WRONG_EVENT":
      return { tone: "err", text: m.wrongEvent };
    case "CANCELLED":
      return { tone: "err", text: m.cancelled };
    case "REVOKED":
      return { tone: "err", text: m.revoked };
    case "FORBIDDEN":
    case "UNAUTHENTICATED":
      return { tone: "err", text: m.forbidden };
    case "EXPIRED":
      return { tone: "err", text: m.expired };
    case "NOT_ACTIVE":
      return { tone: "err", text: m.notActive };
    case "EVENT_POSTPONED":
      return { tone: "err", text: m.postponed };
    default:
      return { tone: "err", text: m.invalid };
  }
}

export function CheckInScanner({ eventId, messages: m }: Props) {
  const [state, formAction, pending] = useActionState(
    organizerCheckInScanAction,
    initial
  );
  const [token, setToken] = useState("");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const feedback = resultMessage(state, m);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  useEffect(() => {
    if (!cameraOn || !videoRef.current) return;

    let cancelled = false;
    let raf = 0;

    async function start() {
      setCameraError(null);
      // BarcodeDetector is Chromium mobile-friendly; fallback is manual paste.
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (opts: {
            formats: string[];
          }) => {
            detect: (
              source: ImageBitmapSource
            ) => Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;

      if (!Detector) {
        setCameraError(m.cameraUnsupported);
        setCameraOn(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new Detector({ formats: ["qr_code"] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              setToken(value);
              stream.getTracks().forEach((t) => t.stop());
              setCameraOn(false);
              // Submit after state flush
              queueMicrotask(() => formRef.current?.requestSubmit());
              return;
            }
          } catch {
            // keep scanning
          }
          raf = window.setTimeout(tick, 400);
        };
        raf = window.setTimeout(tick, 400);
      } catch {
        setCameraError(m.cameraUnsupported);
        setCameraOn(false);
      }
    }

    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(raf);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [cameraOn, m.cameraUnsupported]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{m.title}</h2>
        <p className="mt-1 text-sm text-slate-600">{m.subtitle}</p>
      </div>

      {feedback ? (
        <p
          className={
            feedback.tone === "ok"
              ? "rounded-xl bg-teal-50 px-4 py-3 text-base font-semibold text-teal-950"
              : feedback.tone === "warn"
                ? "rounded-xl bg-amber-50 px-4 py-3 text-base font-semibold text-amber-950"
                : "rounded-xl bg-red-50 px-4 py-3 text-base font-semibold text-red-900"
          }
          role="status"
          data-testid="checkin-result"
        >
          {feedback.text}
        </p>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="device_id" value="organizer-web" />

        <label htmlFor="token" className="block text-sm font-medium text-slate-700">
          {m.tokenLabel}
        </label>
        <input
          id="token"
          name="token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={m.tokenPlaceholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-xl border border-slate-300 px-3 py-3 font-mono text-sm text-slate-900"
          data-testid="checkin-token"
        />

        <button
          type="submit"
          disabled={pending || !token.trim()}
          className="w-full rounded-xl bg-teal-800 px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
          data-testid="checkin-submit"
        >
          {pending ? m.scanning : m.submit}
        </button>
      </form>

      <div className="space-y-2">
        <p className="text-xs text-slate-500">{m.cameraHint}</p>
        {cameraError ? (
          <p className="text-sm text-amber-800" role="status">
            {cameraError}
          </p>
        ) : null}
        {!cameraOn ? (
          <button
            type="button"
            onClick={() => setCameraOn(true)}
            className="w-full rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900"
          >
            {m.startCamera}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              streamRef.current?.getTracks().forEach((t) => t.stop());
              setCameraOn(false);
            }}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800"
          >
            {m.stopCamera}
          </button>
        )}
        {cameraOn ? (
          <video
            ref={videoRef}
            className="aspect-square w-full rounded-2xl bg-black object-cover"
            muted
            playsInline
          />
        ) : null}
      </div>
    </div>
  );
}
