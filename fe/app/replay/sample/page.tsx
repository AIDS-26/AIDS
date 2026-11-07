import { getReplayData } from "@/lib/data";
import Replay from "../replay-screen";

export default function Page() { return <Replay data={getReplayData()}/>; }
