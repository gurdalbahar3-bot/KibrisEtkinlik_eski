/** Stable Unsplash URLs — verified format, unique per asset where possible. */
const u = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

export const MEDIA = {
  posters: {
    concertSunset: u("photo-1470229722913-7c0e2dbbafd3"),
    concertCrowd: u("photo-1459747526533-893ba0e338ca"),
    concertStage: u("photo-1506157783521-7a7b8f258397"),
    concertLights: u("photo-1415201364774-47f7d36fbf00"),
    concertDj: u("photo-1514525253161-7a46d19cd819"),
    festivalCrowd: u("photo-1492684223066-81342ee5ff30"),
    festivalStage: u("photo-1429966719638-9aa9847541f4"),
    theater: u("photo-1503090546910-440f8313fe8f"),
    standup: u("photo-1585699321531-68111469b2cf"),
    nightlife: u("photo-1574391884720-bbc3740c8316"),
    sports: u("photo-1452626212852-811d58933fd5"),
    family: u("photo-1503454537195-1dcabb73ffb9"),
    art: u("photo-1460661419201-fd4cecdf8a8b"),
    fallback: u("photo-1492684223066-81342ee5ff30"),
  },
  districts: {
    lefkosa: u("photo-1512453979798-5ea266f8880c"),
    girne: u("photo-1558618666-fcd25c85cd64"),
    gazimagusa: u("photo-1507525428034-b723cf961d3e"),
    guzelyurt: u("photo-1469474968028-56623f02e42e"),
    lefke: u("photo-1501785888041-af3ef285b470"),
    iskele: u("photo-1506905925346-21bda4d32df4"),
  },
  venues: {
    bellapais: u("photo-1558618666-fcd25c85cd64"),
    arabahmet: u("photo-1516450360562-960f9a8b0a8c"),
    longBeach: u("photo-1574391884720-bbc3740c8316"),
    palmBeach: u("photo-1507525428034-b723cf961d3e"),
  },
} as const;
