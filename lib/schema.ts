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
  email: "",
  observation: "",
  impact: "",
  solution: "",
  status: "",
  subject: "",
  generatedEmail: "",
});

export const leadKey = (l: Pick<Lead, "name" | "city">) => `${l.name}::${l.city}`;

// Final export column order/headers, per PROJECT_PLAN.md #2.
export const FINAL_COLUMNS: { header: string; field: keyof Lead }[] = [
  { header: "Google Maps Link", field: "mapsUrl" },
  { header: "Business Name", field: "name" },
  { header: "Email Address", field: "email" },
  { header: "City", field: "city" },
  { header: "Niche", field: "niche" },
  { header: "Average Review", field: "rating" },
  { header: "Specific Observation", field: "observation" },
  { header: "Customer Impact", field: "impact" },
  { header: "Recommended Solution", field: "solution" },
  { header: "Phone Number", field: "phone" },
  { header: "Website", field: "website" },
  { header: "Subject", field: "subject" },
  { header: "Generated Email", field: "generatedEmail" },
];
