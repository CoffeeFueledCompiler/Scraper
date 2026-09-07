"use client";

import { useEffect, useState } from "react";
import { Lead } from "@/lib/schema";

async function postJSON(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return res.json();
}

function StatusBadge({ status }: { status: Lead["status"] }) {
  if (status === "ok") return <span className="badge badge-ok">ok</span>;
  if (status === "NEEDS_REVIEW") return <span className="badge badge-review">needs review</span>;
  return <span className="badge badge-pending">pending</span>;
}

function StepButton({
  n,
  label,
  onClick,
  busy,
  active,
  variant = "default",
}: {
  n: number;
  label: string;
  onClick: () => void;
  busy: boolean;
  active: boolean;
  variant?: "default" | "primary";
}) {
  return (
    <button
      className={`btn${variant === "primary" ? " btn-primary" : ""}`}
      disabled={busy}
      onClick={onClick}
    >
      {active ? <span className="spinner" /> : <span className="step-num">{n}</span>}
      {label}
    </button>
  );
}

export default function Home() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [batchSize, setBatchSize] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const refresh = () => fetch("/api/leads").then((r) => r.json()).then(setLeads);

  useEffect(() => {
    refresh();
    const saved = localStorage.getItem("theme");
    const initial =
      saved === "dark" || saved === "light" ? saved : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(initial as "light" | "dark");
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  const run = async (label: string, url: string, body: unknown) => {
    setBusy(label);
    setStatus(`Running ${label}...`);
    try {
      const result = await postJSON(url, body);
      if (result.leads) setLeads(result.leads);
      setStatus(JSON.stringify(result, (_, v) => (Array.isArray(v) && v.length > 5 ? `[${v.length} items]` : v), 2));
    } catch (err) {
      setStatus(`Error: ${err}`);
    } finally {
      setBusy(null);
    }
  };

  const clearData = async () => {
    if (!confirm("Clear all scraped/enriched/analyzed leads? This can't be undone.")) return;
    setBusy("clear");
    await fetch("/api/leads", { method: "DELETE" });
    setLeads([]);
    setStatus("Cleared all local lead data.");
    setBusy(null);
  };

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>The Clientist Outreach Generator</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Scrape leads, enrich, draft outreach, export — one stage at a time.
          </p>
        </div>
        <button className="btn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? "☀ Light mode" : "🌙 Dark mode"}
        </button>
      </div>

      <section className="card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: "2 1 240px" }}>
            Search query
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type your keywords" />
          </label>
          <label className="field" style={{ width: 100 }}>
            Limit
            <input type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          </label>
          <label className="field" style={{ width: 100 }}>
            Batch size
            <input type="number" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <StepButton n={1} label="Scrape Google Maps" busy={!!busy} active={busy === "scrape"} onClick={() => run("scrape", "/api/scrape", { query, limit })} />
          <StepButton n={2} label="Find emails" busy={!!busy} active={busy === "enrich"} onClick={() => run("enrich", "/api/enrich", {})} />
          <StepButton n={3} label="Generate observation/impact/solution" busy={!!busy} active={busy === "analyze"} onClick={() => run("analyze", "/api/analyze", { batchSize })} />
          <StepButton n={4} label="Generate subject/email" busy={!!busy} active={busy === "generate-email"} onClick={() => run("generate-email", "/api/generate-email", { batchSize })} />
          <a href="/api/export">
            <button className="btn btn-primary" disabled={!!busy}>
              <span className="step-num">5</span>Export final CSV
            </button>
          </a>
          <StepButton n={6} label="Export to Google Sheet" busy={!!busy} active={busy === "export-sheets"} onClick={() => run("export-sheets", "/api/export-sheets", {})} />
          <button className="btn btn-danger" disabled={!!busy} onClick={clearData} style={{ marginLeft: "auto" }}>
            Clear local data
          </button>
        </div>

        {status && (
          <pre style={{ background: "var(--border-soft)", color: "var(--fg)", padding: "10px 12px", borderRadius: 8, overflowX: "auto", fontSize: 12, margin: 0 }}>
            {status}
          </pre>
        )}
      </section>

      <div className="table-wrap">
        {leads.length === 0 ? (
          <div className="empty-state">No leads yet — run Stage 1 to scrape Google Maps.</div>
        ) : (
          <table>
            <thead>
              <tr>
                {["Name", "Phone", "Website", "City", "Niche", "Email", "Observation", "Subject", "Status"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={`${l.name}::${l.city}`}>
                  <td>{l.name}</td>
                  <td>{l.phone}</td>
                  <td className="truncate">
                    {l.website && (
                      <a href={l.website} target="_blank" rel="noreferrer">
                        {l.website}
                      </a>
                    )}
                  </td>
                  <td>{l.city}</td>
                  <td>{l.niche}</td>
                  <td>{l.email}</td>
                  <td className="truncate" style={{ maxWidth: 280 }}>
                    {l.observation}
                  </td>
                  <td className="truncate">{l.subject}</td>
                  <td>
                    <StatusBadge status={l.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
