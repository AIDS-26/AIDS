"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import AppHeader from "@/app/components/app-header";
import ChatAssistant from "@/app/components/chat-assistant";
import RuleHistory from "@/app/components/rule-history";
import ReplayModes from "./replay-modes";
import { initialPlayback, playbackReducer, selectFrame, type Speed } from "@/lib/replay";
import type { BaselineRun, Dataset } from "@/lib/backend-client";
import type { SavedReplay, OriginalAlert, Summary, SavedGroup, GroupPoint } from "@/lib/saved-replay";
import { parseJob, type TuningJob, type TuningSettings } from "@/lib/tuning-jobs";

function useRead<T>(url: string | null, revision: number) {
  const [state, setState] = useState<{ url: string | null; revision: number; data?: T; error?: string }>({ url: null, revision: -1 });
  useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load saved results.");
        if (!controller.signal.aborted) setState({ url, revision, data });
      } catch (error) {
        if (!controller.signal.aborted) setState(previous => ({ url, revision,
          data: previous.url === url ? previous.data : undefined,
          error: error instanceof Error ? error.message : "Unable to load saved results." }));
      }
    })();
    return () => controller.abort();
  }, [url, revision]);
  return { data: state.url === url ? state.data : undefined,
    error: state.url === url && state.revision === revision ? state.error : undefined,
    loading: url !== null && (state.url !== url || state.revision !== revision) };
}

const clock = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;

function AlertRow({ alert }: { alert: OriginalAlert }) {
  return <li className="alert-row" data-chat-id={`alert-${alert.id}`} title={`${alert.timestamp} · event #${alert.event_id} · source line ${alert.source_line} · ${alert.rule_id}`}>
    <time className="mono">{clock(alert.t)}</time><span>{alert.signature || alert.rule_name}</span>
    <span className="host mono">{alert.dest_ip || "Unknown target"}</span>
    <span className={`badge ${alert.band.toLowerCase()}`}>{alert.band} · {alert.score}</span>
  </li>;
}

