"use client";

import { useState } from "react";
import Link from "next/link";
import AppHeader from "@/app/components/app-header";
import ChatAssistant from "@/app/components/chat-assistant";
import type { EmailsData } from "@/lib/data";

type Email = EmailsData["original"][number] | EmailsData["tuned"][number];

function EmailList({ title, count, emails, selected, onSelect, tuned = false }: {
  title: string; count: number; emails: Email[]; selected: string; onSelect: (id: string) => void; tuned?: boolean;
}) {
  return <section className="panel email-list-panel" aria-label={`${title} email previews`}>
    <header className="email-list-heading"><h2>{title}</h2><strong className={tuned ? "text-green" : ""}>{count} email previews</strong></header>
    <ul className="email-list">{emails.map(email => <li key={email.id}>
      <button className="email-item" aria-pressed={selected === email.id} aria-controls="email-preview" onClick={() => onSelect(email.id)}>
        <span className="email-item-top"><strong>{email.subject}</strong><span className="email-time mono">{email.time_label}</span></span>
        <small>{email.target} · {email.events} {email.events === 1 ? "event" : "events"}{tuned ? " at notification" : ""}</small>
      </button>
    </li>)}</ul>
    <p className="email-list-footer">{tuned ? "One preview per High group" : "One preview per High alert"} · none sent</p>
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="email-field"><dt>{label}</dt><dd>{children}</dd></div>;
}

export default function Emails({ data }: { data: EmailsData }) {
  const [selectedId, setSelectedId] = useState(data.default_email_id);
  const email = [...data.original, ...data.tuned].find(item => item.id === selectedId)!;
  const tuned = email.kind === "tuned";

  return <>
    <a href="#emails" className="skip-link">Skip to email previews</a>
    <AppHeader active="emails" source="Synthetic fixtures · 12 alerts"/>
    <ChatAssistant context={{ source: "emails", sample: true, run_id: data.run_id, item_id: selectedId }}/>
    <main id="emails">
      <header className="audit-title"><h1>Emails to the on-call analyst</h1><p>Saved sample snapshot ({data.snapshot_clock}). Original rules notify for each High alert; Tuned rules notify once per High group.</p></header>
      <p className="email-disclosure">Preview only · No emails sent, no inbox connected · Run <span className="mono">{data.run_id}</span></p>
      <div className="email-columns">
        <EmailList title="Original rules" count={data.original_count} emails={data.original} selected={selectedId} onSelect={setSelectedId}/>
        <EmailList title="Tuned rules" count={data.tuned_count} emails={data.tuned} selected={selectedId} onSelect={setSelectedId} tuned/>
        <section id="email-preview" className="panel email-preview" aria-labelledby="email-preview-title">
          <div className="email-preview-heading"><h2 id="email-preview-title">{tuned ? "Tuned rules" : "Original rules"} · email preview</h2><span className="status-badge preview-badge">Not sent</span></div>
          <p className="sr-only" role="status">Selected {tuned ? "tuned" : "original"} email: {email.subject}, demo time {email.time_label}</p>
          <dl className="email-envelope">
            <Field label="From">{email.from}</Field><Field label="To">{email.to}</Field><Field label="Subject">{email.subject} ({email.target}), {email.events} {email.events === 1 ? "event" : "events"}</Field>
          </dl>
          <p className="email-intro">{email.intro}</p>
          <dl className="email-fields">
            <Field label="Target">{email.target}, {email.asset_name}</Field>
            <Field label="Attack type">{email.attack_type.replaceAll("_", " ")}</Field>
            <Field label="Score">{email.score} · {email.band} (base {email.base_score})</Field>
            <Field label="Events">{email.events}, first at {email.first_time_label}</Field>
            <Field label="Source">{email.source}</Field>
            <Field label="Rule settings">{email.rule_settings ?? "Not supplied in this sample"}</Field>
            <Field label="Rule"><span className="mono">{email.rule_id}</span></Field>
            <Field label="Demo time">{email.time_label}</Field>
            <Field label="Reference"><span className="mono">{tuned ? email.group_id : email.alert_id}</span></Field>
          </dl>
          <p className="email-footnote">{email.footnote}</p>
          <Link href="/replay" className="button-link primary-button">Open Replay in IDEA-X</Link>
          <p className="sample-note">Use Replay controls to inspect the timeline. Preview values describe the notification time, not the final group.</p>
        </section>
      </div>
      <aside className="notice">Synthetic sample previews only. Scores, bands, and event counts come from saved fixtures. Email sending and backend integration are not connected.</aside>
    </main>
  </>;
}
