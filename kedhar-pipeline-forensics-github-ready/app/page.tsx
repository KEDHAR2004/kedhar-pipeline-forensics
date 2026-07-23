"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Analysis,
  RULEBOOK,
  analyzeTrace,
  formatMarkdownReport,
  sampleTrace,
} from "../lib/forensics";

type View = "investigation" | "archive" | "rulebook" | "about";

const viewTitles: Record<View, string> = {
  investigation: "Incident investigation",
  archive: "Case archive",
  rulebook: "Forensic rulebook",
  about: "About the project",
};

const navItems: Array<{ id: View; label: string }> = [
  { id: "investigation", label: "Investigation" },
  { id: "archive", label: "Case archive" },
  { id: "rulebook", label: "Rulebook" },
  { id: "about", label: "About" },
];

function duration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      K<span>⋮</span>
    </span>
  );
}

function EmptyState({
  onImport,
  onDemo,
}: {
  onImport: () => void;
  onDemo: () => void;
}) {
  return (
    <section className="empty-state">
      <div className="signal-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <p className="eyebrow">FORENSIC INTAKE</p>
      <h2>
        Turn a broken run into
        <br />
        an explainable case.
      </h2>
      <p>
        Import JSON or JSONL events. The local rules engine reconstructs the
        failure chain, ranks root-cause hypotheses, and prepares a
        handoff-ready report.
      </p>
      <div className="action-row">
        <button className="button primary" onClick={onImport}>
          Import trace
        </button>
        <button className="text-button" onClick={onDemo}>
          Explore demo case →
        </button>
      </div>
      <small>YOUR TRACE NEVER LEAVES THIS BROWSER</small>
    </section>
  );
}

