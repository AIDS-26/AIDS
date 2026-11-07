import BaselineScreen from "./screen";
import { Suspense } from "react";
import { replaySelection } from "@/lib/navigation";

async function SelectedReplay({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const selection = replaySelection(await searchParams);
  return <BaselineScreen key={`${selection.dataset}:${selection.run}`} initialSelection={selection}/>;
}

export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<main><p role="status">Loading Replay selection…</p></main>}><SelectedReplay searchParams={searchParams}/></Suspense>;
}
