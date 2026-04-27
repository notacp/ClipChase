import { motion } from "framer-motion";

interface WelcomeModalProps {
  note: string;
  onDismiss: () => void;
}

const cardVariants = {
  hidden: { opacity: 0, y: -20, scale: 0.97, rotate: -1.5 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotate: -0.5,
    transition: { type: "spring", damping: 32, stiffness: 140, mass: 0.9 },
  },
  exit: {
    opacity: 0,
    y: -16,
    scale: 0.97,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

const contentVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", damping: 26, stiffness: 120 },
  },
};

export function WelcomeModal({ note, onDismiss }: WelcomeModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2, ease: "easeIn" } }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/80 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[320px] relative"
        style={{ transformOrigin: "top center" }}
      >
        {/* Red pin dot at top center */}
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 w-4 h-4 rounded-full bg-yt-red border-2 border-[#c02020]" />

        {/* Card */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(160deg, #1c1512 0%, #161210 100%)",
            border: "1px solid rgba(224, 48, 48, 0.15)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.6)",
          }}
        >
          {/* Top tape line */}
          <div
            className="h-0.5 w-full"
            style={{ background: "linear-gradient(90deg, transparent, #E03030 30%, #E03030 70%, transparent)" }}
          />

          <motion.div
            variants={contentVariants}
            initial="hidden"
            animate="visible"
            className="p-5 pt-4"
          >
            {/* Header */}
            <motion.div variants={itemVariants} className="flex items-center gap-2.5 mb-4">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
                style={{
                  background: "linear-gradient(135deg, #2a1a1a, #1f1010)",
                  border: "1.5px solid rgba(224,48,48,0.3)",
                }}
              >
                👋
              </div>
              <div>
                <p className="text-white text-[13px] font-semibold leading-none">A note from the maker</p>
                <p className="text-yt-light-gray text-[10px] mt-0.5 leading-none">Pradyumn · built this for you</p>
              </div>
            </motion.div>

            {/* Note body */}
            <motion.div
              variants={itemVariants}
              className="rounded-xl p-4 mb-4 relative overflow-hidden"
              style={{
                background: "linear-gradient(155deg, #211a14 0%, #1a130e 100%)",
                border: "1px solid rgba(255,220,180,0.06)",
              }}
            >
              {/* Subtle ruled lines */}
              <div
                className="absolute inset-0 opacity-[0.04]"
                style={{
                  backgroundImage: "repeating-linear-gradient(transparent, transparent 23px, rgba(255,200,150,0.5) 23px, rgba(255,200,150,0.5) 24px)",
                  backgroundPositionY: "8px",
                }}
              />
              {/* Left margin rule */}
              <div className="absolute left-7 top-0 bottom-0 w-px bg-yt-red/10" />

              <p
                className="relative text-[13px] leading-[1.7] pl-3"
                style={{
                  color: "#e8d5bb",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontStyle: "italic",
                }}
              >
                {note}
              </p>

              <p
                className="relative mt-3 text-right text-[11px] pr-1"
                style={{ color: "#a08060", fontFamily: "Georgia, serif", fontStyle: "italic" }}
              >
                — Pradyumn
              </p>
            </motion.div>

            {/* CTA */}
            <motion.button
              variants={itemVariants}
              whileHover={{ scale: 1.02, transition: { type: "spring", stiffness: 300, damping: 20 } }}
              whileTap={{ scale: 0.97, transition: { type: "spring", stiffness: 400, damping: 22 } }}
              onClick={onDismiss}
              className="w-full rounded-xl py-3 text-sm font-semibold text-white flex items-center justify-center gap-1.5"
              style={{ background: "linear-gradient(135deg, #E03030, #c02020)" }}
            >
              Let's search
              <span className="text-white/70 font-normal">→</span>
            </motion.button>

            <motion.p variants={itemVariants} className="text-center text-yt-light-gray/50 text-[10px] mt-2.5">
              This won&apos;t show again
            </motion.p>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
