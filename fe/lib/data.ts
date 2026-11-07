import alerts from "@/fixtures/original_alerts.json";
import groups from "@/fixtures/tuned_groups.json";
import windows from "@/fixtures/attack_windows.json";
import snapshot from "@/fixtures/replay_snapshot.json";
import frames from "@/fixtures/replay_frames.json";
import tuning from "@/fixtures/tuning.json";
import audit from "@/fixtures/audit.json";
import emails from "@/fixtures/emails.json";
import comparison from "@/fixtures/comparison.json";
import type { ComparisonPreview } from "./comparison";

// Only this source module knows about fixtures. Replace this loader when the API is agreed.
// The sample response is provisional; no backend endpoint is assumed.
export function getReplayData() {
  return {
    alerts: alerts.map(({ label, ...alert }) => { void label; return alert; }),
    groups: groups.map(({ label, ...group }) => { void label; return group; }),
    windows, frames,
    run_id: snapshot.run_id,
    duration_s: snapshot.duration_s,
    total_alerts: snapshot.original.total,
    sample: true,
  };
}

export type ReplayData = ReturnType<typeof getReplayData>;

export function getComparisonPreview(): ComparisonPreview {
  return { ...comparison, sample: true, replays: { "sample-pair-001": getReplayData() } };
}

export function getTuningData() {
  return tuning;
}

export type TuningData = ReturnType<typeof getTuningData>;

export function getAuditData() {
  return audit;
}

export type AuditData = ReturnType<typeof getAuditData>;

export function getEmailsData() {
  return emails;
}

export type EmailsData = ReturnType<typeof getEmailsData>;

// Called by the server route only; never reads the backend .env or database.
export async function getBaselineData(query: import("./backend-client").BaselineQuery) {
  const { readBaseline } = await import("./backend-client");
  return readBaseline(query, process.env.IDEAX_BACKEND_URL ?? "http://127.0.0.1:8000");
}

export async function getSavedTuningData(query: import("./saved-tuning").SavedQuery) {
  const { readSavedTuning } = await import("./saved-tuning");
  return readSavedTuning(query, process.env.IDEAX_BACKEND_URL ?? "http://127.0.0.1:8000");
}

export async function getRuleHistoryData(datasetId: number, runId: number) {
  const { readRuleHistory } = await import("./rule-history");
  return readRuleHistory(datasetId, runId, process.env.IDEAX_BACKEND_URL ?? "http://127.0.0.1:8000");
}
