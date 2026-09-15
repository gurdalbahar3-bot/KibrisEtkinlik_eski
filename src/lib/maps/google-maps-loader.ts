/**
 * Loads the Google Maps JavaScript API once (Maps JavaScript API).
 * Requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — never hardcode a key.
 */

const SCRIPT_ID = "kibris-google-maps-js";

export function getGoogleMapsBrowserApiKey(): string | null {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

export function isGoogleMapsBrowserConfigured(): boolean {
  return getGoogleMapsBrowserApiKey() !== null;
}

let loadPromise: Promise<typeof google.maps> | null = null;

export function loadGoogleMapsJsApi(): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"));
  }

  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (loadPromise) {
    return loadPromise;
  }

  const apiKey = getGoogleMapsBrowserApiKey();
  if (!apiKey) {
    return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not set"));
  }

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.google?.maps) resolve(window.google.maps);
        else reject(new Error("Google Maps failed to initialize"));
      });
      existing.addEventListener("error", () =>
        reject(new Error("Google Maps script failed to load"))
      );
      return;
    }

    const callbackName = "__kibrisGoogleMapsInit";
    window[callbackName] = () => {
      delete window[callbackName];
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error("Google Maps failed to initialize"));
    };

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&callback=${callbackName}&loading=async`;
    script.onerror = () => {
      loadPromise = null;
      delete window[callbackName];
      reject(new Error("Google Maps script failed to load"));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

/** Default Cyprus / KKTC overview center when no coordinates exist. */
export const CYPRUS_MAP_CENTER = { lat: 35.1856, lng: 33.3823 } as const;
export const CYPRUS_MAP_ZOOM = 9;
export const VENUE_PIN_ZOOM = 15;

export function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

export function parseCoordinate(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}
