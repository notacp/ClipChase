import { ArrowLeft, Youtube } from "lucide-react";
import Link from "next/link";
import { BackgroundEffect } from "@/components/BackgroundEffect";

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-yt-black text-white selection:bg-yt-red/30 pb-20">
      <BackgroundEffect />

      <nav className="relative z-20 flex items-center justify-between px-6 py-5 max-w-4xl mx-auto border-b border-white/5">
        <Link href="/" className="flex items-center gap-2 group cursor-pointer">
          <Youtube className="w-7 h-7 text-yt-red group-hover:scale-110 transition-transform" />
          <span className="text-lg font-bold tracking-tight">TimeStitch</span>
        </Link>
        <Link
          href="/"
          className="text-sm text-yt-light-gray hover:text-white transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </nav>

      <div className="relative z-10 max-w-3xl mx-auto px-6 pt-16 md:pt-24 pb-16">
        <div className="flex flex-col items-start gap-3 mb-8">
           <span className="text-xs font-mono text-yt-red tracking-widest uppercase">
             Legal
           </span>
           <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
             Privacy Policy
           </h1>
        </div>
        
        <div className="glass rounded-2xl p-8 md:p-10 space-y-10 border-white/5">
          <p className="text-sm font-mono text-yt-light-gray/60">Last updated: April 17, 2026</p>
          
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-white">1. Information We Collect</h2>
            <p className="text-yt-light-gray text-base leading-relaxed">
              TimeStitch operates primarily as a client-side tool. To provide you with the ability to search YouTube transcripts, the extension accesses the current YouTube video and its associated transcript data directly from your browser. We do not collect, store, or sell your personal data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-white">2. Permissions Needed</h2>
            <p className="text-yt-light-gray text-base leading-relaxed">
              The extension requires the following permissions to function:
            </p>
            <ul className="text-yt-light-gray text-base leading-relaxed list-disc pl-5 space-y-2 mt-2">
              <li><strong className="text-white font-medium">sidePanel:</strong> To display the search interface alongside your video without interrupting playback.</li>
              <li><strong className="text-white font-medium">scripting & tabs:</strong> To interact with the current YouTube tab, such as jumping to a specific timestamp in the video when a search result is clicked.</li>
              <li><strong className="text-white font-medium">Host Permissions (*://*.youtube.com/*):</strong> To fetch the transcript of the video you are currently watching.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-white">3. How Your Data is Handled</h2>
            <p className="text-yt-light-gray text-base leading-relaxed">
              When you perform a search, the extension may communicate with our backend servers (<span className="text-white bg-yt-red/10 px-1 rounded font-mono text-[13px]">api.timestitch.app</span>) to process and deliver phonetic matches. The data transmitted is strictly limited to the transcript segments and your search query. We do not tie this data to your identity, IP address, or user account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-white">4. Third-Party Services</h2>
            <p className="text-yt-light-gray text-base leading-relaxed">
              TimeStitch interacts with YouTube's services to function. Your use of YouTube is governed by YouTube's Terms of Service and Privacy Policy. TimeStitch is not affiliated with, endorsed, or sponsored by YouTube.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-white">5. Changes to this Policy</h2>
            <p className="text-yt-light-gray text-base leading-relaxed">
              We may update this Privacy Policy from time to time to reflect changes in our practices or for other operational, legal, or regulatory reasons. We will notify you of any material changes by updating the "Last updated" date of this document.
            </p>
          </section>
          
          <section className="space-y-3">
            <h2 className="text-xl font-bold tracking-tight text-white">6. Contact</h2>
            <p className="text-yt-light-gray text-base leading-relaxed">
              If you have any questions or suggestions about our Privacy Policy, do not hesitate to contact us at <a href="mailto:support@timestitch.app" className="text-yt-red hover:underline">support@timestitch.app</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
