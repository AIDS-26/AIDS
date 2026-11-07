"use client";

import { useState } from "react";
import { comparisonUnavailable, recallLabel, type ComparisonPreview } from "@/lib/comparison";
import Replay from "../replay-screen";

export default function ComparisonScreen({ data }: { data: ComparisonPreview }) {
  const [datasetId, setDataset] = useState(data.datasets[0]?.id ?? "");
  const [pairId, setPair] = useState("");
  const dataset = data.datasets.find(item => item.id === datasetId);
  const pairs = data.pairs.filter(item => item.dataset_id === datasetId);
  const pair = pairs.find(item => item.id === pairId);
  const replay = pair ? data.replays[pair.id] : undefined;
  const unavailable = dataset && pair ? comparisonUnavailable(dataset, pair, replay) : null;
  const selection = <>
    <div className="baseline-heading"><div><h1>Original vs Tuned rules</h1><p>Comparison preview · sample data</p></div><div className="baseline-tuning"><button disabled aria-describedby="comparison-tuning-disabled">Run tuning</button><small id="comparison-tuning-disabled">Live tuning is not connected</small></div></div>
    <aside className="notice">SAMPLE · This previews the future backend comparison using synthetic fixtures. No real backend run is selected and no evaluator has run.</aside>
    <section className="panel baseline-panel"><h2>Select a comparison</h2><div className="baseline-selectors">
      <label>Sample dataset<select value={datasetId} onChange={event => { setDataset(event.target.value); setPair(""); }}><option value="">Choose a dataset</option>{data.datasets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Saved run pair<select disabled={!dataset} value={pairId} onChange={event => setPair(event.target.value)}><option value="">Choose Original + Tuned runs</option>{pairs.map(item => <option key={item.id} value={item.id}>{item.original_run_id} → {item.tuned_run_id} · {item.status}</option>)}</select></label>
    </div>
    {pair && <p>{pair.note}</p>}
    {dataset && pair && <dl className="comparison-provenance"><div><dt>Dataset</dt><dd>{dataset.id}</dd></div><div><dt>Original run</dt><dd>{pair.original_run_id}</dd></div><div><dt>Tuned run</dt><dd>{pair.tuned_run_id}</dd></div><div><dt>Observation duration</dt><dd>{pair.observation_seconds} seconds</dd></div><div><dt>Guardrail (sample)</dt><dd className={pair.guardrail === "passed" ? "text-green" : "comparison-failed"}>{pair.guardrail}</dd></div><div><dt>Final attack-group recall (sample)</dt><dd>{recallLabel(pair)}{pair.recall && pair.recall.total > 0 ? ` · ${pair.recall.caught}/${pair.recall.total} groups` : ""}</dd></div></dl>}
    </section>
    {unavailable && <p className="baseline-message" role="alert">{unavailable} <a href="/replay/baseline">Open backend Original rules</a></p>}
    {!pair && <p className="baseline-message" role="status">Choose a sample run pair to preview the comparison. Both lanes follow one replay clock.</p>}
  </>;
  return <Replay key={`${datasetId}:${pairId}`} data={unavailable ? undefined : replay} comparisonSelection={selection}/>;
}
