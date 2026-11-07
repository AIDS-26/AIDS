"use client";

import { useEffect, useReducer } from "react";
import { initialPlayback, playbackReducer, selectFrame, type Speed } from "@/lib/replay";
import type { ReplayData } from "@/lib/data";
import AppHeader from "@/app/components/app-header";
import ChatAssistant from "@/app/components/chat-assistant";

function clock(seconds: number) {
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;
}

function Badge({ band }: { band: string }) {
  return <span className={`badge ${band.toLowerCase()}`}>{band}</span>;
}

function AlertRow({ alert }: { alert: ReplayData["alerts"][number] }) {
  return <li className="alert-row" data-chat-id={alert.id}>
    <time className="mono">{clock(alert.t)}</time>
    <span>{alert.rule_name}</span>
    <span className="host mono">{alert.dest_ip}</span>
    <Badge band={alert.band} />
  </li>;
}

function LaneSummary({ data, tuned = false }: { data: ReplayData["frames"][number]["original"]; tuned?: boolean }) {
  return <header className="lane-summary">
    <h2>{tuned ? "Tuned rules" : "Original rules"}</h2>
    <p>{tuned ? "Related alerts grouped by target and attack type. Scanners group by source." : "Every alert on its own, scored from the base rules."}</p>
    <div className="lane-numbers">
      <div><strong className={`lane-count ${tuned ? "text-green" : ""}`}>{data.total}</strong><span>{tuned ? "grouped alerts" : "alerts raised"}</span></div>
      <dl className="breakdown">
        {([['High', data.high], ['Medium', data.medium], ['Low', data.low], ['Emails (dry-run)', data.emails]] as const).map(([label, value]) =>
          <div key={label} className={label.split(' ')[0].toLowerCase()}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </div>
  </header>;
}

function Timeline({ data, t, frame }: { data: ReplayData; t: number; frame: ReplayData["frames"][number] }) {
  const x = (time: number) => 40 + (time / data.duration_s) * 1260;
  const y = (n: number) => 112 - (n / data.total_alerts) * 80;
  const points = (lane: "original" | "tuned") => {
    let previous = 0;
    const values = data.frames.filter(f => f.t <= t).flatMap(f => {
      const step = [x(f.t) + "," + y(previous), x(f.t) + "," + y(f[lane].total)];
      previous = f[lane].total;
      return step;
    });
    return [...values, x(t) + "," + y(frame[lane].total)].join(" ");
  };
  return <section className="timeline panel" aria-labelledby="timeline-title">
    <div className="chart-heading"><h2 id="timeline-title">Total alerts raised so far</h2><p>Black: original rules · Green: tuned rules · Red: elapsed attack windows (sample labels)</p></div>
    <svg viewBox="0 0 1320 172" role="img" aria-labelledby="chart-title chart-description">
      <title id="chart-title">Sample cumulative alert counts</title>
      <desc id="chart-description">At {clock(t)}, {frame.original.total} original alerts are represented by {frame.tuned.total} grouped alerts. Illustrative fixture values, not measured results.</desc>
      {[0, 6, 12].map(n => <g key={n}><line x1="40" x2="1300" y1={y(n)} y2={y(n)} className="grid-line"/><text x="32" y={y(n) + 4} textAnchor="end">{n}</text></g>)}
      {data.windows.map(w => <g key={w.name}><rect x={x(w.start_t)} y="120" width={Math.max(0, x(Math.min(t,w.end_t)) - x(w.start_t))} height="10" className="attack-window"/><text x={x(w.start_t)} y={w.name === "Exploit" ? 156 : 144}>{w.name}</text></g>)}
      <polyline points={points("original")} className="original-line"/><polyline points={points("tuned")} className="tuned-line"/>
      <line x1={x(t)} x2={x(t)} y1="12" y2="132" className="now-line"/>
      <circle cx={x(t)} cy={y(frame.original.total)} r="3"/><text x={x(t) - 6} y={y(frame.original.total) - 7} textAnchor="end" className="endpoint">{frame.original.total}</text>
      <circle cx={x(t)} cy={y(frame.tuned.total)} r="3" className="tuned-dot"/><text x={x(t) + 6} y={y(frame.tuned.total) + 14} className="endpoint tuned-label">{frame.tuned.total}</text>
      {[0, 2400, 4800, 7200, 9660].map(time => <text key={time} x={x(time)} y="170" textAnchor={time === 9660 ? "end" : "start"}>{clock(time).slice(0, -3)}</text>)}
    </svg>
  </section>;
}

export default function Replay({ data }: { data: ReplayData }) {
  const [playback, dispatch] = useReducer(
    (state: typeof initialPlayback, action: Parameters<typeof playbackReducer>[1]) => playbackReducer(state, action, data.duration_s),
    initialPlayback,
  );
  useEffect(() => {
    if (!playback.playing) return;
    const timer = window.setInterval(() => dispatch({ type: "tick", now: performance.now() }), 50);
    return () => window.clearInterval(timer);
  }, [playback.playing]);
  const snapshot = selectFrame(data.frames, playback.t);
  const alerts = data.alerts.filter(alert => alert.t <= playback.t);
  const groups = snapshot.groups.map(state => ({ ...data.groups.find(group => group.group_id === state.group_id)!, ...state }))
    .sort((a,b) => b.score-a.score || b.last_t-a.last_t || a.group_id.localeCompare(b.group_id));
  const ended = playback.t >= data.duration_s;
  return <>
    <a href="#replay" className="skip-link">Skip to replay</a>
    <AppHeader active="replay" source={`Synthetic fixtures · ${data.total_alerts} alerts`}/>
    <main id="replay">
      <h1 className="sr-only">Replay — original and tuned rules</h1>
      <div className="controls">
        <div className="playback" role="group" aria-label="Replay playback">
          <button className="primary-button" disabled={ended} onClick={() => dispatch({ type: playback.playing ? "pause" : "play", now: performance.now() })}>{playback.playing ? "Pause" : "Play"}</button>
          <button onClick={() => dispatch({ type: "restart", now: performance.now() })}>Restart</button>
          <div className="speed" role="group" aria-label="Playback speed">{([60, 120, 360] as Speed[]).map(n => <button key={n} aria-pressed={playback.speed === n} className={playback.speed === n ? "selected" : ""} onClick={() => dispatch({ type: "speed", speed: n, now: performance.now() })}>{n}×</button>)}</div>
        </div>
        <span>Demo clock <span className="mono">{clock(playback.t)} / {clock(data.duration_s)}</span></span>
        <span className="static-label" role="status">Sample replay · {ended ? "Complete" : playback.playing ? "Playing" : "Paused"}</span>
        <span className="run-label">Tuned rules from <b>{data.run_id}</b></span>
      </div>
      <section className="stats" aria-label="Sample replay summary">
        <div className="stat"><strong>{snapshot.reduction}</strong><span>fewer alerts to read</span></div>
        <div className="stat"><strong>{snapshot.groups_raised}</strong><span>groups moved up a severity band</span></div>
        <div className={`stat ${snapshot.benign_raised > 0 ? "fail" : "good"}`}><strong>{snapshot.benign_raised}</strong><span>benign groups raised (must stay 0)</span></div>
        <div className="stat"><strong>{snapshot.original.emails} → {snapshot.tuned.emails}</strong><span>emails, original → tuned · dry-run</span></div>
      </section>
      <Timeline data={data} t={playback.t} frame={snapshot}/>
      <div className="lanes">
        <section className="panel lane" aria-label="Original rules alerts"><LaneSummary data={snapshot.original}/>{alerts.length === 0 && <p className="empty-state">No alerts yet. Press Play to begin the sample replay.</p>}<ol className="alert-list">{[...alerts].sort((a,b) => b.t-a.t).map(alert => <AlertRow key={alert.id} alert={alert}/>)}</ol></section>
        <section className="panel lane" aria-label="Tuned rules grouped alerts"><LaneSummary data={snapshot.tuned} tuned/><div className="groups">
          {groups.length === 0 && <p className="empty-state">Groups appear as sample events arrive.</p>}
          {groups.map(group => <details key={group.group_id} className="group">
            <summary data-chat-id={group.group_id} className={`group-card ${group.benign_rule ? "benign" : group.band.toLowerCase()}`}>
              <span><strong>{group.title}</strong><small>{group.alert_ids.length} {group.alert_ids.length === 1 ? "event" : "events"} · {group.raised_from ? `raised from ${group.raised_from} to ${group.band}` : group.band}{group.benign_rule ? " · benign, not raised" : group.email_t !== null ? " · email (dry-run)" : ""}</small></span>
              <span className="score">{group.score}<span className="chevron" aria-hidden="true">⌄</span></span>
            </summary>
            <div className="group-detail"><p>{group.explanation}</p><ol>{alerts.filter(a => group.alert_ids.includes(a.id)).map(alert => <AlertRow key={alert.id} alert={alert}/>)}</ol><small>All original alerts in this sample group are retained. Click the card to collapse.</small></div>
          </details>)}
        </div></section>
      </div>
      <aside className="notice">Attack/benign labels from CIC-IDS2017 are used only to grade results and to weight the offline tuning. At runtime, benign comes from the rule definition.</aside>
      <p className="sample-note">Sample preview · Synthetic data, not CIC-IDS2017 results. No evaluator has run and no emails have been sent.</p>
    </main>
    <ChatAssistant context={{ source: "replay", sample: true, run_id: data.run_id, replay_time_s: playback.t }} targets={[...alerts.map(alert => ({ id: alert.id, label: `${alert.rule_name} · ${alert.dest_ip}` })), ...groups.map(group => ({ id: group.group_id, label: group.title }))]}/>
  </>;
}
