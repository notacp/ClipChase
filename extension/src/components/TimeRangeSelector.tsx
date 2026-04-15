import { motion } from "framer-motion";
import { cn } from "../shared/utils";
import { TimeRange } from "../shared/types";

interface TimeRangeSelectorProps {
  timeRange: TimeRange;
  setTimeRange: (range: TimeRange) => void;
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "6m", label: "6m" },
  { value: "1y", label: "1y" },
  { value: "all", label: "All" },
];

export function TimeRangeSelector({ timeRange, setTimeRange }: TimeRangeSelectorProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="flex flex-wrap items-center gap-1.5 mt-4"
    >
      <span className="text-yt-light-gray text-xs mr-1">From:</span>
      {TIME_RANGES.map((range) => (
        <button
          key={range.value}
          type="button"
          onClick={() => setTimeRange(range.value)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
            timeRange === range.value
              ? "bg-yt-red text-white"
              : "bg-white/5 text-yt-light-gray hover:bg-white/10 hover:text-white"
          )}
        >
          {range.label}
        </button>
      ))}
    </motion.div>
  );
}
