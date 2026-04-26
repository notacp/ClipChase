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
      <span className="text-yt-light-gray text-[10px] font-mono uppercase tracking-widest mr-1">Range</span>
      {TIME_RANGES.map((range) => (
        <button
          key={range.value}
          type="button"
          onClick={() => setTimeRange(range.value)}
          className={cn(
            "px-2.5 py-1 rounded-lg text-[10px] font-mono font-medium transition-all",
            timeRange === range.value
              ? "bg-yt-red text-white shadow-sm shadow-yt-red/30"
              : "bg-white/5 border border-white/5 text-yt-light-gray hover:bg-white/10 hover:text-white hover:border-white/10"
          )}
        >
          {range.label}
        </button>
      ))}
    </motion.div>
  );
}
