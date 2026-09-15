/** Minimal Google Maps JS API typings used by the venue location picker. */
declare namespace google.maps {
  class Map {
    constructor(el: HTMLElement, opts?: MapOptions);
    setCenter(latLng: LatLng | LatLngLiteral): void;
    setZoom(zoom: number): void;
    getZoom(): number | undefined;
    panTo(latLng: LatLng | LatLngLiteral): void;
    addListener(eventName: string, handler: (...args: never[]) => void): MapsEventListener;
  }

  class Marker {
    constructor(opts?: MarkerOptions);
    setMap(map: Map | null): void;
    setPosition(latLng: LatLng | LatLngLiteral): void;
    getPosition(): LatLng | null | undefined;
    addListener(eventName: string, handler: (...args: never[]) => void): MapsEventListener;
  }

  class LatLng {
    constructor(lat: number, lng: number);
    lat(): number;
    lng(): number;
  }

  class Geocoder {
    geocode(
      request: GeocoderRequest,
      callback: (results: GeocoderResult[] | null, status: string) => void
    ): void;
  }

  interface MapOptions {
    center?: LatLng | LatLngLiteral;
    zoom?: number;
    mapTypeControl?: boolean;
    streetViewControl?: boolean;
    fullscreenControl?: boolean;
    clickableIcons?: boolean;
  }

  interface MarkerOptions {
    map?: Map | null;
    position?: LatLng | LatLngLiteral;
    draggable?: boolean;
    title?: string;
  }

  interface LatLngLiteral {
    lat: number;
    lng: number;
  }

  interface MapsEventListener {
    remove(): void;
  }

  interface GeocoderRequest {
    address?: string;
    componentRestrictions?: { country: string | string[] };
  }

  interface GeocoderResult {
    geometry: { location: LatLng };
  }

  interface MapMouseEvent {
    latLng: LatLng | null;
  }
}

interface Window {
  google?: {
    maps: typeof google.maps;
  };
  __kibrisGoogleMapsInit?: () => void;
}
