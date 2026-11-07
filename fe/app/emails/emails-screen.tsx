"use client";

import { useState } from "react";
import Link from "next/link";
import AppHeader from "@/app/components/app-header";
import ChatAssistant from "@/app/components/chat-assistant";
import type { EmailsData } from "@/lib/data";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="email-field"><dt>{label}</dt><dd>{children}</dd></div>;
}

const clock = (seconds: number) => [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map((n, i) => i ? String(n).padStart(2, "0") : String(n)).join(":");

export default function Emails({ data }: { data: EmailsData }) {
  const [selectedId, setSelectedId] = useState(data.default_email_id);
  const email = data.tuned.find(item => item.id === selectedId) ?? data.tuned[0];
  const group = email?.group;

  return <>
    <a href="#emails" className="skip-link">Skip to email previews</a>
    <AppHeader active="emails" source="Synthetic email previews"/>
    <ChatAssistant context={{ source: "emails", sample: true, run_id: data.run_id, item_id: email?.id }}/>
    <main id="emails">
      <header className="audit-title"><h1>Email</h1><p>SIEM 2 · Tuned rules · Grouped alert details and clustered source logs</p></header>
      <p className="email-disclosure">Sample · Preview only · No emails sent · Run <span className="mono">{data.run_id}</span> · Group snapshot {data.snapshot_clock}</p>
      <div className="email-columns">
        <section className="panel email-list-panel" aria-label="Tuned group email previews">
          <header className="email-list-heading"><h2>Tuned rules</h2><strong className="text-green">{data.tuned.length} grouped email previews</strong></header>
          <ul className="email-list">{data.tuned.map(item => <li key={item.id}>
            <button className="email-item" aria-pressed={email?.id === item.id} aria-controls="email-preview" onClick={() => setSelectedId(item.id)}>
              <span className="email-item-top"><strong>{item.subject}</strong><span className="email-time mono">{item.time_label}</span></span>
              <small>{item.target} · {item.clustered_logs.length} clustered {item.clustered_logs.length === 1 ? "log" : "logs"}</small>
              <small className="mono">{item.group_id}</small>
            </button>
          </li>)}</ul>
          <p className="email-list-footer">One preview per High group · none sent</p>
        </section>
        {email ? <section id="email-preview" className="panel email-preview" aria-labelledby="email-preview-title">
          <div className="email-preview-heading"><h2 id="email-preview-title">Tuned rules · grouped alert email</h2><span className="status-badge preview-badge">Sample · Not sent</span></div>
          <p className="sr-only" role="status">Selected email: {email.subject}, group {email.group_id}</p>
          <dl className="email-envelope">
            <Field label="From">{email.from}</Field><Field label="To">{email.to}</Field><Field label="Subject">{email.subject} ({email.target})</Field>
          </dl>
          <p className="email-intro">{email.intro}</p>
          <dl className="email-fields">
            <Field label="Target">{email.target}, {email.asset_name}</Field>
            <Field label="Attack type">{email.attack_type.replaceAll("_", " ")}</Field>
            <Field label="Notification">{email.time_label} · {email.events} {email.events === 1 ? "event" : "events"} · score {email.score} ({email.band}, base {email.base_score})</Field>
            <Field label="Source">{email.source}</Field>
            <Field label="Rule settings">{email.rule_settings ?? "Not supplied in this sample"}</Field>
            <Field label="Rule"><span className="mono">{email.rule_id}</span></Field>
            <Field label="Group"><span className="mono">{email.group_id}</span></Field>
            <Field label="Cluster key">{group ? <>{group.key_type}: {group.key} + {group.attack_type.replaceAll("_", " ")}</> : "Not supplied"}</Field>
            <Field label="Group snapshot">{group ? <>{email.clustered_logs.length} logs · score {group.score} ({group.band}) · {clock(group.first_t)}–{clock(group.last_t)}</> : "Not supplied"}</Field>
          </dl>
          <section className="email-cluster" aria-labelledby="cluster-logs-title">
            <h3 id="cluster-logs-title">Clustered logs ({email.clustered_logs.length})</h3>
            <p>Full group at {data.snapshot_clock}. Logs received after the first notification are marked below; they were not part of the initial email.</p>
            <div className="table-scroll" role="region" aria-label="Clustered source logs" tabIndex={0}>
              <table className="baseline-table"><thead><tr><th scope="col">Log / timestamp</th><th scope="col">Signature / rule</th><th scope="col">Source → destination</th><th scope="col">Original score</th><th scope="col">Email snapshot</th></tr></thead>
                <tbody>{email.clustered_logs.map(log => <tr key={log.id}>
                  <td><span className="mono">{log.id}</span><small>{log.ts}</small></td>
                  <td>{log.signature}<small className="mono">{log.rule_id}</small></td>
                  <td className="mono">{log.src_ip} → {log.dest_ip}:{log.dest_port}</td>
                  <td><span className={"badge " + log.band.toLowerCase()}>{log.score} · {log.band}</span></td>
                  <td>{email.alert_ids.includes(log.id) ? "At notification" : "Joined later"}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {email.clustered_logs.length === 0 && <p>No source logs supplied for this group.</p>}
          </section>
          <p className="email-footnote">{email.footnote}</p>
          <Link href="/replay" className="button-link primary-button">Open Replay in IDEA-X</Link>
        </section> : <p id="email-preview" className="empty-state">No tuned group email previews available.</p>}
      </div>
      <aside className="notice">Synthetic sample previews only. Scores, bands, memberships, and notification snapshots come from saved fixtures. Email sending and backend email integration are not connected.</aside>
    </main>
  </>;
}
