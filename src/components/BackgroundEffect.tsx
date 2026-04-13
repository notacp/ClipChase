export function BackgroundEffect() {
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
            {/* Primary orb — center */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-yt-red/8 rounded-full blur-[140px] opacity-40" />
            {/* Secondary orb — top-right, cooler */}
            <div className="absolute -top-40 right-0 w-[500px] h-[500px] bg-white/3 rounded-full blur-[120px] opacity-20" />
            {/* Bottom accent — subtle warmth */}
            <div className="absolute bottom-0 left-1/4 w-[600px] h-[300px] bg-yt-red/5 rounded-full blur-[100px] opacity-25" />
        </div>
    );
}
