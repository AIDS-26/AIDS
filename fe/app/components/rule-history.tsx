"use client";

import { useEffect, useState } from "react";
import type { RuleVersion } from "@/lib/rule-history";

function HistoryContent({ datasetId, runId }: { datasetId: number; runId: number }) {
  const [revision, refresh] = useState(0);
  const [state, setState] = useState<{ revision: number; items?: RuleVersion[]; error?: string }>({ revision: -1 });
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/rule-history?dataset_id=${datasetId}&run_id=${runId}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load rule history.");
        if (!controller.signal.aborted) setState({ revision, items: data.items });
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ ...previous, revision, error: error instanceof Error ? error.message : "Could not load rule history." }));
      }
    })();
    return () => controller.abort();
  }, [datasetId, runId, revision]);
  const loading = state.revision !== revision;
  return <><div className="baseline-loadbar"><p>Selected run → ancestor versions. Statuses are the backend’s saved values at fetch time.</p><button disabled={loading} onClick={() => refresh(revision + 1)}>Refresh history</button></div>
    {loading && <p role="status">Loading complete rule history…</p>}{state.error && !loading && <p role="alert">{state.error} {state.items ? "Showing previously loaded history." : "No sample fallback is used."}</p>}
    {state.items?.map((version, index) => <details className="history-version" key={version.version_id} open={index === 0 ? true : undefined}><summary><span>{index === 0 ? "Run version" : `Ancestor ${index}`} · {version.status} · Guardrail: {version.guardrail_status}</span><span className="mono">{version.version_id}</span></summary>
      <p>Created: {version.created_at}</p><p className="saved-version">Parent: {version.parent_id ?? "None · root version"}</p><p>{version.rationale ?? "No rationale supplied."}</p>
      {version.changes.length ? <div className="table-scroll" role="region" aria-label={`Changes in ${version.version_id}`} tabIndex={0}><table className="baseline-table"><thead><tr><th scope="col">Rule / parameter</th><th scope="col">Old → new</th><th scope="col">Delta gap</th><th scope="col">Rationale</th></tr></thead><tbody>{version.changes.map((change, index) => <tr key={index}><td className="saved-version">{change.rule_id ?? "Not supplied"}<small>{change.parameter ?? "Not supplied"}</small></td><td>{change.old_value ?? "Not supplied"} → {change.new_value ?? "Not supplied"}</td><td>{change.delta_gap ?? "Not supplied"}</td><td>{change.rationale ?? "Not supplied"}</td></tr>)}</tbody></table></div> : <p>No parameter changes recorded for this version.</p>}
    </details>)}
  </>;
}

export default function RuleHistory({ datasetId, runId }: { datasetId: number; runId: number }) {
  const [open, setOpen] = useState(false);
  return <section className="panel baseline-panel"><div className="baseline-loadbar"><h2>Rule-version history · run #{runId}</h2><button aria-expanded={open} aria-controls={`history-${runId}`} onClick={() => setOpen(!open)}>{open ? "Hide history" : "Show history"}</button></div>{open && <div id={`history-${runId}`}><HistoryContent key={`${datasetId}:${runId}`} datasetId={datasetId} runId={runId}/></div>}</section>;
}
