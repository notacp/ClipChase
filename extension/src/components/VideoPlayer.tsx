import { motion } from "framer-motion";
import { Play, ExternalLink } from "lucide-react";
import { formatTime } from "../shared/utils";

export interface SelectedVideo {
  id: string;
  start: number;
  thumbnail: string;
  title: string;
}

interface VideoPlayerProps {
  selectedVideo: SelectedVideo | null;
}

export function VideoPlayer({ selectedVideo }: VideoPlayerProps) {
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
            {selectedVideo.thumbnail && (
              <img
                src={selectedVideo.thumbnail}
                alt={selectedVideo.title}
                className="absolute inset-0 w-full h-full object-cover rounded-xl"
              />
            )}
            <div className="absolute inset-0 bg-black/60 rounded-xl flex flex-col items-center justify-center gap-2">
              <div className="bg-yt-red rounded-full p-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <p className="text-white text-xs font-medium">Opened in YouTube</p>
              <p className="text-yt-light-gray text-[10px] font-mono">{formatTime(selectedVideo.start)}</p>
            </div>
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
