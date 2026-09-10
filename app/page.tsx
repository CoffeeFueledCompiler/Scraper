"use client";

import { useEffect, useRef, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Lead, leadKey } from "@/lib/schema";

async function postJSON(url: string, body: unknown, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
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
  steps,
  stepIndex,
  error,
  stopped,
  progress,
  onDismiss,
  onStop,
}: {
  steps: typeof PIPELINE_STEPS;
  stepIndex: number;
  error: string | null;
  stopped: boolean;
  progress: string | null;
  onDismiss: () => void;
  onStop: () => void;
}) {
  return (
    <div className="pipeline-overlay">
      <div className="pipeline-card">
        <div className="pipeline-steps">
          {steps.map((s, i) => (
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
              {i < steps.length - 1 && <div className={`pipeline-line${i < stepIndex ? " is-done" : ""}`} />}
            </div>
          ))}
        </div>
        <p className="pipeline-status">
          {error
            ? `Failed at "${steps[stepIndex]?.label}": ${error}`
            : stopped
            ? `Stopping "${steps[stepIndex]?.label}"...`
            : `Running "${steps[stepIndex]?.label}"...${progress ? ` (${progress})` : ""}`}
        </p>
        {error ? (
          <button className="btn" onClick={onDismiss} style={{ alignSelf: "center" }}>
            Dismiss
          </button>
        ) : (
          !stopped && (
            <button className="btn btn-danger" onClick={onStop} style={{ alignSelf: "center" }}>
              Stop
            </button>
          )
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
  const [pipelineStopped, setPipelineStopped] = useState(false);
  const [activeSteps, setActiveSteps] = useState(PIPELINE_STEPS);
  // Checked synchronously between awaits in runPipeline's loop — a ref, not
  // state, so a click mid-await is seen the moment the current call resolves
  // instead of waiting for a re-render.
  const stopRequested = useRef(false);
  // Aborts the request that's actually in flight. Without this, Stop could only
  // take effect between calls, so a stage that hung (a slow scrape, a site that
  // never responds) left no way out but reloading the page.
  const inFlight = useRef<AbortController | null>(null);
  // Keys (name::city) of the leads this pipeline run scraped — scopes
  // Enrich/Analyze/Generate to just this batch instead of the whole backlog.
  const [sessionKeys, setSessionKeys] = useState<string[]>([]);

  // Guard the shape: if /api/leads errors it returns an object, and setting
  // that as `leads` makes every leads.filter/.map below throw during render —
  // which blanks the whole page and makes the buttons look dead.
  const refresh = () =>
    fetch("/api/leads")
      .then((r) => r.json())
      .then((data) => setLeads(Array.isArray(data) ? data : []))
      .catch(() => setLeads([]));

  // Leads still missing a stage's output — the exact set Resume would work on,
  // so the button can show how much is outstanding (and disable when none is).
  const unfinishedCount = leads.filter((l) => !l.email || !l.observation || (l.observation && !l.subject)).length;

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

  // `steps` lets this run the whole pipeline or just the tail of it. Resume
  // passes the post-scrape steps with scoping off, so each stage sweeps in
  // every lead still missing that field — including ones orphaned when an
  // earlier run was stopped partway.
  const runPipeline = async (steps = PIPELINE_STEPS, scopeToThisRun = true) => {
    setBusy("pipeline");
    setActiveSteps(steps);
    setPipelineError(null);
    setPipelineStopped(false);
    stopRequested.current = false;
    setSessionKeys([]);
    const bodies: Record<string, any> = {
      scrape: { query, limit },
      enrich: { limit: batchSize },
      analyze: { batchSize },
      "generate-email": { batchSize },
    };
    // Scrape is batched too now — Vercel Hobby's 60s cap can't fit scraping
    // a full `limit` worth of businesses (each takes ~30s) in one call, so
    // it loops the same way enrich/analyze/generate-email already do.
    const batchedSteps = new Set(["scrape", "enrich", "analyze", "generate-email"]);
    let scrapedKeysAccum: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      if (stopRequested.current) break;
      setPipelineStep(i);
      const { key, label } = steps[i];
      try {
        let remaining = 1;
        // A stage only loops while it's actually getting somewhere. Every stage
        // re-selects its to-do list from the database each call, so work it
        // can't complete — a site that publishes no email, a lead the AI keeps
        // failing, a scrape Google is blocking — comes back identical next
        // call and `remaining` never falls, so the loop spins forever.
        let lastRemaining = Infinity;
        while (remaining > 0) {
          // Each call gets its own controller so Stop can abort the request
          // mid-flight. The server keeps working on whatever it already
          // started — that can't be cancelled — but every lead it finishes is
          // saved as it goes, so nothing done so far is lost, and Resume picks
          // up whatever is still unfinished.
          const controller = new AbortController();
          inFlight.current = controller;
          const result = await postJSON(`/api/${key}`, bodies[key], controller.signal);
          inFlight.current = null;
          if (result.error) throw new Error(result.error);
          if (result.leads) setLeads(result.leads);
          if (key === "scrape") {
            if (Array.isArray(result.scrapedKeys) && scopeToThisRun) {
              // Scope every later stage to exactly what this run scraped,
              // instead of every un-processed lead ever saved to the table.
              scrapedKeysAccum = scrapedKeysAccum.concat(result.scrapedKeys);
              setSessionKeys(scrapedKeysAccum);
              bodies.enrich.keys = scrapedKeysAccum;
              bodies.analyze.keys = scrapedKeysAccum;
              bodies["generate-email"].keys = scrapedKeysAccum;
            }
            // Ask for exactly what's still missing next time, not the full
            // original limit again.
            bodies.scrape.limit = result.remaining ?? 0;
          }
          remaining = batchedSteps.has(key) ? (result.remaining ?? 0) : 0;
          if (remaining >= lastRemaining) break; // no progress this round
          lastRemaining = remaining;
          if (stopRequested.current) break;
        }
      } catch (err) {
        // An abort is a deliberate stop, not a failure — fall through to the
        // "stopped" message rather than showing an error.
        if (stopRequested.current || (err instanceof DOMException && err.name === "AbortError")) break;
        setPipelineError(err instanceof Error ? err.message : String(err));
        setStatus(`Pipeline failed at "${label}": ${err instanceof Error ? err.message : String(err)}`);
        setBusy(null);
        return;
      }
      if (stopRequested.current) break;
    }
    inFlight.current = null;
    setStatus(
      stopRequested.current
        ? 'Pipeline stopped. Anything already scraped is saved — click "Resume unfinished" to carry on from here.'
        : "Pipeline complete: scraped, enriched, analyzed, and drafted emails for all leads."
    );
    setPipelineStep(null);
    setPipelineStopped(false);
    setBusy(null);
    refresh();
  };

  // Skips scrape and re-runs the remaining stages unscoped, so every lead
  // still missing an email/analysis/draft gets picked up — whatever run left
  // it that way.
  const resumeUnfinished = () => runPipeline(PIPELINE_STEPS.slice(1), false);

  const stopPipeline = () => {
    stopRequested.current = true;
    setPipelineStopped(true);
    inFlight.current?.abort();
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
        <PipelineOverlay
          steps={activeSteps}
          stepIndex={pipelineStep}
          error={pipelineError}
          stopped={pipelineStopped}
          progress={
            activeSteps[pipelineStep]?.key === "scrape"
              ? `Found ${sessionKeys.length}/${limit}...`
              : activeSteps[pipelineStep]?.key === "enrich" && sessionKeys.length > 0
              ? `${leads.filter((l) => sessionKeys.includes(leadKey(l)) && l.email).length}/${sessionKeys.length} emails found`
              : null
          }
          onDismiss={() => setPipelineStep(null)}
          onStop={stopPipeline}
        />
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
          <button className="btn btn-primary" disabled={!!busy} onClick={() => runPipeline()}>
            {busy === "pipeline" ? <span className="spinner" /> : null} Scrape → Emails → Analyze → Generate
          </button>
          <button
            className="btn"
            disabled={!!busy || unfinishedCount === 0}
            onClick={resumeUnfinished}
            title="Re-run Emails → Analyze → Generate over every lead that's still missing one, without scraping anything new"
          >
            Resume unfinished{unfinishedCount > 0 ? ` (${unfinishedCount})` : ""}
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
