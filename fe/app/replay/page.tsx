import SavedReplayScreen from "./saved-screen";
import { Suspense } from "react";
import { replaySelection } from "@/lib/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function SelectedReplay({ searchParams }: { searchParams: SearchParams }) {
  const selection = replaySelection(await searchParams);
  return <SavedReplayScreen key={`${selection.dataset}:${selection.run}`} initialSelection={selection}/>;
}

export default function ReplayPage({ searchParams }: { searchParams: SearchParams }) {
  return <Suspense fallback={<main><p role="status">Loading saved Replay selection…</p></main>}>
    <SelectedReplay searchParams={searchParams}/>
  </Suspense>;
}
