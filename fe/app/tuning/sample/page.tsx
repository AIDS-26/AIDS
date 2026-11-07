import { getTuningData } from "@/lib/data";
import Tuning from "../tuning-screen";
export default function Page() { return <Tuning data={getTuningData()}/>; }
