import Providers from "./providers";

export const metadata = { title: "Lead Generator" };

// Theme is plain CSS variables on :root. Dark only, no toggle needed.
const themeStyle = `
  :root {
    --bg: #0a0a0d;
    --fg: #f1eef7;
    --muted: #a099b3;
    --card: #16141f;
    --border: #2e2840;
    --border-soft: #1f1a2b;
    --accent: #8b5cf6;
    --accent-fg: #14142b;
    --gold: #f5a524;
    --danger: #f87171;
    --danger-soft: #3b1418;
    --success: #4ade80;
    --success-soft: #0f2a1a;
    --warn: #fbbf24;
    --warn-soft: #382b09;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.3);
  }

  * { box-sizing: border-box; }
  body { background: var(--bg); color: var(--fg); }
  a { color: var(--gold); }

  .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; box-shadow: var(--shadow); }

  .field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .02em; }
  .field input {
    font: inherit; font-size: 14px; font-weight: 400; text-transform: none; letter-spacing: normal;
    padding: 9px 11px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--fg);
  }
  .field input:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

  .btn {
    display: inline-flex; align-items: center; gap: 7px; padding: 9px 14px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--card); color: var(--fg); font-size: 13px; font-weight: 500;
    cursor: pointer; transition: background .12s, transform .05s; white-space: nowrap;
  }
  .btn:hover:not(:disabled) { background: var(--border-soft); }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn:disabled { opacity: .45; cursor: not-allowed; }
  .btn-primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
  .btn-primary:hover:not(:disabled) { filter: brightness(1.08); }
  .btn-danger { color: var(--danger); border-color: var(--danger-soft); }
  .btn-danger:hover:not(:disabled) { background: var(--danger-soft); }

  .step-num {
    display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px;
    border-radius: 50%; background: rgba(127,127,127,.25); font-size: 11px; font-weight: 700; flex: none;
  }
  .btn-primary .step-num { background: rgba(255,255,255,.28); }

  .spinner {
    width: 12px; height: 12px; border: 2px solid currentColor; border-right-color: transparent;
    border-radius: 50%; display: inline-block; animation: spin .6s linear infinite; flex: none;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .table-wrap { border: 1px solid var(--border); border-radius: 12px; overflow: auto; box-shadow: var(--shadow); max-height: 70vh; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  thead th {
    position: sticky; top: 0; background: var(--border-soft); text-align: left; padding: 10px 12px;
    font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap;
  }
  tbody td { padding: 10px 12px; border-bottom: 1px solid var(--border-soft); vertical-align: top; }
  tbody tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: var(--border-soft); }

  .badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .badge-ok { background: rgba(245,165,36,.15); color: var(--gold); }
  .badge-review { background: var(--warn-soft); color: var(--warn); }
  .badge-pending { background: var(--border-soft); color: var(--muted); }

  .empty-state { padding: 56px 20px; text-align: center; color: var(--muted); }
  .truncate { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .pipeline-overlay {
    position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center;
    background: rgba(10,10,13,.55); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  }
  .pipeline-card {
    background: var(--card); border: 1px solid var(--border); border-radius: 16px; box-shadow: var(--shadow);
    padding: 32px 40px; display: flex; flex-direction: column; align-items: center; gap: 20px; min-width: 380px;
  }
  .pipeline-steps { display: flex; align-items: flex-start; }
  .pipeline-step-wrap { display: flex; align-items: center; }
  .pipeline-step { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .pipeline-circle {
    width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700; background: var(--border-soft); color: var(--muted); border: 2px solid var(--border);
    transition: background .2s, border-color .2s, color .2s;
  }
  .pipeline-circle.is-active { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
  .pipeline-circle.is-done { background: var(--success-soft); border-color: var(--success); color: var(--success); }
  .pipeline-circle.is-error { background: var(--danger-soft); border-color: var(--danger); color: var(--danger); }
  .pipeline-circle .spinner { border-color: var(--accent-fg); border-right-color: transparent; }
  .pipeline-label { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .pipeline-line { width: 48px; height: 2px; background: var(--border); margin: 0 4px 22px; transition: background .2s; }
  .pipeline-line.is-done { background: var(--success); }
  .pipeline-status { margin: 0; font-size: 13px; color: var(--muted); text-align: center; }
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeStyle }} />
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, padding: "24px" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
