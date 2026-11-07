"use client";

import { useState } from "react";
import AppHeader from "@/app/components/app-header";
import ChatAssistant from "@/app/components/chat-assistant";
import type { TuningData } from "@/lib/data";
import { recallLabel } from "@/lib/tuning";

function Check({ passed, children }: { passed: boolean | null; children: React.ReactNode }) {
  return <li className={`check-item ${passed === null ? "check-neutral" : passed ? "check-pass" : "check-fail"}`}>
    <span aria-label={passed === null ? "Not available" : passed ? "Passed" : "Failed"}>{passed === null ? "—" : passed ? "✓" : "✕"}</span><span>{children}</span>
  </li>;
}

export default function Tuning({ data }: { data: TuningData }) {
  const { run, flow } = data;
  const [selected, setSelected] = useState(run.accepted_attempt);
  const [showRules, setShowRules] = useState(false);
  const attempt = run.attempts.find(item => item.n === selected)!;
  const result = attempt.evaluate;
  const passed = attempt.guardrail.passed;

  return <>
    <a href="#tuning" className="skip-link">Skip to tuning</a>
    <AppHeader active="tuning" source="Design example · 5,483 alerts"/>
    <ChatAssistant context={{ source: "tuning", sample: true, run_id: run.run_id, attempt: selected }}/>
    <main id="tuning">
      <div className="tuning-title-row">
        <div><h1>Tuning run #3</h1><p>{run.started_label} · {run.attempts.length} sample attempts · {run.duration_label} · <span className="mono">{run.run_id}</span></p></div>
        <div className="tuning-actions">
          <span className={`status-badge ${run.result === "passed" ? "pass" : "failed"}`}>{run.result === "passed" ? "Passed guardrail" : "Failed guardrail"} · sample</span>
          <button aria-expanded={showRules} aria-controls="sample-rules" onClick={() => setShowRules(!showRules)}>{showRules ? "Hide" : "View"} sample YAML</button>
          <button className="primary-button" disabled aria-describedby="backend-notice">Run tuning again</button>
        </div>
      </div>
      <p id="backend-notice" className="tuning-disclosure">Sample only — no Codex or evaluator has run. Live tuning is unavailable until the backend is connected.</p>
      <section className="stats tuning-stats" aria-label="Sample tuning summary">
        <div className="stat"><label htmlFor="budget" className="sr-only">Saved analyst budget (read-only sample)</label><input id="budget" type="number" value={flow.budget_per_hour} readOnly/><span>alerts / hour<br/>analyst budget · saved sample</span></div>
        <div className="stat"><strong>{flow.observed_per_hour} / h</strong><span>observed, original rules</span></div>
        <div className="stat fail"><strong>{flow.burn_rate.toFixed(2)}×</strong><span>burn rate (observed ÷ budget)</span></div>
        <div className={`stat ${passed ? "good" : ""}`}><strong>{result.after}</strong><span>grouped alerts (−{result.reduction_label})<br/>attempt {selected}{passed ? " · passed sample" : " · rejected sample"}</span></div>
      </section>
      {showRules && <section id="sample-rules" className="panel rules-preview" aria-label="Sample YAML proposal">
        <div className="section-heading"><h2>Sample YAML · attempt {selected}</h2><p>Illustrative change list, not a loadable runtime configuration.</p></div>
        <pre>{attempt.rules_yaml}</pre>
      </section>}
      <div className="tuning-columns">
        <section className="panel gap-panel" aria-labelledby="gap-title">
          <div className="section-heading"><h2 id="gap-title">Where the load comes from</h2><p>Per rule, from the original sample. Allowed = budget × weight ÷ total weight. Changes for attempt {selected}.</p></div>
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Rule load and budget gaps">
            <table className="gap-table">
              <caption className="sr-only">Sample rule load, allowed share, delta gaps, and selected attempt changes</caption>
              <thead><tr>{["Rule", "S", "Observed/h", "Allowed/h", "Gap", "Change"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
              <tbody>{flow.rules.map(rule => {
                const changes = attempt.changes.filter(change => change.rule_id === rule.rule_id);
                return <tr key={rule.rule_id}>
                  <th scope="row">{rule.rule_name}</th><td>{rule.base_score}</td><td>{rule.observed_per_hour}</td><td>{rule.allowed_per_hour.toFixed(1)}</td>
                  <td className={rule.direction === "over" ? "gap-over" : "gap-under"}>{rule.gap > 0 ? "+" : ""}{rule.gap.toFixed(1)}</td>
                  <td className="mono">{changes.length ? changes.map(change => `${change.field === "window_min" ? "W" : "N_sat"} ${change.old}→${change.new}`).join(" · ") : rule.rule_id.startsWith("exploit@") ? "Immediate; no merge" : "Unchanged"}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <p className="table-note">W in minutes. Values rounded for display. The five-minute High-rule limit belongs to this sample configuration only.</p>
        </section>
        <div className="tuning-right">
          <section className="panel attempts-panel" aria-labelledby="attempts-title">
            <div className="attempt-heading"><h2 id="attempts-title">Attempts</h2><div className="speed attempt-selector" role="group" aria-label="Select sample attempt">
              {run.attempts.map(item => <button key={item.n} aria-pressed={selected === item.n} aria-controls="attempt-details" className={selected === item.n ? "selected" : ""} onClick={() => setSelected(item.n)}>Attempt {item.n} · {item.guardrail.passed ? "Passed" : "Failed"}</button>)}
            </div></div>
            <div id="attempt-details">
              <ul className="check-list">
                <Check passed={true}>Alert reduction {result.reduction_label} ({result.before.toLocaleString("en-US")} → {result.after})</Check>
                <Check passed={result.recall.total === 0 ? null : result.recall.caught === result.recall.total}>Attack-group recall {recallLabel(result.recall)}</Check>
                <Check passed={result.benign_raised === 0}><span className={result.benign_raised > 0 ? "benign-raised-fail" : ""}>{result.benign_raised} benign groups raised</span></Check>
                {attempt.guardrail.checks.map(check => <Check key={check.name} passed={check.passed}>{check.name}{!check.passed && <small className="check-detail">{check.detail}</small>}</Check>)}
              </ul>
              <p className={`attempt-note ${passed ? "" : "gap-over"}`} role="status">{passed ? "All illustrative checks passed. This sample proposal is not loaded into any runtime." : "Failed, not used. The sample baseline stays active for this rejected attempt."}</p>
            </div>
          </section>
          <section className="panel" aria-labelledby="changes-title">
            <div className="section-heading"><h2 id="changes-title">Rule changes in this attempt</h2><p>Attempt {selected} · old value → new value, with a sample rationale</p></div>
            <ul className="rule-changes">{attempt.changes.map(change => <li key={`${change.rule_id}.${change.field}`}>
              <div className="mono">{change.rule_id}.{change.field}: <span className="old-value">{change.old}</span> → <span className="new-value">{change.new}</span></div>
              <p>{change.reason}</p>
            </li>)}</ul>
          </section>
          <section className="log-section" aria-labelledby="log-title"><h2 id="log-title">Codex log · sample attempt {selected}</h2>
            <div className="codex-log" tabIndex={0} role="region" aria-label={`Illustrative log for attempt ${selected}`}>
              {attempt.log.map((line,index) => <p key={index} className={`log-${line.tone}`}>{line.text}</p>)}
            </div>
          </section>
        </div>
      </div>
      <aside className="notice">Codex proposes settings and tests them. A fixed guardrail decides whether they are used. Budget and the 0.2 benign evidence weight are operator inputs.</aside>
      <p className="sample-note">Design-example sample · These 5,483-alert figures are illustrative, not measured pipeline results, and are separate from Replay’s 12-event sample.</p>
    </main>
  </>;
}
