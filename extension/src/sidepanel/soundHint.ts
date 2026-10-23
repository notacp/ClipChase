// Sounds aren't in captions, so searching "burp" mostly misses. Users found
// the workaround themselves (Oct 2026): search what people SAY around the
// moment. On @XtasiaTV "burp" found 1 video, "excuse" 35 and "sick" 28. This
// turns that trick into a one-click suggestion.
//
// Each rule: a pattern for the sound word(s), and the spoken phrases to try.
// Body/sound moments were 67% of page-1 searches in the week to Oct 23.
const RULES: { sound: RegExp; say: string[] }[] = [
  { sound: /\b(farts?|farted|farting|gassy|toots?|tooted)\b|\bpeid|\bpedos?\b/i, say: ["excuse me", "oh my god", "what was that", "smells"] },
  { sound: /\b(burps?|burped|burping|belch\w*)\b|\barrot|\beruct/i, say: ["excuse me", "pardon me", "sorry", "that was loud"] },
  { sound: /\b(sneez\w*)\b/i, say: ["bless you", "excuse me", "sorry"] },
  { sound: /\b(hiccups?|hiccuped|hiccupping)\b|हिचकी/i, say: ["hiccups", "excuse me", "sorry"] },
  { sound: /\b(cough\w*)\b/i, say: ["excuse me", "sorry", "water"] },
];

/** Spoken phrases to try instead of a sound word, or null if `keyword` isn't one. */
export function soundHintFor(keyword: string): string[] | null {
  const rule = RULES.find((r) => r.sound.test(keyword));
  if (!rule) return null;
  const lower = keyword.trim().toLowerCase();
  return rule.say.filter((s) => s !== lower);
}
