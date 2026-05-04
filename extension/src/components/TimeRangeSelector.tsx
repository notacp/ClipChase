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
      transition={{ duration: 0.2 }}
      className="flex flex-wrap items-center gap-1 mt-2"
    >
      {TIME_RANGES.map((range) => {
        const active = timeRange === range.value;
        return (
          <button
            key={range.value}
            type="button"
            onClick={() => setTimeRange(range.value)}
            className={cn(
              "px-2.5 py-[3px] rounded text-[11px] font-medium transition-all border",
              active
                ? "border-yt-red bg-yt-red/[0.09] text-yt-red"
                : "border-yt-dark-gray bg-transparent text-yt-light-gray hover:border-yt-hover/60"
            )}
          >
            {range.label}
          </button>
        );
      })}
    </motion.div>
  );
}
