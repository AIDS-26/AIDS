"use client";

import ReplayModes from "../replay-modes";
import { useEffect, useReducer, useState } from "react";
import AppHeader from "@/app/components/app-header";
import ChatAssistant from "@/app/components/chat-assistant";
import type { BaselineAlert, BaselineRun, Dataset, Evidence } from "@/lib/backend-client";
import { initialPlayback, playbackReducer, type Speed } from "@/lib/replay";

type Result = { datasets: { items: Dataset[] }; runs: { items: BaselineRun[] }; alerts: { items: BaselineAlert[]; run: BaselineRun }; evidence: { items: Evidence[] } };
function useBackend<K extends keyof Result>(kind: K, query: string | null, revision = 0) {
  const [state, setState] = useState<{ key: string; data?: Result[K]; error?: string }>({ key: "" });
  const key = `${query}:${revision}`;
  useEffect(() => {
    if (query === null) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/baseline?resource=${kind}${query}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load baseline data.");
        if (data.kind !== kind) throw new Error("Unexpected baseline response.");
        if (!controller.signal.aborted) setState({ key, data });
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ key, data: previous.key.split(":")[0] === query ? previous.data : undefined, error: error instanceof Error ? error.message : "Unable to load baseline data." }));
      }
    })();
    return () => controller.abort();
  }, [kind, query, key]);
  return { data: state.key.split(":")[0] === query ? state.data : undefined, error: state.key === key ? state.error : undefined, loading: query !== null && state.key !== key };
}

const clock = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;

function EvidencePanel({ dataset, run, alert }: { dataset: number; run: number; alert: number }) {
  const [revision, refresh] = useState(0);
  const result = useBackend("evidence", `&dataset_id=${dataset}&run_id=${run}&alert_id=${alert}`, revision);
  return <section id={`evidence-${alert}`} className="baseline-evidence" aria-label={`Evidence for alert ${alert}`} aria-busy={result.loading}><h3>Evidence · alert #{alert}</h3>
    {result.loading && <p role="status">Loading saved evidence…</p>}{result.error && <div className="baseline-message" role="alert"><p>{result.error}</p><button onClick={() => refresh(revision + 1)}>Retry evidence</button></div>}
    {result.data?.items.map(event => <dl key={event.id}><dt>Event / source line</dt><dd>{event.id} / {event.source_line}</dd><dt>Timestamp</dt><dd>{event.timestamp}</dd><dt>Source → target</dt><dd>{event.src_ip ?? "Not supplied"} → {event.dest_ip ?? "Not supplied"}</dd><dt>Saved raised score</dt><dd>{event.raised_score ?? "Not supplied"}</dd><dt>Signature</dt><dd>{event.signature ?? "Not supplied"}</dd></dl>)}
    {result.data?.items.length === 0 && <p>No saved evidence returned.</p>}
  </section>;
}

