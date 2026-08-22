/** Stable Unsplash URLs — verified format, unique per asset where possible. */
const u = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

/** Working category/event placeholder IDs — never district cityscapes. */
const P = {
  concert: "photo-1470229722913-7c0e2dbbafd3",
  festival: "photo-1492684223066-81342ee5ff30",
  dj: "photo-1514525253161-7a46d19cd819",
  family: "photo-1503454537195-1dcabb73ffb9",
  art: "photo-1460661419201-fd4cecdf8a8b",
} as const;

export const MEDIA = {
  posters: {
    concertSunset: u(P.concert),
    /** Concert category placeholder — not district scenery */
    concertCrowd: u(P.concert),
    concertStage: u(P.concert),
    concertLights: u(P.concert),
    concertDj: u(P.dj),
    festivalCrowd: u(P.festival),
    festivalStage: u(P.festival),
    theater: u(P.art),
    standup: u(P.dj),
    nightlife: u(P.dj),
    sports: u(P.family),
    family: u(P.family),
    art: u(P.art),
    fallback: u(P.concert),
  },
  districts: {
    lefkosa: u("photo-1512453979798-5ea266f8880c"),
    girne: u("photo-1558618666-fcd25c85cd64"),
    gazimagusa: u("photo-1507525428034-b723cf961d3e"),
    guzelyurt: u("photo-1469474968028-56623f02e42e"),
    lefke: u("photo-1501785888041-af3ef285b470"),
    iskele: u("photo-1506905925346-21bda4d32df4"),
  },
  /** Venue placeholders — category/event mood, not district cityscapes. */
  venues: {
    bellapais: u(P.festival),
    arabahmet: u(P.art),
    longBeach: u(P.dj),
    palmBeach: u(P.festival),
  },
} as const;
