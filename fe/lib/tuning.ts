export function recallLabel(recall: { caught: number; total: number }) {
  return recall.total === 0 ? "N/A" : `${recall.caught} of ${recall.total}`;
}
