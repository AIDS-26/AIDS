"use client";

import { useState } from "react";
import AppHeader from "@/app/components/app-header";
import SavedSourceTabs from "@/app/components/saved-source-tabs";
import ChatAssistant from "@/app/components/chat-assistant";
import type { AuditData } from "@/lib/data";
import { recallLabel } from "@/lib/tuning";

function ResultBadge({ result }: { result: string }) {
  return <span className={`status-badge ${result === "passed" ? "pass" : "failed"}`}>{result === "passed" ? "Passed" : "Failed, not used"}</span>;
}

function FileReferences({ files }: { files: string[] }) {
  return <p className="audit-files mono" aria-label="Referenced sample artifacts">{files.join(" · ")}</p>;
}

export default function Audit({ data }: { data: AuditData }) {
  const [selected, setSelected] = useState(data.default_run_id);
  const run = data.runs.find(item => item.run_id === selected)!;
  const passed = run.result === "passed";

  return <>
    <a href="#audit" className="skip-link">Skip to audit log</a>
    <AppHeader active="audit" source="Design examples · 5,483 alerts"/>
    <ChatAssistant context={{ source: "audit", sample: true, run_id: selected }}/>
    <main id="audit">
      <SavedSourceTabs screen="audit"/>
      <header className="audit-title"><h1>Audit log</h1><p>Every tuning run is kept, including failed ones. Original alerts are never deleted.</p></header>
      <section className="panel" aria-label="Sample tuning runs">
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Select a sample tuning run">
          <table className="runs-table">
            <caption className="sr-only">Sample tuning runs, newest first. Select a run to inspect its saved details. Failed after-counts are rejected proposals.</caption>
            <thead><tr>{["Run", "Started", "Budget", "Attempts", "Result", "Alerts before → after", "Rules changed", "Attack recall"].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{data.runs.map(item => <tr key={item.run_id} className={selected === item.run_id ? "selected-run" : ""} onClick={() => setSelected(item.run_id)}>
              <th scope="row"><button className="run-select" aria-label={`Select sample run ${item.number}`} aria-pressed={selected === item.run_id} aria-controls="run-details">#{item.number}</button></th>
              <td><time dateTime={item.started_at}>{item.started_label}</time></td>
              <td>{item.budget_per_hour}/h</td><td>{item.attempts}</td><td><ResultBadge result={item.result}/></td>
              <td>{item.alerts_before.toLocaleString("en-US")} → {item.alerts_after}<span className="sr-only">{item.result === "failed" ? " proposed, not used" : " sample result"}</span></td>
              <td>{item.rules_changed}</td><td>{recallLabel(item.recall)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      <section id="run-details" aria-labelledby="run-detail-title">
        <div className="audit-detail-heading"><h2 id="run-detail-title">Run #{run.number} in detail</h2><p className="mono" role="status">{run.run_id} · {passed ? "Passed sample" : "Failed sample, not used"}</p></div>
        <div className="audit-stages">
          <section className="panel audit-stage" aria-labelledby="before-title">
            <h3 id="before-title">Before tuning</h3><strong className="stage-metric">{run.observed_per_hour} alerts / hour</strong>
            <ul><li>Burn rate {run.burn_rate}× against {run.budget_per_hour}/h.</li>{run.before_notes.map(note => <li key={note}>{note}</li>)}</ul>
            <FileReferences files={run.before_files}/>
          </section>
          <section className="panel audit-stage" aria-labelledby="changes-title">
            <h3 id="changes-title">{passed ? "Rule changes" : "Proposed rule changes"}</h3><strong className="stage-metric">{run.rules_changed} rules, {run.values_changed} values</strong>
            <ul>{run.change_notes.map(note => <li key={note}>{note}</li>)}</ul>
            <FileReferences files={run.change_files}/>
          </section>
          <section className="panel audit-stage" aria-labelledby="after-title">
            <h3 id="after-title">{passed ? "After tuning" : "Rejected proposal"}</h3><strong className={`stage-metric ${passed ? "" : "gap-over"}`}>{run.alerts_after} {passed ? "grouped alerts" : "proposed groups · not used"}</strong>
            <ul className="audit-checks">
              <li><span className={run.recall.total === 0 ? "" : run.recall.caught === run.recall.total ? "text-green" : "gap-over"} aria-label={run.recall.total === 0 ? "Unavailable" : run.recall.caught === run.recall.total ? "Passed" : "Failed"}>{run.recall.total === 0 ? "—" : run.recall.caught === run.recall.total ? "✓" : "✕"}</span>Attack-group recall {recallLabel(run.recall)}</li>
              <li className={run.benign_raised > 0 ? "benign-raised-fail" : ""}><span className={run.benign_raised > 0 ? "gap-over" : "text-green"}>{run.benign_raised > 0 ? "✕" : "✓"}</span>{run.benign_raised} benign groups raised</li>
              <li><span className={passed ? "text-green" : "gap-over"}>{passed ? "✓" : "✕"}</span>{passed ? `Sample attempt ${run.accepted_attempt} accepted` : `Baseline retained: ${run.active_alerts.toLocaleString("en-US")} original alerts`}</li>
            </ul>
            <FileReferences files={run.after_files}/>
          </section>
        </div>
        <p className={`audit-outcome ${passed ? "" : "rejected-outcome"}`}>{run.outcome_note}</p>
        <details key={run.run_id} className="panel audit-attempts"><summary>Attempt history · {run.attempts} {run.attempts === 1 ? "attempt" : "attempts"}</summary>
          <ol>{run.attempt_history.map(attempt => <li key={attempt.n}><strong>Attempt {attempt.n}</strong><ResultBadge result={attempt.result}/><p>{attempt.reason}</p></li>)}</ol>
        </details>
      </section>
      <aside className="notice">Failed runs stay in the log and are never used. Each run keeps its input data, the YAML diff, the Codex log, and the evaluation result.</aside>
      <p className="sample-note">Sample audit trail · No backend is connected and no evaluator has run. Figures and artifact names are illustrative; files are not available to download. Separate from Replay’s 12-event sample.</p>
    </main>
  </>;
}
