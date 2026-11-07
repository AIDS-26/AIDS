"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { makeChatRequest, MAX_QUESTION_LENGTH, sendChat, type ChatContext, type ChatMessage } from "@/lib/chat";
import styles from "./chat-assistant.module.css";

type Target = { id: string; label: string };
type Entry = ChatMessage & { sources?: string[]; context?: ChatContext };
const suggestions = ["Explain this alert", "Why is this group High?", "What does N_sat mean?", "What changed in this tuning run?", "What should I check first?"];

export default function ChatAssistant({ context, targets = [] }: { context: ChatContext; targets?: Target[] }) {
  // Remount on run/attempt changes so a conversation cannot silently switch evidence.
  const scope = `${context.source}:${context.dataset_id ?? ""}:${context.run_id}:${context.attempt ?? ""}:${context.item_id ?? ""}`;
  return <ChatPanel key={scope} context={context} targets={targets}/>;
}

function ChatPanel({ context, targets }: { context: ChatContext; targets: Target[] }) {
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [selection, setSelection] = useState<(Target & { context: ChatContext }) | null>(null);
  const [conversationContext, setConversationContext] = useState<ChatContext | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<ReturnType<typeof makeChatRequest> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const pickSnapshot = useRef({ context, targets });
  const activeContext = selection?.context ?? conversationContext ?? context;

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (open && !picking) input.current?.focus(); }, [open, picking]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight }); }, [entries, busy, error]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (picking) setPicking(false);
      else { setOpen(false); launcher.current?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, picking]);

  useEffect(() => {
    if (!picking) return;
    const { context, targets } = pickSnapshot.current;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-chat-id]"));
    const originals = nodes.map(node => ({ node, tab: node.getAttribute("tabindex"), role: node.getAttribute("role"), label: node.getAttribute("aria-label") }));
    for (const node of nodes) {
      node.classList.add(styles.pickable); node.tabIndex = 0;
      node.setAttribute("role", "button"); node.setAttribute("aria-label", `Ask about ${targets.find(target => target.id === node.dataset.chatId)?.label ?? "this result"}`);
    }
    const pick = (event: Event) => {
      if (event instanceof KeyboardEvent && !["Enter", " "].includes(event.key)) return;
      const node = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-chat-id]") : null;
      const target = targets.find(item => item.id === node?.dataset.chatId);
      if (!target) return;
      event.preventDefault(); event.stopPropagation();
      setSelection({ ...target, context: { ...context, item_id: target.id } });
      setEntries([]); setConversationContext(null); setError(""); setFailed(null); setPicking(false);
    };
    document.addEventListener("click", pick, true); document.addEventListener("keydown", pick, true);
    nodes[0]?.focus();
    return () => {
      document.removeEventListener("click", pick, true); document.removeEventListener("keydown", pick, true);
      for (const { node, tab, role, label } of originals) {
        node.classList.remove(styles.pickable);
        for (const [name, value] of [["tabindex", tab], ["role", role], ["aria-label", label]]) {
          if (value === null) node.removeAttribute(name!); else node.setAttribute(name!, value!);
        }
      }
    };
  }, [picking]);

  async function submit(question: string, retry = false) {
    if (controller.current || (!retry && !question.trim())) return;
    const request = retry && failed ? failed : makeChatRequest(activeContext, entries, question);
    const current = new AbortController(); controller.current = current;
    setBusy(true); setError(""); setFailed(null);
    if (!retry) { setConversationContext(activeContext); setEntries(previous => [...previous, { role: "user", content: question.trim(), context: activeContext }]); setDraft(""); }
    const timer = window.setTimeout(() => current.abort("timeout"), 60_000);
    try {
      const answer = await sendChat(request, current.signal);
      if (!current.signal.aborted) setEntries(previous => [...previous, { role: "assistant", content: answer.answer, sources: answer.sources, context: request.context }]);
    } catch (failure) {
      if (current.signal.aborted && current.signal.reason !== "timeout") return;
      setFailed(request);
      setError(current.signal.aborted ? "The assistant timed out. Your question is saved; please retry." : failure instanceof Error ? failure.message : "Could not reach the assistant. Please retry.");
    } finally {
      window.clearTimeout(timer);
      if (controller.current === current) { controller.current = null; setBusy(false); }
    }
  }

  function reset() { setEntries([]); setConversationContext(null); setFailed(null); setError(""); setDraft(""); input.current?.focus(); }
  function cancel() {
    controller.current?.abort(); controller.current = null; setBusy(false);
    setEntries(previous => previous.at(-1)?.role === "user" ? previous.slice(0, -1) : previous);
    setDraft(entries.at(-1)?.content ?? ""); setError("Request cancelled. You can edit and send again.");
  }

  return <>
    {picking && <div className={styles.pickNotice} role="status">Select an alert or group to ask about it <button onClick={() => setPicking(false)}>Cancel · Esc</button></div>}
    {open && !picking && <section className={styles.panel} role="region" aria-label="Ask IDEA-X assistant">
      <header className={styles.header}><Image src="/ideax-mark.svg" width={25} height={25} alt=""/><div><h2>Ask IDEA-X</h2><small>Explains alerts, rules and tuning results</small></div><button aria-label="Minimize chat" onClick={() => { setOpen(false); launcher.current?.focus(); }}>−</button><button aria-label="Close chat" onClick={() => { setOpen(false); launcher.current?.focus(); }}>×</button></header>
      <div className={styles.context}><span title={selection?.label ?? `Run ${context.run_id}`}>Looking at: <b>{selection?.label ?? `${context.source === "baseline" ? "Original rules" : context.source} · ${context.run_id}`}</b></span>{selection && <button aria-label="Clear selected context" disabled={busy} onClick={() => { setSelection(null); reset(); }}>×</button>}<button disabled={busy || targets.length === 0} title={targets.length ? "Choose a visible alert or group" : "No selectable alerts on this view yet"} onClick={() => { pickSnapshot.current = { context, targets }; setPicking(true); }}>⌖ Pick</button></div>
      <p className={styles.contextMeta}>{activeContext.sample ? "Sample data" : "Backend results"} · run {activeContext.run_id}{activeContext.replay_time_s !== undefined ? ` · snapshot at ${Math.floor(activeContext.replay_time_s)}s` : ""}{activeContext.attempt !== undefined ? ` · attempt ${activeContext.attempt}` : ""}</p>
      <div className={styles.transcript} ref={transcript} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
        {entries.length === 0 && <div className={styles.empty}><p>Ask about anything on this screen: an alert, a grouped alert, a rule setting or a tuning change.</p><p className={styles.muted}>Try:</p><div className={styles.suggestions}>{suggestions.map(question => <button key={question} onClick={() => { setDraft(question); input.current?.focus(); }}>{question}</button>)}</div></div>}
        {entries.map((entry, index) => <div className={entry.role === "user" ? styles.question : styles.answer} key={index}><span className="sr-only">{entry.role === "user" ? "You" : "IDEA-X"}: </span><p>{entry.content}</p>{entry.role === "assistant" && <small>{entry.sources?.length ? `Sources: ${entry.sources.join(" · ")}` : "No source references supplied."}{entry.context?.replay_time_s !== undefined ? ` · Snapshot ${Math.floor(entry.context.replay_time_s)}s` : ""}</small>}</div>)}
        {busy && <p className={styles.muted} role="status">Reading the selected result…</p>}
        {error && <div className={styles.error} role="alert"><p>{error}</p>{failed && <button onClick={() => void submit("", true)} disabled={busy}>Retry question</button>}</div>}
      </div>
      <footer className={styles.footer}>
        {entries.length > 0 && <button className={styles.newChat} disabled={busy} onClick={reset}>New conversation</button>}
        <form onSubmit={event => { event.preventDefault(); void submit(draft); }}>
          <label className="sr-only" htmlFor="assistant-question">Ask about an alert, a rule or a number</label>
          <textarea id="assistant-question" ref={input} rows={2} value={draft} maxLength={MAX_QUESTION_LENGTH} disabled={busy || !!failed} placeholder="Ask about an alert, a rule or a number…" onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy && !failed) void submit(draft); } }}/>
          {busy ? <button type="button" aria-label="Stop response" onClick={cancel}>■</button> : <button type="submit" aria-label="Send question" disabled={!draft.trim() || !!failed}>➜</button>}
        </form>
        {failed && <button className={styles.newChat} onClick={() => { setDraft(failed.messages.at(-1)!.content); setEntries(previous => previous.slice(0, -1)); setFailed(null); setError(""); input.current?.focus(); }}>Edit question</button>}
        <small>Questions and selected result context are sent to the OpenAI API. The assistant explains results; it can’t change rules or take actions.</small>
      </footer>
    </section>}
    <button ref={launcher} className={styles.launcher} aria-label={open ? "Minimize Ask IDEA-X" : "Open Ask IDEA-X"} aria-expanded={open} onClick={() => { setPicking(false); setOpen(!open); }}><Image src="/ideax-mark.svg" width={32} height={32} alt=""/>{!open && <span>Ask IDEA-X</span>}</button>
  </>;
}