function Investigation({ analysis }: { analysis: Analysis }) {
  const [openCause, setOpenCause] = useState<number | null>(null);

  return (
    <div className="dashboard">
      <div className="metric-grid">
        <article className={`metric severity ${analysis.severity.tone}`}>
          <span>SEVERITY</span>
          <strong>{analysis.severity.code}</strong>
          <small>{analysis.severity.label}</small>
        </article>
        <article className="metric">
          <span>PRIMARY FAILURE</span>
          <strong className="metric-copy">
            {analysis.primaryFailure.stage.replaceAll("_", " ")}
          </strong>
          <small>{analysis.primaryFailure.category.replaceAll("-", " / ")}</small>
        </article>
        <article className="metric">
          <span>ROOT-CAUSE CONFIDENCE</span>
          <strong>{analysis.confidence}%</strong>
          <div className="meter">
            <i style={{ width: `${analysis.confidence}%` }} />
          </div>
        </article>
        <article className="metric">
          <span>BLAST RADIUS</span>
          <strong>
            {analysis.blastRadius.stages} stage
            {analysis.blastRadius.stages === 1 ? "" : "s"}
          </strong>
          <small>{analysis.blastRadius.label}</small>
        </article>
      </div>

      <section className="panel">
        <header className="panel-head">
          <div>
            <b>01</b>
            <h2>Failure chain</h2>
          </div>
          <p>Reconstructed from event order and causal proximity</p>
        </header>
        <div className="chain">
          {analysis.chain.map((node, index) => (
            <div className={`chain-node ${node.status}`} key={`${node.stage}-${index}`}>
              <span className="node-dot" />
              <h3>{node.stage.replaceAll("_", " ")}</h3>
              <small>
                {node.status} · {duration(node.latencyMs)}
              </small>
            </div>
          ))}
        </div>
      </section>

      <div className="analysis-grid">
        <section className="panel causes">
          <header className="panel-head">
            <div>
              <b>02</b>
              <h2>Likely causes</h2>
            </div>
            <p>{analysis.hypotheses.length} HYPOTHESES</p>
          </header>
          {analysis.hypotheses.length ? (
            analysis.hypotheses.map((cause, index) => (
              <article className="cause" key={cause.rule}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <header>
                    <span>{cause.rule.replaceAll("-", " / ")}</span>
                    <strong>{cause.score}% MATCH</strong>
                  </header>
                  <h3>{cause.title}</h3>
                  <p>{cause.hypothesis}</p>
                  <button
                    className="evidence-button"
                    onClick={() => setOpenCause(openCause === index ? null : index)}
                    aria-expanded={openCause === index}
                  >
                    {openCause === index ? "Hide" : "View"} evidence{" "}
                    {openCause === index ? "↑" : "↓"}
                  </button>
                  {openCause === index && (
                    <div className="cause-evidence">
                      {cause.evidence.map((item) => (
                        <p key={item}>• {item}</p>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))
          ) : (
            <p className="no-findings">No terminal failure was detected.</p>
          )}
        </section>

        <section className="panel locker">
          <header className="panel-head">
            <div>
              <b>03</b>
              <h2>Evidence locker</h2>
            </div>
          </header>
          <div className="evidence-list">
            {analysis.evidence.length ? (
              analysis.evidence.map((item, index) => (
                <article className={item.status} key={`${item.stage}-${index}`}>
                  <span>
                    {item.stage} · {dateTime(item.timestamp)}
                  </span>
                  <code>{item.detail}</code>
                </article>
              ))
            ) : (
              <article>
                <code>No warning or failure evidence detected.</code>
              </article>
            )}
          </div>
        </section>
      </div>

      <section className="panel">
        <header className="panel-head response-head">
          <div>
            <b>04</b>
            <h2>Response plan</h2>
          </div>
          <div className="action-row">
            <button
              className="button small"
              onClick={() =>
                download(
                  JSON.stringify(analysis, null, 2),
                  `${analysis.caseId.toLowerCase()}-analysis.json`,
                  "application/json",
                )
              }
            >
              Export JSON
            </button>
            <button
              className="button small dark"
              onClick={() =>
                download(
                  formatMarkdownReport(analysis),
                  `${analysis.caseId.toLowerCase()}-report.md`,
                  "text/markdown",
                )
              }
            >
              Export report
            </button>
          </div>
        </header>
        <div className="response-grid">
          <div>
            <span>NOW / CONTAIN</span>
            <ol>
              {(analysis.response.contain.length
                ? analysis.response.contain
                : ["No emergency containment is required."]
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <div>
            <span>NEXT / PREVENT</span>
            <ol>
              {(analysis.response.prevent.length
                ? analysis.response.prevent
                : ["Keep structured event logging enabled."]
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

function Archive({
  cases,
  onOpen,
  onDelete,
}: {
  cases: Analysis[];
  onOpen: (item: Analysis) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="subpage">
      <header className="page-intro">
        <p className="eyebrow">LOCAL CASE ARCHIVE</p>
        <h2>Previous investigations</h2>
        <p>
          Cases are stored only in this browser. Reopen or export them whenever
          you need the evidence.
        </p>
      </header>
      <div className="case-list">
        {cases.length ? (
          cases.map((item) => (
            <article className="case-row" key={item.caseId}>
              <code>{item.caseId}</code>
              <div>
                <h3>{item.hypotheses[0]?.title || "Healthy pipeline run"}</h3>
                <p>
                  {item.runId} · {item.eventCount} events
                </p>
              </div>
              <time>{dateTime(item.startedAt)}</time>
              <span className={`status-pill ${item.severity.tone}`}>
                {item.severity.code}
              </span>
              <div>
                <button onClick={() => onOpen(item)} aria-label={`Open ${item.caseId}`}>
                  ↗
                </button>
                <button
                  onClick={() => onDelete(item.caseId)}
                  aria-label={`Delete ${item.caseId}`}
                >
                  ×
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="no-cases">No cases yet. Run your first scan to begin.</p>
        )}
      </div>
    </section>
  );
}

function Rulebook() {
  return (
    <section className="subpage">
      <header className="page-intro">
        <p className="eyebrow">EXPLAINABLE BY DESIGN</p>
        <h2>Forensic rulebook</h2>
        <p>
          Every hypothesis is produced by a visible signal rule—not an
          unexplained model guess.
        </p>
      </header>
      <div className="rule-grid">
        {RULEBOOK.map((rule, index) => (
          <article key={rule.id}>
            <span>RULE / {String(index + 1).padStart(2, "0")}</span>
            <h3>{rule.label}</h3>
            <p>{rule.description}</p>
            <code>signal: {rule.signal}</code>
          </article>
        ))}
      </div>
    </section>
  );
}

function About() {
  return (
    <section className="about">
      <div>
        <p className="eyebrow">BUILT BY KEDHAR</p>
        <h2>
          Failures are data.
          <br />
          Make them useful.
        </h2>
      </div>
      <div className="about-copy">
        <p>
          Kedhar // Pipeline Forensics is an original, local-first portfolio
          project for investigating failures across retrieval, model, agent, and
          data pipelines.
        </p>
        <p>
          It focuses on evidence: event normalization, temporal reconstruction,
          deterministic signal detection, ranked hypotheses, and practical
          remediation.
        </p>
        <div className="principles">
          <p>
            <b>01</b> Local by default
          </p>
          <p>
            <b>02</b> Evidence over guesses
          </p>
          <p>
            <b>03</b> Portable reports
          </p>
        </div>
        <small>© 2026 Kedhar. Released under the MIT License.</small>
      </div>
    </section>
  );
}

function ImportModal({
  open,
  onClose,
  onAnalyze,
}: {
  open: boolean;
  onClose: () => void;
  onAnalyze: (value: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [payload, setPayload] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  function readFile(file?: File) {
    if (!file) return;
    if (!/\.(json|jsonl)$/i.test(file.name)) {
      setError("Choose a .json or .jsonl file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPayload(String(reader.result || ""));
      setError(`${file.name} is ready to analyze.`);
    };
    reader.onerror = () => setError("The selected file could not be read.");
    reader.readAsText(file);
  }

  function submit() {
    if (!payload.trim()) {
      setError("Choose a file or paste at least one JSON event.");
      return;
    }
    try {
      onAnalyze(payload);
      setPayload("");
      setError("");
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The trace could not be analyzed.");
    }
  }

  return (
    <dialog ref={dialog} onCancel={onClose} className="import-dialog">
      <div className="dialog-head">
        <div>
          <p className="eyebrow">NEW INVESTIGATION</p>
          <h2>Import pipeline events</h2>
        </div>
        <button onClick={onClose} aria-label="Close import dialog">
          ×
        </button>
      </div>
      <label
        className={`drop-zone ${dragging ? "dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(event: DragEvent<HTMLLabelElement>) => {
          event.preventDefault();
          setDragging(false);
          readFile(event.dataTransfer.files[0]);
        }}
      >
        <input
          type="file"
          accept=".json,.jsonl,application/json"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            readFile(event.target.files?.[0])
          }
        />
        <i>↥</i>
        <strong>Drop JSON / JSONL here</strong>
        <small>or click to choose a trace file</small>
      </label>
      <div className="divider">
        <span>OR PASTE EVENTS</span>
      </div>
      <label className="payload">
        <span>TRACE PAYLOAD</span>
        <textarea
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          rows={9}
          spellCheck={false}
          placeholder='{"timestamp":"2026-07-23T18:04:12Z","stage":"llm_call","status":"error","error":"context length exceeded"}'
        />
      </label>
      <p className="dialog-message">{error}</p>
      <div className="dialog-actions">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        <button className="button primary" onClick={submit}>
          Analyze trace
        </button>
      </div>
    </dialog>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("investigation");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [cases, setCases] = useState<Analysis[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(
        localStorage.getItem("kedhar-forensics-cases") || "[]",
      ) as Analysis[];
    } catch {
      return [];
    }
  });
  const [importOpen, setImportOpen] = useState(false);

  function persistCase(next: Analysis) {
    const updated = [next, ...cases.filter((item) => item.caseId !== next.caseId)].slice(
      0,
      12,
    );
    setCases(updated);
    localStorage.setItem("kedhar-forensics-cases", JSON.stringify(updated));
  }

  function run(payload: string | object[]) {
    const result = analyzeTrace(payload);
    setAnalysis(result);
    persistCase(result);
    setView("investigation");
  }

  function removeCase(id: string) {
    const updated = cases.filter((item) => item.caseId !== id);
    setCases(updated);
    localStorage.setItem("kedhar-forensics-cases", JSON.stringify(updated));
  }

  const caseState = useMemo(() => {
    if (!analysis) return { text: "WAITING", tone: "neutral" };
    return { text: analysis.severity.label, tone: analysis.severity.tone };
  }, [analysis]);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("investigation")}>
          <Mark />
          <span>
            <strong>KEDHAR</strong>
            <small>PIPELINE FORENSICS</small>
          </span>
        </button>
        <nav aria-label="Primary navigation">
          {navItems.map((item, index) => (
            <button
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="engine-state">
          <i />
          <span>LOCAL ENGINE</span>
          <b>v1.0.0</b>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI RELIABILITY WORKBENCH</p>
            <h1>{viewTitles[view]}</h1>
          </div>
          <div className="action-row">
            <button className="button demo-button" onClick={() => run(sampleTrace)}>
              Load demo
            </button>
            <button className="button primary" onClick={() => setImportOpen(true)}>
              + New scan
            </button>
          </div>
        </header>

        {view === "investigation" && (
          <>
            <div className="case-strip">
              <div>
                <span>ACTIVE CASE</span>
                <strong>{analysis?.caseId || "KPF—0000"}</strong>
              </div>
              <div>
                <span>
                  {analysis
                    ? `${dateTime(analysis.startedAt)} · ${duration(analysis.durationMs)}`
                    : "NO TRACE LOADED"}
                </span>
                <b className={`status-pill ${caseState.tone}`}>{caseState.text}</b>
              </div>
            </div>
            <div className="content">
              {analysis ? (
                <Investigation analysis={analysis} />
              ) : (
                <EmptyState
                  onImport={() => setImportOpen(true)}
                  onDemo={() => run(sampleTrace)}
                />
              )}
            </div>
          </>
        )}

        <div className="content">
          {view === "archive" && (
            <Archive
              cases={cases}
              onOpen={(item) => {
                setAnalysis(item);
                setView("investigation");
              }}
              onDelete={removeCase}
            />
          )}
          {view === "rulebook" && <Rulebook />}
          {view === "about" && <About />}
        </div>
      </div>

      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onAnalyze={run}
      />
    </main>
  );
}
