import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface HeroProps {
    isCompact: boolean;
    children?: React.ReactNode;
}

export function Hero({ isCompact, children }: HeroProps) {
    return (
        <div className={cn(
            "flex flex-col items-center transition-all duration-700",
            isCompact ? "pt-2" : "pt-20"
        )}>
            <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                    "font-bold text-center tracking-tight transition-all duration-500",
                    isCompact
                        ? "text-2xl md:text-3xl mb-5"
                        : "text-5xl md:text-7xl mb-6"
                )}
            >
                Ctrl+F for{" "}
                <span className="text-yt-red">YouTube</span>
            </motion.h1>

            <AnimatePresence>
                {!isCompact && (
                    <motion.div
                        initial={false}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.35 }}
                        className="overflow-hidden"
                    >
                        <p className="text-yt-light-gray text-lg md:text-xl text-center mb-12 max-w-2xl px-4">
                            Search inside any channel's videos for specific words and jump directly to the moment they're spoken.
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {children}
        </div>
    );
}
