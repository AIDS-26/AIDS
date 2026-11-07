import { getComparisonPreview } from "@/lib/data";
import ComparisonScreen from "./screen";

export default function Page() { return <ComparisonScreen data={getComparisonPreview()}/>; }
