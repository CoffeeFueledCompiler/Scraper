"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
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

const PIPELINE_STEPS = [
  { key: "scrape", label: "Scrape" },
  { key: "enrich", label: "Emails" },
  { key: "analyze", label: "Analyze" },
  { key: "generate-email", label: "Generate" },
];

function PipelineOverlay({
  stepIndex,
  error,
  onDismiss,
}: {
  stepIndex: number;
  error: string | null;
  onDismiss: () => void;
}) {
  return (
    <div className="pipeline-overlay">
      <div className="pipeline-card">
        <div className="pipeline-steps">
          {PIPELINE_STEPS.map((s, i) => (
            <div key={s.key} className="pipeline-step-wrap">
              <div className="pipeline-step">
                <div
                  className={`pipeline-circle${
                    error && i === stepIndex ? " is-error" : i < stepIndex ? " is-done" : i === stepIndex ? " is-active" : ""
                  }`}
                >
                  {error && i === stepIndex ? "!" : i < stepIndex ? "✓" : i === stepIndex ? <span className="spinner" /> : i + 1}
                </div>
                <span className="pipeline-label">{s.label}</span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && <div className={`pipeline-line${i < stepIndex ? " is-done" : ""}`} />}
            </div>
          ))}
        </div>
        <p className="pipeline-status">
          {error ? `Failed at "${PIPELINE_STEPS[stepIndex]?.label}": ${error}` : `Running "${PIPELINE_STEPS[stepIndex]?.label}"...`}
        </p>
        {error && (
          <button className="btn" onClick={onDismiss} style={{ alignSelf: "center" }}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session } = useSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(20);
  const [batchSize, setBatchSize] = useState(10);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [pipelineStep, setPipelineStep] = useState<number | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const refresh = () => fetch("/api/leads").then((r) => r.json()).then(setLeads);

  useEffect(() => {
    refresh();
  }, []);

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

  const runPipeline = async () => {
    setBusy("pipeline");
    setPipelineError(null);
    const bodies: Record<string, unknown> = {
      scrape: { query, limit },
      enrich: {},
      analyze: { batchSize },
      "generate-email": { batchSize },
    };
    const batchedSteps = new Set(["analyze", "generate-email"]);
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      setPipelineStep(i);
      const { key, label } = PIPELINE_STEPS[i];
      try {
        let remaining = 1;
        while (remaining > 0) {
          const result = await postJSON(`/api/${key}`, bodies[key]);
          if (result.error) throw new Error(result.error);
          if (result.leads) setLeads(result.leads);
          remaining = batchedSteps.has(key) ? (result.remaining ?? 0) : 0;
        }
      } catch (err) {
        setPipelineError(err instanceof Error ? err.message : String(err));
        setStatus(`Pipeline failed at "${label}": ${err instanceof Error ? err.message : String(err)}`);
        setBusy(null);
        return;
      }
    }
    setStatus("Pipeline complete: scraped, enriched, analyzed, and drafted emails for all leads.");
    setPipelineStep(null);
    setBusy(null);
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
      {pipelineStep !== null && (
        <PipelineOverlay stepIndex={pipelineStep} error={pipelineError} onDismiss={() => setPipelineStep(null)} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>The Clientist Outreach Generator</h1>
          <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 13 }}>
            Scrape leads, enrich, draft outreach, export — one stage at a time.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {session?.user?.email && <span style={{ fontSize: 13, color: "var(--muted)" }}>{session.user.email}</span>}
          <button className="btn" onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
          </button>
        </div>
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
          <button className="btn btn-primary" disabled={!!busy} onClick={runPipeline}>
            {busy === "pipeline" ? <span className="spinner" /> : null} Scrape → Emails → Analyze → Generate
          </button>
          <a href="/api/export">
            <button className="btn" disabled={!!busy}>
              Export final CSV
            </button>
          </a>
          <button className="btn" disabled={!!busy} onClick={() => run("export-sheets", "/api/export-sheets", {})}>
            {busy === "export-sheets" ? <span className="spinner" /> : null} Export to Google Sheet
          </button>
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
                {["Name", "Phone", "Website", "City", "Niche", "Rating", "Email", "Observation", "Subject", "Status"].map((h) => (
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
                  <td>{l.rating}</td>
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
