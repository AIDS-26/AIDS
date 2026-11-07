"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppHeader from "./app-header";
import RuleHistory from "./rule-history";
import type { Dataset } from "@/lib/backend-client";
import { baselineHref } from "@/lib/navigation";
import { iterationAccepted, savedRecall, type SavedAttempt, type SavedDetail, type SavedIteration } from "@/lib/saved-tuning";

function useSaved<T>(url: string | null, revision: number) {
  const [state, setState] = useState<{ url: string | null; revision: number; data?: T; error?: string }>({ url: null, revision: -1 });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Could not load saved results.");
        if (!controller.signal.aborted) setState({ url, revision, data: body });
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ url, revision, data: previous.url === url ? previous.data : undefined, error: error instanceof Error ? error.message : "Could not load saved results." }));
      }
    })();
    return () => controller.abort();
  }, [url, revision]);
  return { data: state.url === url ? state.data : undefined, error: state.url === url && state.revision === revision ? state.error : undefined, loading: Boolean(url) && (state.url !== url || state.revision !== revision) };
}

const number = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });

function Iteration({ attempt, item }: { attempt: SavedAttempt; item: SavedIteration }) {
  const result = item.evaluation, accepted = iterationAccepted(attempt, item);
  return <section className="panel baseline-panel saved-iteration" aria-label={`Iteration ${item.iteration} details`}>
    <h3>Iteration {item.iteration} · {accepted ? "Accepted in this attempt" : "Not accepted"}</h3>
    <p>Candidate run: {item.tuned_run_id ?? "Not created"} · Status: {item.status}</p>
    <p className="mono saved-version">Rule version: {item.rule_version_id ?? "Not created"}</p>
    {!accepted && <p className="baseline-message">Candidate results below are diagnostic and are not presented as active rules.</p>}
    {item.has_error && <p role="alert">This iteration recorded an error. Backend logs contain the diagnostic details.</p>}
    {result ? <><div className="stats saved-stats">
      <div className="stat"><strong>{number(result.baseline_alerts)} → {number(result.grouped_alerts)}</strong><span>original → candidate grouped alerts</span></div>
      <div className="stat"><strong>{result.reduction_pct == null ? "Unavailable" : `${number(result.reduction_pct)}%`}</strong><span>saved alert reduction</span></div>
      <div className={`stat ${result.benign_groups_raised != null && result.benign_groups_raised > 0 ? "fail" : ""}`}><strong>{number(result.benign_groups_raised)}</strong><span>benign groups raised</span></div>
    </div><p><b>Attack-group retention:</b> {savedRecall(result)} · {result.acceptance_status ?? "Not certified"}</p><p>{result.recall_scope ?? "Evaluation scope was not supplied."}</p><p>Remaining budget gap: {number(result.remaining_budget_gap)} alerts/hour</p></> : <p>No saved evaluation for this iteration. Recall and reduction are unavailable.</p>}
    <h4>Guardrail</h4>{item.guardrail ? <><p className={item.guardrail.passed ? "text-green" : "comparison-failed"}>{item.guardrail.passed ? "Passed" : "Failed"}{item.guardrail.budget_met === false ? " · Budget not met" : item.guardrail.budget_met ? " · Budget met" : ""}</p><ul>{item.guardrail.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>{item.guardrail.warnings.map((warning, index) => <p className="notice" key={index}>Warning: {warning}</p>)}</> : <p>Guardrail result unavailable.</p>}
    <h4>Recorded rule changes</h4>{item.changes.length ? <div className="table-scroll" role="region" aria-label="Recorded rule changes" tabIndex={0}><table className="baseline-table"><thead><tr><th scope="col">Rule / parameter</th><th scope="col">Old → proposed</th><th scope="col">Delta gap</th><th scope="col">Rationale</th></tr></thead><tbody>{item.changes.map((change, index) => <tr key={index}><td className="saved-version">{change.rule_id}<small>{change.parameter}</small></td><td>{number(change.old_value)} → {number(change.new_value)}</td><td>{number(change.delta_gap)}</td><td>{change.rationale}</td></tr>)}</tbody></table></div> : <p>No parameter changes recorded.</p>}
  </section>;
}

function Detail({ dataset, attemptId, listRevision }: { dataset: string; attemptId: number; listRevision: number }) {
  const [revision, refresh] = useState(0);
  const result = useSaved<SavedDetail>(`/api/saved-tuning?dataset_id=${dataset}&attempt_id=${attemptId}`, revision + listRevision);
  const detail = result.data;
  return <section aria-label="Saved attempt details"><div className="baseline-loadbar"><h2>Attempt #{attemptId}</h2><button disabled={result.loading} onClick={() => refresh(revision + 1)}>Refresh details</button></div>
    {result.loading && <p role="status">Loading all saved iterations…</p>}{result.error && <p className="baseline-message" role="alert">{result.error} {detail ? "Showing previously loaded details." : "No sample fallback is used."}</p>}
    {detail && <><section className="panel baseline-panel"><h2>{detail.attempt.status === "completed" ? "Completed tuning attempt" : detail.attempt.status === "failed" ? "Failed tuning attempt" : "Tuning attempt in progress"}</h2>
      <p>Original rules run #{detail.attempt.baseline_run_id} · {detail.attempt.created_at}</p>
      <p className="saved-version">Accepted version in this attempt: {detail.attempt.selected_version_id ?? "None"}. This is saved history, not a claim about the currently active version.</p>
      {detail.attempt.status === "failed" && <p className="baseline-message">This attempt did not activate a proposal. Previously active rules remain unchanged.</p>}
      {detail.attempt.has_error && <p role="alert">The backend recorded an attempt error. Review the saved iterations below or the backend logs.</p>}
      <Link href={baselineHref(dataset, detail.attempt.baseline_run_id)}>View Original rules replay</Link>
    </section>
    <section className="panel baseline-panel"><h2>Saved flow and delta gaps</h2>{detail.flow ? <><p>Budget: {number(detail.flow.budget_per_hour)} alerts/hour · Observed: {number(detail.flow.observed_per_hour)} alerts/hour · Burn rate: {number(detail.flow.burn_rate)}</p><div className="table-scroll" tabIndex={0} role="region" aria-label="Saved rule flow"><table className="baseline-table"><thead><tr><th scope="col">Rule</th><th scope="col">Observed/hour</th><th scope="col">Allowed/hour</th><th scope="col">Delta gap</th><th scope="col">Peak / p95</th></tr></thead><tbody>{detail.flow.rules.map(item => <tr key={item.rule_id}><td className="saved-version">{item.rule_id}</td><td>{number(item.observed_per_hour)}</td><td>{number(item.allowed_per_hour)}</td><td>{number(item.delta_gap)}</td><td>{number(item.peak_n)} / {number(item.p95_n)}</td></tr>)}</tbody></table></div></> : <p>No flow calculation was saved for this attempt.</p>}</section>
    <h2 className="audit-iterations-heading">Tuning and grouping log</h2>
    {detail.iterations.length ? detail.iterations.slice().sort((a, b) => a.iteration - b.iteration).map(item => <div key={item.id}>
      <Iteration attempt={detail.attempt} item={item}/>
      {item.tuned_run_id !== null && <RuleHistory datasetId={Number(dataset)} runId={item.tuned_run_id}/>}
    </div>) : <p className="baseline-message">No iterations have been saved yet. Refresh details after the backend updates this attempt.</p>}
    </>}
  </section>;
}

export default function SavedTuningScreen() {
  const [selected, select] = useState<number | null>(null);
  const [revision, refresh] = useState(0);
  const datasets = useSaved<{ items: Dataset[] }>("/api/baseline?resource=datasets", revision);
  const dataset = String(datasets.data?.items.find(item => item.name === "eve_demo_FINAL.json")?.id ?? datasets.data?.items.at(-1)?.id ?? "");
  const attempts = useSaved<{ items: SavedAttempt[] }>(dataset ? `/api/saved-tuning?dataset_id=${dataset}` : null, revision);
  const selectedId = selected ?? attempts.data?.items.at(-1)?.id ?? null;
  return <><a href="#saved-results" className="skip-link">Skip to audit log</a><AppHeader active="audit" sample={false} source="Tuning iterations and grouping history"/>
    <main id="saved-results"><div className="baseline-heading"><div><h1>Audit log</h1><p>Every tuning iteration, rule update, grouping result, and guardrail outcome</p></div><button disabled={datasets.loading || attempts.loading} onClick={() => refresh(revision + 1)}>Refresh log</button></div>
      {(datasets.loading || attempts.loading) && <p role="status">Loading saved results…</p>}{(datasets.error || attempts.error) && <p className="baseline-message" role="alert">{datasets.error || attempts.error} Previously loaded results remain visible where available. No sample fallback is used.</p>}
      {datasets.data?.items.length === 0 && <p>No datasets returned by the backend.</p>}
    {dataset && attempts.data?.items.length === 0 && <section className="panel baseline-panel"><h2>No saved tuning attempts yet</h2><p>The backend is reachable, but this dataset has no tuning history. Once the backend saves an attempt, use Refresh log. Failed attempts will appear here too.</p><Link href={baselineHref(dataset)}>Open Original rules replay</Link></section>}
    {Boolean(attempts.data?.items.length) && <section className="panel baseline-panel"><h2>Saved attempts</h2><div className="table-scroll" tabIndex={0} role="region" aria-label="Saved tuning attempts"><table className="baseline-table"><thead><tr><th scope="col">Attempt</th><th scope="col">Original run</th><th scope="col">Created</th><th scope="col">Status</th><th scope="col">Details</th></tr></thead><tbody>{attempts.data!.items.map(item => <tr key={item.id} className={selectedId === item.id ? "baseline-selected" : undefined}><td>#{item.id}</td><td>#{item.baseline_run_id}</td><td>{item.created_at}</td><td className={item.status === "failed" ? "comparison-failed" : ""}>{item.status}</td><td><button aria-pressed={selectedId === item.id} onClick={() => select(item.id)}>View attempt #{item.id}</button></td></tr>)}</tbody></table></div></section>}
    {dataset && selectedId !== null && <Detail key={`${dataset}:${selectedId}`} dataset={dataset} attemptId={selectedId} listRevision={revision}/>}
    <aside className="notice">Values are saved backend outputs. Recall describes the backend’s stated evaluation scope; it is not a production detection-accuracy claim.</aside>
    </main></>;
}
