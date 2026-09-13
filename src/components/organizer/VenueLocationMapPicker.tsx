"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  CYPRUS_MAP_CENTER,
  CYPRUS_MAP_ZOOM,
  VENUE_PIN_ZOOM,
  formatCoordinate,
  isGoogleMapsBrowserConfigured,
  loadGoogleMapsJsApi,
  parseCoordinate,
} from "@/lib/maps/google-maps-loader";

export type VenueLocationMapPickerLabels = {
  latitude: string;
  longitude: string;
  coordsHint: string;
  selectOnMap: string;
  clearLocation: string;
  locateFromAddress: string;
  mapUnavailable: string;
  mapLoading: string;
  mapReadyHint: string;
  geocodeEmpty: string;
  geocodeFailed: string;
};

type Props = {
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  /** Optional address hint for initial geocode when coords are missing. */
  addressHint?: string | null;
  labels: VenueLocationMapPickerLabels;
};

type Coords = { lat: number; lng: number };

function toInitialCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Coords | null {
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return { lat: latitude, lng: longitude };
}

export function VenueLocationMapPicker({
  initialLatitude = null,
  initialLongitude = null,
  addressHint = null,
  labels,
}: Props) {
  const mapConfigured = isGoogleMapsBrowserConfigured();
  const mapDomId = useId().replace(/:/g, "");
  const mapHostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const mapsApiRef = useRef<typeof google.maps | null>(null);
  const geocodeAttemptedRef = useRef(false);
  const initialCoordsRef = useRef(toInitialCoords(initialLatitude, initialLongitude));

  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "ready" | "error">(
    mapConfigured ? "loading" : "idle"
  );
  const [geocodeStatus, setGeocodeStatus] = useState<"idle" | "empty" | "failed" | "ok">(
    "idle"
  );
  const [latInput, setLatInput] = useState(
    initialLatitude != null && Number.isFinite(initialLatitude)
      ? formatCoordinate(initialLatitude)
      : ""
  );
  const [lngInput, setLngInput] = useState(
    initialLongitude != null && Number.isFinite(initialLongitude)
      ? formatCoordinate(initialLongitude)
      : ""
  );

  function readAddressHintFromForm(): string {
    const form = mapHostRef.current?.closest("form");
    if (!form) return addressHint?.trim() ?? "";
    const address = (
      form.elements.namedItem("address") as HTMLInputElement | null
    )?.value?.trim();
    const city = (form.elements.namedItem("city") as HTMLInputElement | null)?.value?.trim();
    const region = (
      form.elements.namedItem("region") as HTMLInputElement | null
    )?.value?.trim();
    const fromForm = [address, city, region].filter(Boolean).join(", ");
    return fromForm || addressHint?.trim() || "";
  }

  const applyCoords = useCallback(
    (next: Coords | null, centerMap: boolean) => {
      if (next) {
        setLatInput(formatCoordinate(next.lat));
        setLngInput(formatCoordinate(next.lng));
      } else {
        setLatInput("");
        setLngInput("");
      }

      const map = mapRef.current;
      const maps = mapsApiRef.current;
      if (!map || !maps) return;

      if (!next) {
        markerRef.current?.setMap(null);
        markerRef.current = null;
        return;
      }

      if (!markerRef.current) {
        markerRef.current = new maps.Marker({
          map,
          position: next,
          draggable: true,
          title: labels.selectOnMap,
        });
        markerRef.current.addListener("dragend", (() => {
          const position = markerRef.current?.getPosition();
          if (!position) return;
          applyCoords({ lat: position.lat(), lng: position.lng() }, false);
        }) as (...args: never[]) => void);
      } else {
        markerRef.current.setPosition(next);
        markerRef.current.setMap(map);
      }

      if (centerMap) {
        map.panTo(next);
        const zoom = map.getZoom() ?? CYPRUS_MAP_ZOOM;
        if (zoom < VENUE_PIN_ZOOM - 2) {
          map.setZoom(VENUE_PIN_ZOOM);
        }
      }
    },
    [labels.selectOnMap]
  );

  function geocodeAddress(query: string) {
    const maps = mapsApiRef.current;
    if (!maps || !query) {
      setGeocodeStatus(query ? "failed" : "empty");
      return;
    }
    const geocoder = new maps.Geocoder();
    geocoder.geocode(
      {
        address: `${query}, Cyprus`,
        componentRestrictions: { country: "CY" },
      },
      (results, status) => {
        if (status !== "OK" || !results?.[0]) {
          setGeocodeStatus("failed");
          return;
        }
        const location = results[0].geometry.location;
        applyCoords({ lat: location.lat(), lng: location.lng() }, true);
        setGeocodeStatus("ok");
      }
    );
  }

  useEffect(() => {
    if (!mapConfigured) return;
    let cancelled = false;
    const listeners: google.maps.MapsEventListener[] = [];

    setMapStatus("loading");
    loadGoogleMapsJsApi()
      .then((maps) => {
        if (cancelled || !mapHostRef.current) return;
        mapsApiRef.current = maps;

        const existing = initialCoordsRef.current;
        const map = new maps.Map(mapHostRef.current, {
          center: existing ?? CYPRUS_MAP_CENTER,
          zoom: existing ? VENUE_PIN_ZOOM : CYPRUS_MAP_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
        });
        mapRef.current = map;

        listeners.push(
          map.addListener("click", ((event: google.maps.MapMouseEvent) => {
            if (!event.latLng) return;
            applyCoords({ lat: event.latLng.lat(), lng: event.latLng.lng() }, true);
          }) as (...args: never[]) => void)
        );

        if (existing) {
          applyCoords(existing, true);
        } else if (addressHint?.trim() && !geocodeAttemptedRef.current) {
          geocodeAttemptedRef.current = true;
          const geocoder = new maps.Geocoder();
          geocoder.geocode(
            {
              address: `${addressHint.trim()}, Cyprus`,
              componentRestrictions: { country: "CY" },
            },
            (results, status) => {
              if (cancelled || status !== "OK" || !results?.[0]) return;
              const location = results[0].geometry.location;
              applyCoords({ lat: location.lat(), lng: location.lng() }, true);
            }
          );
        }

        setMapStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setMapStatus("error");
      });

    return () => {
      cancelled = true;
      listeners.forEach((listener) => listener.remove());
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, [mapConfigured, addressHint, applyCoords]);

  function onManualLatChange(value: string) {
    setLatInput(value);
    const lat = parseCoordinate(value);
    const lng = parseCoordinate(lngInput);
    if (lat == null || lng == null) {
      applyCoords(null, false);
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    applyCoords({ lat, lng }, true);
  }

  function onManualLngChange(value: string) {
    setLngInput(value);
    const lat = parseCoordinate(latInput);
    const lng = parseCoordinate(value);
    if (lat == null || lng == null) {
      applyCoords(null, false);
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    applyCoords({ lat, lng }, true);
  }

  function clearLocation() {
    applyCoords(null, false);
    if (mapRef.current) {
      mapRef.current.setCenter(CYPRUS_MAP_CENTER);
      mapRef.current.setZoom(CYPRUS_MAP_ZOOM);
    }
  }

  function focusMapForSelection() {
    mapHostRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    mapHostRef.current?.focus();
  }

  return (
    <div className="space-y-3" data-testid="venue-location-map-picker">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="latitude" className="block text-sm font-medium text-slate-700">
            {labels.latitude}
          </label>
          <input
            id="latitude"
            name="latitude"
            type="number"
            step="0.000001"
            value={latInput}
            onChange={(event) => onManualLatChange(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            inputMode="decimal"
          />
        </div>
        <div>
          <label htmlFor="longitude" className="block text-sm font-medium text-slate-700">
            {labels.longitude}
          </label>
          <input
            id="longitude"
            name="longitude"
            type="number"
            step="0.000001"
            value={lngInput}
            onChange={(event) => onManualLngChange(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            inputMode="decimal"
          />
        </div>
      </div>
      <p className="text-xs text-slate-500">{labels.coordsHint}</p>

      {mapConfigured ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={focusMapForSelection}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50"
              data-testid="venue-map-select"
            >
              {labels.selectOnMap}
            </button>
            <button
              type="button"
              disabled={mapStatus !== "ready"}
              onClick={() => geocodeAddress(readAddressHintFromForm())}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-teal-200 bg-white px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="venue-map-geocode"
            >
              {labels.locateFromAddress}
            </button>
            <button
              type="button"
              onClick={clearLocation}
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              data-testid="venue-map-clear"
            >
              {labels.clearLocation}
            </button>
          </div>

          {mapStatus === "loading" ? (
            <p className="text-xs text-slate-500" role="status">
              {labels.mapLoading}
            </p>
          ) : null}
          {mapStatus === "error" ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
              {labels.mapUnavailable}
            </p>
          ) : null}
          {mapStatus === "ready" ? (
            <p className="text-xs text-slate-500">{labels.mapReadyHint}</p>
          ) : null}
          {geocodeStatus === "empty" ? (
            <p className="text-xs text-amber-800" role="status">
              {labels.geocodeEmpty}
            </p>
          ) : null}
          {geocodeStatus === "failed" ? (
            <p className="text-xs text-amber-800" role="status">
              {labels.geocodeFailed}
            </p>
          ) : null}

          <div
            id={`venue-map-${mapDomId}`}
            ref={mapHostRef}
            tabIndex={0}
            className="h-64 w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 sm:h-80"
            data-testid="venue-map-canvas"
            aria-label={labels.selectOnMap}
          />
        </div>
      ) : (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950"
          role="status"
          data-testid="venue-map-key-missing"
        >
          {labels.mapUnavailable}
        </p>
      )}
    </div>
  );
}
