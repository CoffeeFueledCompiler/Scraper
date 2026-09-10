// Canonical lead shape. Every API route reads/writes this — no ad-hoc field names elsewhere.
export type Lead = {
  name: string;
  // The business's own Google Maps listing — the /maps/place/ URL straight off
  // the result card, so it's a link back to the exact profile that was scraped.
  mapsUrl: string;
  phone: string;
  website: string;
  city: string;
  niche: string;
  rating: string;
  reviews: string;
  email: string;
  observation: string;
  impact: string;
  solution: string;
  status: "" | "ok" | "NEEDS_REVIEW";
  subject: string;
  generatedEmail: string;
};

export const emptyLead = (): Lead => ({
  name: "",
  mapsUrl: "",
  phone: "",
  website: "",
  city: "",
  niche: "",
  rating: "",
  reviews: "",
  email: "",
  observation: "",
  impact: "",
  solution: "",
  status: "",
  subject: "",
  generatedEmail: "",
});

export const leadKey = (l: Pick<Lead, "name" | "city">) => `${l.name}::${l.city}`;

// Google's own permanent identifier for a listing, dug out of its /maps/place/
// URL. Use this for "have we seen this business before", never the display
// name — Google returns the same listing as "d.garrison roofing co inc" on one
// pass and "D.Garrison Roofing Co. Inc." on another, which is how the same
// business ended up scraped twice. Prefers the Place ID (!19sChIJ...) and falls
// back to the hex feature ID (!1s0x…:0x…); "" if the URL isn't a place link.
export function placeIdFromMapsUrl(mapsUrl: string): string {
  if (!mapsUrl) return "";
  return mapsUrl.match(/!19s(ChIJ[\w-]+)/)?.[1] ?? mapsUrl.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/)?.[1] ?? "";
}

// What dedupe actually keys on: the stable Place ID when we have it, the
// display name only as a fallback for rows scraped before mapsUrl existed.
export const dedupeKey = (l: Pick<Lead, "name" | "mapsUrl">) => placeIdFromMapsUrl(l.mapsUrl) || l.name;

// Final export column order/headers, per PROJECT_PLAN.md #2.
export const FINAL_COLUMNS: { header: string; field: keyof Lead }[] = [
  { header: "Google Maps Link", field: "mapsUrl" },
  { header: "Business Name", field: "name" },
  { header: "Email Address", field: "email" },
  { header: "City", field: "city" },
  { header: "Niche", field: "niche" },
  { header: "Average Review", field: "rating" },
  { header: "Total Reviews", field: "reviews" },
  { header: "Specific Observation", field: "observation" },
  { header: "Customer Impact", field: "impact" },
  { header: "Recommended Solution", field: "solution" },
  { header: "Phone Number", field: "phone" },
  { header: "Website", field: "website" },
  { header: "Subject", field: "subject" },
  { header: "Generated Email", field: "generatedEmail" },
];