function Player({ run, items }: Result["alerts"]) {
  const [playback, dispatch] = useReducer((state: typeof initialPlayback, action: Parameters<typeof playbackReducer>[1]) => playbackReducer(state, action, run.observation_seconds), initialPlayback);
  const [selected, select] = useState<number | null>(null);
  useEffect(() => {
    if (!playback.playing) return;
    const timer = window.setInterval(() => dispatch({ type: "tick", now: performance.now() }), 50);
    return () => window.clearInterval(timer);
  }, [playback.playing]);
  const origin = items[0]?.first_timestamp_us ?? 0;
  const visible = items.filter(alert => (alert.first_timestamp_us - origin) / 1e6 <= playback.t);
  const ended = playback.t >= run.observation_seconds;
  return <>
    <div className="controls"><div className="playback" role="group" aria-label="Replay playback">
      <button className="primary-button" disabled={ended || !items.length} onClick={() => dispatch({ type: playback.playing ? "pause" : "play", now: performance.now() })}>{playback.playing ? "Pause" : "Play"}</button>
      <button onClick={() => { select(null); dispatch({ type: "restart", now: performance.now() }); }}>Restart</button>
      <div className="speed" role="group" aria-label="Playback speed">{([60, 120, 360] as Speed[]).map(speed => <button key={speed} className={speed === playback.speed ? "selected" : ""} aria-pressed={speed === playback.speed} onClick={() => dispatch({ type: "speed", speed, now: performance.now() })}>{speed}×</button>)}</div>
    </div><span className="mono">{clock(playback.t)} / {clock(run.observation_seconds)}</span><span role="status">{ended ? "Complete · restart to replay" : playback.playing ? "Playing" : "Paused"}</span></div>
    <section className="panel baseline-panel"><h2>Original rules · run #{run.id}</h2>
      <p className="baseline-subtitle">Dataset #{run.dataset_id} · Saved scores and severity · No live tuning</p>
      <details className="baseline-metadata"><summary>Run provenance and clock details</summary><dl><dt>Rule version</dt><dd className="mono">{run.rule_version_id ?? "Not supplied"}</dd><dt>Completed</dt><dd>{run.completed_at ?? "Not supplied"}</dd><dt>Clock starts at</dt><dd>{items[0]?.timestamp ?? "No alerts"}</dd><dt>Observation duration</dt><dd>{run.observation_seconds} seconds (saved by the backend)</dd></dl><p>Records appear at their event timestamps. Scores and severity come unchanged from the backend.</p></details>
      <progress aria-label="Replay elapsed time" max={run.observation_seconds} value={playback.t}/>
      <p><strong>{visible.length.toLocaleString()} / {items.length.toLocaleString()}</strong> loaded alert records elapsed · showing the latest 50. This is a record count, not an evaluator metric.</p>
      {items.length === 0 ? <div className="baseline-message"><strong>No calculated alerts</strong><p>This completed run has no saved alert records. Choose another run or refresh after the backend has saved its results.</p></div> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Original alerts; scroll horizontally on smaller screens"><table className="baseline-table"><caption className="sr-only">Latest elapsed Original rules alerts. Opening evidence pauses playback.</caption><thead><tr><th scope="col">Elapsed</th><th scope="col">Signature / rule</th><th scope="col">Target</th><th scope="col">Score</th><th scope="col">Severity</th><th scope="col">Evidence</th></tr></thead><tbody>{visible.slice(-50).reverse().map(alert => <tr key={alert.id} data-chat-id={String(alert.id)} className={selected === alert.id ? "baseline-selected" : undefined}><td className="mono">{clock((alert.first_timestamp_us-origin)/1e6)}</td><td><strong>{alert.signature ?? alert.attack_type}</strong><details className="baseline-rule"><summary>Rule ID</summary><span className="mono">{alert.rule_id}</span></details></td><td className="mono">{alert.dest_ip ?? "Not supplied"}</td><td>{alert.score}</td><td><span className={`badge ${alert.severity.toLowerCase()}`}>{alert.severity}</span></td><td><button aria-expanded={selected === alert.id} aria-controls={selected === alert.id ? `evidence-${alert.id}` : undefined} onClick={() => { if (selected !== alert.id) dispatch({ type: "pause", now: performance.now() }); select(selected === alert.id ? null : alert.id); }}>Alert #{alert.id}</button></td></tr>)}</tbody></table></div>}
      {selected !== null && visible.some(alert => alert.id === selected) && <EvidencePanel key={selected} dataset={run.dataset_id} run={run.id} alert={selected}/>}
    </section>
    <section className="panel baseline-panel"><h2>Tuned rules · unavailable</h2><p>No tuned run is connected. Reduction, recall, benign groups raised, comparison chart, and email metrics are unavailable in baseline-only mode.</p></section>
    <ChatAssistant context={{ source: "baseline", sample: false, dataset_id: run.dataset_id, run_id: run.id, replay_time_s: playback.t }} targets={visible.slice(-50).map(alert => ({ id: String(alert.id), label: `${alert.signature ?? alert.attack_type} · ${alert.dest_ip ?? "Unknown target"}` }))}/>
  </>;
}

function RunLoader({ dataset, run }: { dataset: number; run: number }) {
  const [revision, refresh] = useState(0);
  const result = useBackend("alerts", `&dataset_id=${dataset}&run_id=${run}`, revision);
  return <><div className="baseline-loadbar"><span>Selected run <strong>#{run}</strong></span><button disabled={result.loading} onClick={() => refresh(revision + 1)}>{result.loading ? "Loading run…" : result.error ? "Retry loading run" : "Reload saved run"}</button></div>{result.loading && <p className="baseline-message" role="status">Loading all saved alerts before playback. {result.data ? "The previously loaded run remains available below." : "Larger datasets may take a few seconds."}</p>}{result.error && <p className="baseline-message" role="alert">{result.error} {result.data ? "Showing the previously loaded run." : "No sample data substituted."}</p>}{result.data && <Player key={run} {...result.data}/>}</>;
}

export default function BaselineScreen() {
  const [revision, refresh] = useState(0);
  const datasets = useBackend("datasets", "", revision);
  const [dataset, setDataset] = useState("");
  const [run, setRun] = useState("");
  const runs = useBackend("runs", dataset ? `&dataset_id=${dataset}` : null, revision);
  return <><a className="skip-link" href="#baseline">Skip to replay</a><AppHeader active="replay" sample={false} source="Original rules · read-only"/>
    <main id="baseline"><ReplayModes active="baseline"/>
      <div className="baseline-heading"><div><h1>Original rules replay</h1><p>Saved backend results · baseline only</p></div><div className="baseline-tuning"><button disabled aria-describedby="tuning-unavailable">Run tuning</button><small id="tuning-unavailable">Live tuning is not connected</small></div></div>
      <section className="panel baseline-panel"><h2>Select a saved baseline</h2><div className="baseline-selectors">
        <label>Dataset<select disabled={datasets.loading || !datasets.data?.items.length} value={dataset} onChange={event => { setDataset(event.target.value); setRun(""); }}><option value="">{datasets.loading ? "Loading datasets…" : "Choose a dataset"}</option>{datasets.data?.items.map(item => <option key={item.id} value={item.id}>#{item.id} · {item.name} · {item.event_count} events</option>)}</select></label>
        <label>Run<select disabled={!dataset || runs.loading} value={run} onChange={event => setRun(event.target.value)}><option value="">Choose a completed baseline</option>{runs.data?.items.map(item => <option key={item.id} value={item.id} disabled={item.mode !== "baseline" || item.status !== "completed"}>#{item.id} · {item.mode === "baseline" ? "Original rules" : item.mode} · {item.status}</option>)}</select></label>
        <button disabled={datasets.loading || runs.loading} onClick={() => refresh(revision + 1)}>Refresh lists</button></div>
        {(datasets.loading || runs.loading) && <p role="status">Loading saved datasets and runs…</p>}{(datasets.error || runs.error) && <div className="baseline-message" role="alert"><strong>Could not refresh saved results</strong><p>{datasets.error || runs.error}</p><p>Check that the backend read API is running, then use Refresh lists. Sample demo remains available separately.</p></div>}
        {!dataset && !datasets.loading && !datasets.error && Boolean(datasets.data?.items.length) && <p className="baseline-subtitle">Choose a dataset, then a completed Original rules run to begin.</p>}
        {datasets.data?.items.length === 0 && <p>No datasets available. Import and score a dataset in the backend first.</p>}
        {dataset && runs.data && !runs.data.items.some(item => item.mode === "baseline" && item.status === "completed") && <p>No completed Original rules run. Failed and unfinished runs cannot be replayed.</p>}
      </section>
      {dataset && run && <RunLoader key={`${dataset}:${run}`} dataset={Number(dataset)} run={Number(run)}/>}
      <p className="baseline-note">Evaluation labels are not used by this replay. At runtime, benign comes from the rule definition. Curated labels may be used only for evaluation and offline tuning evidence. Tuning, Audit log, and Emails remain separately labelled sample screens.</p>
    </main></>;
}
