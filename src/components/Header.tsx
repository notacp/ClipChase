import { Youtube } from "lucide-react";

export function Header() {
    return (
        <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto border-b border-white/5">
            <div className="flex items-center gap-2 group cursor-pointer">
                <Youtube className="w-7 h-7 text-yt-red group-hover:scale-110 transition-transform" />
                <span className="text-lg font-bold tracking-tight">TimeStitch</span>
            </div>
            <span className="text-xs text-yt-light-gray/50 font-mono hidden sm:block">
                transcript search
            </span>
        </nav>
    );
}