function LaneSummary({ data, tuned = false }: { data: Summary | null; tuned?: boolean }) {
  return <header className="lane-summary"><h2>{tuned ? "Tuned rules" : "Original rules"}</h2>
    <p>{tuned ? "Saved groups from an accepted version on this baseline." : "Every source alert, with its saved original-rule score."}</p>
    <div className="lane-numbers"><div><strong className={`lane-count ${tuned ? "text-green" : ""}`}>{data?.total.toLocaleString() ?? "—"}</strong><span>{tuned ? "grouped alerts" : "alerts raised"}</span></div>
      {data && <dl className="breakdown">{([['High', data.high], ['Medium', data.medium], ['Low', data.low]] as const).map(([label, value]) =>
        <div key={label} className={label.toLowerCase()}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl>}
    </div></header>;
}

function Timeline({ data, t, frame }: { data: SavedReplay; t: number; frame: SavedReplay["frames"][number] }) {
  const x = (time: number) => 48 + time / data.duration_s * 1240;
  const y = (n: number) => 112 - n / Math.max(1, data.total_alerts) * 80;
  const points = (lane: "original" | "tuned") => {
    let previous = 0;
    const values = data.frames.filter(f => f.t <= t).flatMap(f => {
      const value = f[lane]?.total ?? 0;
      const step = [`${x(f.t)},${y(previous)}`, `${x(f.t)},${y(value)}`];
      previous = value;
      return step;
    });
    return [...values, `${x(t)},${y(frame[lane]?.total ?? 0)}`].join(" ");
  };
  return <section className="timeline panel" aria-labelledby="saved-timeline-title">
    <div className="chart-heading"><h2 id="saved-timeline-title">Total alerts raised so far</h2><p>Black: original rules{data.tuned_run_id !== null && " · Green: tuned rules"}</p></div>
    <svg viewBox="0 0 1320 172" role="img" aria-labelledby="saved-chart-title saved-chart-description">
      <title id="saved-chart-title">Saved-run cumulative alert counts</title>
      <desc id="saved-chart-description">At {clock(t)}, {frame.original.total} original alerts{frame.tuned ? ` and ${frame.tuned.total} grouped alerts` : "; no accepted tuned run is available"}.</desc>
      {[0, Math.ceil(data.total_alerts / 2), data.total_alerts].map((n, i) => <g key={i}><line x1="48" x2="1288" y1={y(n)} y2={y(n)} className="grid-line"/><text x="40" y={y(n) + 4} textAnchor="end">{n.toLocaleString()}</text></g>)}
      <polyline points={points("original")} className="original-line"/>
      {frame.tuned && <polyline points={points("tuned")} className="tuned-line"/>}
      <line x1={x(t)} x2={x(t)} y1="12" y2="132" className="now-line"/>
      <circle cx={x(t)} cy={y(frame.original.total)} r="3"/><text x={x(t) - 6} y={y(frame.original.total) - 7} textAnchor="end" className="endpoint">{frame.original.total.toLocaleString()}</text>
      {frame.tuned && <><circle cx={x(t)} cy={y(frame.tuned.total)} r="3" className="tuned-dot"/><text x={x(t) + 6} y={y(frame.tuned.total) + 14} className="endpoint tuned-label">{frame.tuned.total.toLocaleString()}</text></>}
      {[0, 1, 2, 3, 4].map(i => <text key={i} x={x(data.duration_s * i / 4)} y="160" textAnchor={i === 4 ? "end" : "start"}>{clock(data.duration_s * i / 4)}</text>)}
    </svg></section>;
}

function GroupCard({ group, alerts, t, pause }: { group: SavedGroup & GroupPoint; alerts: Map<number, OriginalAlert>; t: number; pause: () => void }) {
  const [open, setOpen] = useState(false), [limit, setLimit] = useState(50);
  const members = open ? group.alert_ids.map(id => alerts.get(id)!).filter(a => a.t <= t) : [];
  return <details className="group" onToggle={event => { setOpen(event.currentTarget.open); if (event.currentTarget.open) pause(); }}>
    <summary data-chat-id={`group-${group.group_id}`} className={`group-card ${group.band.toLowerCase()}`}>
      <span><strong>{group.title}</strong><small>{group.key_type}: {group.host} · {group.n.toLocaleString()} events · {group.raised_from ? `first event ${group.raised_from}, now ${group.band}` : group.band}</small></span>
      <span className="score">{group.score}<span className="chevron" aria-hidden="true">⌄</span></span>
    </summary>
    {open && <div className="group-detail"><p>Saved evidence for group #{group.group_id}. Scores come from the saved run.</p>
      <ol>{members.slice(0, limit).map(alert => <AlertRow key={alert.id} alert={alert}/>)}</ol>
      {members.length > limit && <button onClick={() => setLimit(value => value + 50)}>Show more evidence</button>}
      <small>Showing {Math.min(limit, members.length)} of {members.length.toLocaleString()} elapsed events. All evidence is retained.</small>
    </div>}</details>;
}

function TuningPrompt({ baseline, onCancel, onStarted, onOriginal }: {
  baseline: number; onCancel: () => void; onStarted: (job: TuningJob) => void; onOriginal: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), requestId = useRef<string | null>(null);
  const settings = useRead<TuningSettings>("/api/tuning-jobs", 0);
  const [starting, setStarting] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  async function start() {
    if (starting) return;
    setStarting(true); setError(null);
    requestId.current ??= crypto.randomUUID().replaceAll("-", "");
    try {
      const response = await fetch("/api/tuning-jobs", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseline_run_id: baseline, request_id: requestId.current }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to start tuning.");
      const job = parseJob(body);
      if (job.baseline_run_id !== baseline) throw new Error("Tuning job belongs to another baseline.");
      onStarted(job);
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to start tuning."); setStarting(false); }
  }
  return <dialog ref={dialog} className="tuning-prompt" aria-labelledby="tuning-prompt-title" onCancel={event => { event.preventDefault(); if (!starting) onCancel(); }}>
    <h2 id="tuning-prompt-title">Tune and play these alerts?</h2>
    <p>Use Original run #{baseline} to generate tuned rules, evaluate them, and replay the saved alerts.</p>
    {settings.loading && <p role="status">Checking tuning settings…</p>}
    {settings.data && <p>Model: <b>{settings.data.model}</b>. This starts a paid API run with up to three proposals. The guardrail checks every proposal before activation.</p>}
    {settings.data && !settings.data.ready && <p role="alert">Set CODEX_API_KEY in the backend environment or root .env before starting.</p>}
    {(settings.error || error) && <p role="alert">{error || settings.error}</p>}
    <div className="tuning-prompt-actions"><button className="primary-button" disabled={starting || !settings.data?.ready} onClick={start}>{starting ? "Starting…" : "Start tuning and play"}</button>
      <button disabled={starting} onClick={onOriginal}>Play original alerts</button><button disabled={starting} onClick={onCancel}>Cancel</button></div>
  </dialog>;
}

function Player({ data, requestTuning, autoPlayToken, busy }: {
  data: SavedReplay; requestTuning: () => void; autoPlayToken: string; busy: boolean;
}) {
  const [playback, dispatch] = useReducer(
    (state: typeof initialPlayback, action: Parameters<typeof playbackReducer>[1]) => playbackReducer(state, action, data.duration_s),
    { ...initialPlayback, t: data.duration_s },
  );
  const [alertLimit, setAlertLimit] = useState(50), [groupLimit, setGroupLimit] = useState(50);
  const byId = useMemo(() => new Map(data.alerts.map(a => [a.id, a])), [data.alerts]);
  useEffect(() => {
    if (!autoPlayToken) return;
    const now = performance.now();
    dispatch({ type: "restart", now }); dispatch({ type: "play", now });
  }, [autoPlayToken]);
  useEffect(() => { if (busy) dispatch({ type: "pause", now: performance.now() }); }, [busy]);
  useEffect(() => {
    if (!playback.playing) return;
    const timer = window.setInterval(() => dispatch({ type: "tick", now: performance.now() }), 50);
    return () => window.clearInterval(timer);
  }, [playback.playing]);
  const snapshot = selectFrame(data.frames, playback.t);
  const alerts = data.alerts.filter(a => a.t <= playback.t);
  const groups = data.groups.flatMap(group => {
    const point = group.timeline.findLast(p => p.t <= playback.t);
    return point ? [{ ...group, ...point }] : [];
  }).sort((a, b) => b.score - a.score || b.last_t - a.last_t || a.group_id - b.group_id);
  const ended = playback.t >= data.duration_s, benign = data.evaluation?.benign_groups_raised;
  const pause = () => dispatch({ type: "pause", now: performance.now() });
  function play() {
    if (!playback.playing && data.tuned_run_id === null) { requestTuning(); return; }
    const now = performance.now();
    if (ended) dispatch({ type: "restart", now });
    dispatch({ type: playback.playing ? "pause" : "play", now });
  }
  return <>
    {data.notice && <p className="notice saved-replay-notice" role="status">{data.notice}</p>}
    <div className="controls"><div className="playback" role="group" aria-label="Replay playback">
      <button className="primary-button" disabled={busy} onClick={play}>{playback.playing ? "Pause" : "Play"}</button>
      <button onClick={() => dispatch({ type: "restart", now: performance.now() })}>Restart</button>
      <button disabled={ended} onClick={() => dispatch({ type: "finish", now: performance.now() })}>Show final</button>
      <div className="speed" role="group" aria-label="Playback speed">{([60, 120, 360] as Speed[]).map(speed => <button key={speed} className={speed === playback.speed ? "selected" : ""} aria-pressed={speed === playback.speed} onClick={() => dispatch({ type: "speed", speed, now: performance.now() })}>{speed}×</button>)}</div>
    </div><span className="mono">{clock(playback.t)} / {clock(data.duration_s)}</span><span role="status">{ended ? "Saved final results" : playback.playing ? "Playing saved events" : "Paused"}</span>
      <span className="run-label">Original #{data.baseline_run_id} · {data.tuned_run_id === null ? "Tuned: unavailable" : `Tuned #${data.tuned_run_id}`}</span></div>
    <section className="stats" aria-label="Saved replay summary">
      <div className="stat"><strong>{snapshot.reduction}</strong><span>fewer alerts to read at this clock</span></div>
      <div className="stat"><strong>{snapshot.groups_raised ?? "N/A"}</strong><span>groups above their first-event severity</span></div>
      <div className={`stat ${benign === undefined ? "" : benign > 0 ? "fail" : "good"}`}><strong>{benign ?? "N/A"}</strong><span>benign groups raised · saved full-run evaluation</span></div>
      <div className="stat"><strong>{data.total_alerts.toLocaleString()}</strong><span>source alerts loaded · full dataset</span></div>
    </section>
    <Timeline data={data} t={playback.t} frame={snapshot}/>
    <div className="lanes saved-replay">
      <section className="panel lane" aria-label="Original rules alerts"><LaneSummary data={snapshot.original}/>
        <ol>{alerts.slice().reverse().slice(0, alertLimit).map(alert => <AlertRow key={alert.id} alert={alert}/>)}</ol>
        {alerts.length === 0 && <p className="empty-state">No saved events at this clock.</p>}
        <div className="saved-list-footer">Showing {Math.min(alertLimit, alerts.length)} of {snapshot.original.total.toLocaleString()} alerts. Totals include all records.
          {alerts.length > alertLimit && <button onClick={() => setAlertLimit(n => n + 50)}>Show 50 more</button>}</div>
      </section>
      <section className="panel lane" aria-label="Tuned rules grouped alerts"><LaneSummary data={snapshot.tuned} tuned/>
        {data.tuned_run_id === null ? <p className="empty-state">No accepted tuned results for Original run #{data.baseline_run_id}. Run offline tuning, then reload saved results.</p>
          : <><div className="groups">{groups.slice(0, groupLimit).map(group => <GroupCard key={group.group_id} group={group} alerts={byId} t={playback.t} pause={pause}/>)}</div>
            <div className="saved-list-footer">Showing {Math.min(groupLimit, groups.length)} of {snapshot.tuned?.total.toLocaleString()} groups.
              {groups.length > groupLimit && <button onClick={() => setGroupLimit(n => n + 50)}>Show 50 more groups</button>}</div></>}
      </section>
    </div>
    <details className="baseline-metadata"><summary>Saved run provenance</summary><dl><dt>Dataset SHA-256</dt><dd className="mono">{data.dataset.sha256}</dd><dt>Rule version</dt><dd className="mono">{data.rule_version_id}</dd><dt>Observation duration</dt><dd>{data.duration_s} seconds</dd></dl></details>
    <RuleHistory datasetId={data.dataset.id} runId={data.baseline_run_id}/>
    {data.tuned_run_id !== null && <RuleHistory datasetId={data.dataset.id} runId={data.tuned_run_id}/>}
    {data.evaluation && <p className="baseline-note">Saved evaluation #{data.evaluation.id} on tuned run #{data.evaluation.tuned_run_id}: attack-group evidence retention {data.evaluation.attack_groups_total === 0 ? "N/A (no attack groups)" : `${data.evaluation.attack_groups_retained} / ${data.evaluation.attack_groups_total}`}. {data.evaluation.recall_scope || "Curated demo evidence retention; not independently validated detection recall."}</p>}
    <aside className="notice">Attack/benign labels from CIC-IDS2017 are used only to grade results and to weight the offline tuning. At runtime, benign comes from the rule definition.</aside>
    <p className="baseline-note">Scores and playback summaries come from saved backend results. Email delivery counts and attack-window overlays are unavailable in this read model. No emails are sent.</p>
    <ChatAssistant context={{ source: data.tuned_run_id === null ? "baseline" : "replay", sample: false, dataset_id: data.dataset.id, run_id: data.tuned_run_id ?? data.baseline_run_id, replay_time_s: playback.t }}
      targets={[...alerts.slice(-50).map(a => ({ id: `alert-${a.id}`, label: `${a.signature || a.rule_name} · ${a.dest_ip}` })), ...groups.slice(0, 50).map(g => ({ id: `group-${g.group_id}`, label: g.title }))]}/>
  </>;
}

export default function SavedReplayScreen({ initialSelection }: { initialSelection?: { dataset: string; run: string; error: string | null } }) {
  const [revision, refresh] = useState(0), [chosenDataset, setDataset] = useState(initialSelection?.dataset ?? ""), [chosenRun, setRun] = useState(initialSelection?.run ?? "");
  const [linkError, clearLinkError] = useState(initialSelection?.error ?? null);
  const [prompt, setPrompt] = useState(false), [job, setJob] = useState<TuningJob | null>(null);
  const [jobError, setJobError] = useState<string | null>(null), [pollRevision, retryPoll] = useState(0);
  const [originalPlayToken, setOriginalPlayToken] = useState("");
  const datasets = useRead<{ items: Dataset[] }>("/api/baseline?resource=datasets", revision);
  const dataset = chosenDataset || String(datasets.data?.items.find(d => d.name === "eve_demo_FINAL.json")?.id ?? datasets.data?.items.at(-1)?.id ?? "");
  const runs = useRead<{ items: BaselineRun[] }>(dataset ? `/api/baseline?resource=runs&dataset_id=${dataset}` : null, revision);
  const run = chosenRun || String(runs.data?.items.findLast(r => r.mode === "baseline" && r.status === "completed")?.id ?? "");
  const replay = useRead<SavedReplay>(dataset && run ? `/api/replay?dataset_id=${dataset}&run_id=${run}` : null, revision);
  const error = datasets.error || runs.error || replay.error;
  const busy = job?.status === "running";
  const jobId = job?.id, jobStatus = job?.status, jobBaseline = job?.baseline_run_id;
  useEffect(() => {
    if (!jobId || jobStatus !== "running" || jobBaseline === undefined) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const selectedJob = { id: jobId, baseline_run_id: jobBaseline };
    async function poll() {
      try {
        const response = await fetch(`/api/tuning-jobs?job_id=${selectedJob.id}`, { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to read tuning progress.");
        const next = parseJob(body);
        if (next.id !== selectedJob.id || next.baseline_run_id !== selectedJob.baseline_run_id) throw new Error("Tuning progress belongs to another run.");
        if (controller.signal.aborted) return;
        setJob(next); setJobError(null);
        if (next.status === "running") timer = setTimeout(poll, 1500);
        else refresh(n => n + 1);
      } catch (error) {
        if (!controller.signal.aborted) setJobError(error instanceof Error ? error.message : "Unable to read tuning progress.");
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, jobStatus, jobBaseline, pollRevision]);
  const autoPlayToken = originalPlayToken || (job?.status === "completed" && replay.data?.tuned_run_id === job.tuned_run_id ? job.id : "");
  return <><a href="#saved-replay" className="skip-link">Skip to replay</a>
    <AppHeader active="replay" sample={false} source={replay.data ? `${replay.data.dataset.name} · ${replay.data.total_alerts.toLocaleString()} alerts` : "Saved runs · read-only"}/>
    <main id="saved-replay"><ReplayModes active="saved"/>
      {linkError && <p className="baseline-message" role="alert">{linkError}</p>}
      <div className="baseline-heading"><div><h1>Original vs Tuned rules</h1><p>Saved backend results · opens at the final snapshot</p></div><div className="baseline-tuning"><button disabled={busy || !replay.data} onClick={() => setPrompt(true)}>Run tuning</button><small>Generate, evaluate, then replay</small></div></div>
      <section className="panel baseline-panel"><h2>Select saved results</h2><div className="baseline-selectors">
        <label>Dataset<select disabled={busy || datasets.loading || !datasets.data?.items.length} value={dataset} onChange={event => { setDataset(event.target.value); setRun(""); clearLinkError(null); setJob(null); setOriginalPlayToken(""); }}><option value="" disabled>Choose a dataset</option>{datasets.data?.items.map(d => <option key={d.id} value={d.id}>#{d.id} · {d.name} · {d.event_count.toLocaleString()} events</option>)}</select></label>
        <label>Original run<select disabled={busy || !dataset || runs.loading} value={run} onChange={event => { setRun(event.target.value); clearLinkError(null); setJob(null); setOriginalPlayToken(""); }}><option value="" disabled>Choose a completed baseline</option>{runs.data?.items.map(r => <option key={r.id} value={r.id} disabled={r.mode !== "baseline" || r.status !== "completed"}>#{r.id} · {r.mode === "baseline" ? "Original rules" : "Tuned rules"} · {r.status}</option>)}</select></label>
        <button disabled={datasets.loading || runs.loading || replay.loading} onClick={() => refresh(n => n + 1)}>{error ? "Retry saved results" : "Reload saved results"}</button>
      </div>
        {(datasets.loading || runs.loading || replay.loading) && <p role="status">Loading saved results and every alert. Previously loaded results remain visible where available.</p>}
        {error && <p className="baseline-message" role="alert">{error} {replay.data ? "Showing the previously loaded run." : "No sample data substituted."}</p>}
        {datasets.data?.items.length === 0 && <p>No imported datasets. Import and score a dataset in the backend first.</p>}
        {dataset && runs.data && !run && <p>No completed Original rules run exists for this dataset. Failed and unfinished runs cannot play.</p>}
      </section>
      {job && <section className="panel baseline-panel" aria-label="Tuning progress"><h2>Tuning run{job.attempt_id ? ` · attempt #${job.attempt_id}` : ""}</h2>
        <p role="status">{job.model} · {busy ? `Running · proposal ${job.iteration || 1} of 3 · ${job.iteration_status}` : job.status === "completed" ? `Passed · tuned run #${job.tuned_run_id}` : "Failed · saved original alerts remain available"}</p>
        {(jobError || job.error) && <p role="alert">{jobError || job.error}</p>}
        {jobError && <button onClick={() => retryPoll(n => n + 1)}>Retry tuning status</button>}
        {job.status === "failed" && <button onClick={() => setOriginalPlayToken(crypto.randomUUID())}>Play original alerts</button>}
        <a href="/audit">View saved audit history</a>
      </section>}
      {replay.data && <Player key={`${replay.data.baseline_run_id}:${replay.data.tuned_run_id}`} data={replay.data} busy={busy} autoPlayToken={autoPlayToken} requestTuning={() => setPrompt(true)}/>}
      {prompt && replay.data && <TuningPrompt baseline={replay.data.baseline_run_id} onCancel={() => setPrompt(false)}
        onOriginal={() => { setPrompt(false); setOriginalPlayToken(crypto.randomUUID()); }}
        onStarted={next => { setPrompt(false); setOriginalPlayToken(""); setJobError(null); setJob(next); }}/>}
    </main></>;
}
