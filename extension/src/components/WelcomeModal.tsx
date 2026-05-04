import { useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";

interface WelcomeModalProps {
  note: string;
  onDismiss: (useCase?: string) => void;
}

const USE_CASES = [
  "Research & fact-checking",
  "Following creators",
  "Learning from courses",
  "Something else",
];

const cardVariants = {
  hidden: { opacity: 0, y: -12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", damping: 32, stiffness: 180, mass: 0.8 },
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

const contentVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", damping: 26, stiffness: 140 },
  },
};

export function WelcomeModal({ note, onDismiss }: WelcomeModalProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18, ease: "easeIn" } }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/75 backdrop-blur-sm"
      onClick={() => onDismiss()}
    >
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[340px] relative bg-yt-gray rounded border border-yt-dark-gray overflow-hidden"
        style={{ boxShadow: "0 16px 40px rgba(0,0,0,0.6)" }}
      >
        <motion.div
          variants={contentVariants}
          initial="hidden"
          animate="visible"
          className="p-5"
        >
          {/* Header */}
          <motion.div
            variants={itemVariants}
            className="flex items-center gap-2 mb-4 pb-3 border-b border-yt-dark-gray"
          >
            <div className="w-[22px] h-[22px] rounded-[5px] bg-yt-red flex items-center justify-center shrink-0">
              <Search className="w-3 h-3 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-yt-text text-[13px] font-bold tracking-tight leading-none">
                A note from the maker
              </p>
              <p className="text-yt-light-gray text-[10px] mt-1 leading-none">
                Pradyumn · built this for you
              </p>
            </div>
          </motion.div>

          {/* Note body */}
          <motion.div
            variants={itemVariants}
            className="rounded p-3.5 mb-4 bg-yt-elevated border-l-2 border-yt-red"
          >
            <p className="text-[12.5px] leading-[1.65] text-yt-text/90">{note}</p>
            <p className="mt-3 text-right text-[11px] text-yt-light-gray font-mono">
              — Pradyumn
            </p>
          </motion.div>

          {/* Use-case selector */}
          <motion.div variants={itemVariants} className="mb-4">
            <p className="text-yt-tert text-[10px] mb-2 tracking-[0.08em] uppercase font-mono font-semibold">
              What will you use this for? <span className="normal-case font-normal">(optional)</span>
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {USE_CASES.map((uc) => {
                const active = selected === uc;
                return (
                  <button
                    key={uc}
                    type="button"
                    onClick={() => setSelected(active ? null : uc)}
                    className={`rounded px-2.5 py-2 text-[11px] text-left transition-all leading-tight border ${
                      active
                        ? "border-yt-red bg-yt-red/[0.09] text-yt-red"
                        : "border-yt-dark-gray bg-transparent text-yt-light-gray hover:border-yt-hover/60"
                    }`}
                  >
                    {uc}
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.button
            variants={itemVariants}
            whileHover={{ opacity: 0.92 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onDismiss(selected ?? undefined)}
            className="w-full rounded py-2.5 text-[12px] font-semibold text-white flex items-center justify-center gap-1.5 bg-yt-red"
          >
            Let&apos;s search
            <span className="text-white/70 font-normal">→</span>
          </motion.button>

          <motion.p
            variants={itemVariants}
            className="text-center text-yt-tert text-[10px] mt-2.5 font-mono"
          >
            This won&apos;t show again
          </motion.p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
