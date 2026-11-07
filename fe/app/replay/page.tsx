import { getReplayData } from "@/lib/data";
import Replay from "./replay-screen";

export default function ReplayPage() {
  return <Replay data={getReplayData()}/>;
}
