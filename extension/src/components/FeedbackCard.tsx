import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import posthog from "../shared/posthog";

// In-panel feedback. Replaces the Tally form, which in five months turned
// every click into zero real submissions: a form asks people to leave the
// product to help you, and at ~100 users each extra hop loses nearly all of
// them. Here the answer is one tap or one line, captured as a PostHog event,
// so it lands next to everything else that person did.
//
// Steps:
//   ask   — "Did you find the moment?" [Yes] [Not quite]   (trigger: after_videos)
//   text  — one short free-text answer                      (entry for zero_results / footer)
//   email — optional, offered ONLY to people who already typed something
//   done  — thanks
//
// The email never goes into an event payload; it is stored as a person
// property so it sits on the profile, not in every analytics row.

export type FeedbackTrigger = "after_videos" | "zero_results" | "footer";

type Step = "ask" | "text" | "email" | "done";

interface FeedbackCardProps {
  trigger: FeedbackTrigger;
  channel?: string;
  keyword?: string;
  onClose: () => void;
}

const MAX_TEXT = 500;

const PROMPTS: Record<FeedbackTrigger, { title: string; placeholder: string }> = {
  after_videos: { title: "What were you looking for?", placeholder: "The line, the moment, the video…" },
  zero_results: { title: "What were you looking for?", placeholder: "Tell me and I'll work out why it missed" },
  footer: { title: "What's on your mind?", placeholder: "A bug, an idea, anything" },
};

// Contrast, measured on the #1c1c1c card: yt-light-gray is 3.97:1 and yt-tert
// 1.57:1, both under the 4.5:1 PRODUCT.md commits to. These are actions, so
// they use yt-text (13.9:1) or yt-text/70 (~7.5:1) instead. The Welcome
// modal's dim chips are unselected *toggles*; borrowing that dimness here made
// "Yes" read as disabled.
const chip =
  "rounded px-3 py-1.5 text-[11px] font-medium transition-all border border-yt-dark-gray bg-transparent text-yt-text hover:border-yt-red hover:bg-yt-red/[0.09] hover:text-yt-red focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yt-red";
const field =
  "w-full px-3 py-2 rounded text-[12px] text-yt-text placeholder:text-yt-tert outline-none transition-all border border-yt-dark-gray bg-yt-black hover:border-yt-hover/60 focus:border-yt-red focus:bg-yt-red/[0.09]";
const send =
  "border border-yt-red bg-yt-red text-white px-3 py-1.5 rounded text-[11px] font-semibold transition-colors disabled:bg-transparent disabled:border-yt-dark-gray disabled:text-yt-text/40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yt-red";
const quiet =
  "text-[11px] text-yt-text/70 hover:text-yt-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yt-red rounded";

export function FeedbackCard({ trigger, channel, keyword, onClose }: FeedbackCardProps) {
  const [step, setStep] = useState<Step>(trigger === "after_videos" ? "ask" : "text");
  const [found, setFound] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    posthog.capture("feedback_prompt_shown", { trigger });
  }, [trigger]);

  // Focus: every typing step is reached by a deliberate tap (Not quite / Yes,
  // or the link / footer button that opened the card), so the fields take
  // focus via autoFocus. Not a step effect: AnimatePresence mode="wait" mounts
  // the next step only after the previous one's exit animation, so an effect
  // keyed on `step` fires before the field exists. The unprompted
  // after-videos card opens on "ask", which has no field to steal focus.

  // Parents pass an inline onClose, which is a new function every render; a
  // ref keeps the thank-you timer from restarting while search results stream.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (step !== "done") return;
    const t = setTimeout(() => onCloseRef.current(), 2400);
    return () => clearTimeout(t);
  }, [step]);

  const dismiss = () => {
    posthog.capture("feedback_dismissed", { trigger, step });
    onClose();
  };

  const answerFound = (value: boolean) => {
    setFound(value);
    posthog.capture("feedback_found_moment", { trigger, found: value, channel, keyword });
    setStep("text");
  };

  const submitText = () => {
    const clean = text.trim().slice(0, MAX_TEXT);
    if (!clean) return;
    posthog.capture("feedback_text", {
      trigger,
      text: clean,
      length: clean.length,
      found,
      channel,
      keyword,
    });
    setStep("email");
  };

  const submitEmail = () => {
    const clean = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return;
    posthog.setPersonProperties({ feedback_email: clean });
    posthog.capture("feedback_email_left", { trigger });
    setStep("done");
  };

  const prompt = PROMPTS[trigger];
  const textTitle =
    trigger === "after_videos" && found === true ? "One thing that would make it better?" : prompt.title;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="mt-5 p-4 rounded border border-yt-dark-gray bg-yt-gray text-left w-full"
      role="region"
      aria-label="Feedback"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16, ease: [0.22, 0.61, 0.36, 1] }}
        >
          {step === "ask" && (
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-yt-text mb-2.5">Did you find the moment you wanted?</p>
                <div className="flex gap-2">
                  <button type="button" className={chip} onClick={() => answerFound(true)}>
                    Yes
                  </button>
                  <button type="button" className={chip} onClick={() => answerFound(false)}>
                    Not quite
                  </button>
                </div>
              </div>
              <DismissButton onClick={dismiss} />
            </div>
          )}

          {step === "text" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitText();
              }}
              className="flex flex-col gap-2"
            >
              <div className="flex items-start gap-3">
                <label htmlFor="cc-feedback-text" className="flex-1 text-xs font-semibold text-yt-text">
                  {textTitle}
                </label>
                <DismissButton onClick={dismiss} />
              </div>
              <textarea
                id="cc-feedback-text"
                autoFocus
                value={text}
                maxLength={MAX_TEXT}
                rows={2}
                placeholder={prompt.placeholder}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter breaks the line — chat convention.
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    submitText();
                  }
                }}
                className={`${field} resize-none leading-relaxed`}
              />
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] text-yt-text/70 tabular-nums" aria-live="polite">
                  {text.length > MAX_TEXT - 100 ? `${text.length}/${MAX_TEXT}` : ""}
                </span>
                <div className="flex items-center gap-3">
                  {trigger === "after_videos" && (
                    <button type="button" className={quiet} onClick={() => setStep("done")}>
                      Skip
                    </button>
                  )}
                  <button type="submit" className={send} disabled={!text.trim()}>
                    Send
                  </button>
                </div>
              </div>
            </form>
          )}

          {step === "email" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitEmail();
              }}
              className="flex flex-col gap-2"
            >
              <div>
                <label htmlFor="cc-feedback-email" className="block text-xs font-semibold text-yt-text mb-0.5">
                  Got it, thank you.
                </label>
                <p className="text-[11px] text-yt-light-gray leading-snug">
                  Mind if I reply? Leave an email and I&rsquo;ll write back. Only used for that.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  id="cc-feedback-email"
                  autoFocus
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  placeholder="you@example.com"
                  onChange={(e) => setEmail(e.target.value)}
                  className={field}
                />
                <button type="submit" className={send} disabled={!emailValid}>
                  Send
                </button>
              </div>
              <button type="button" className={`${quiet} self-start`} onClick={() => setStep("done")}>
                No thanks
              </button>
            </form>
          )}

          {step === "done" && (
            <p className="text-xs font-semibold text-yt-text" role="status">
              Thanks. I read every one of these.
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-yt-light-gray hover:text-yt-text text-xs transition-colors shrink-0 leading-none p-0.5 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yt-red"
      aria-label="Dismiss"
    >
      ✕
    </button>
  );
}
