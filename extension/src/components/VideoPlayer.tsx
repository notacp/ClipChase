import { motion } from "framer-motion";
import { Play, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";

interface VideoPlayerProps {
  selectedVideo: { id: string; start: number } | null;
}

export function VideoPlayer({ selectedVideo }: VideoPlayerProps) {
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  useEffect(() => {
    setIsIframeLoading(true);
  }, [selectedVideo?.id, selectedVideo?.start]);

  return (
    <div className="sticky top-4">
      {selectedVideo ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          key={selectedVideo.id + selectedVideo.start}
          className="flex flex-col gap-2"
        >
          <div className="glass p-3 rounded-2xl aspect-video relative overflow-hidden">
            {isIframeLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}
            <iframe
              className="w-full h-full rounded-xl"
              src={`https://www.youtube-nocookie.com/embed/${selectedVideo.id}?start=${Math.floor(selectedVideo.start)}&autoplay=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => setIsIframeLoading(false)}
            />
          </div>
          <div className="flex justify-end px-1">
            <a
              href={`https://www.youtube.com/watch?v=${selectedVideo.id}&t=${Math.floor(selectedVideo.start)}s`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-yt-light-gray text-[11px] hover:text-white flex items-center gap-1 transition-colors"
            >
              <span>Watch on YouTube</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </motion.div>
      ) : (
        <div className="glass p-8 rounded-2xl aspect-video flex flex-col items-center justify-center text-center">
          <Play className="w-12 h-12 text-yt-light-gray/20 mb-3" />
          <p className="text-yt-light-gray text-sm">Select a timestamp to play</p>
        </div>
      )}
    </div>
  );
}
