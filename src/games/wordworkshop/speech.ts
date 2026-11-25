/**
 * Digit's voice: the phone's own text-to-speech, in the clearest American
 * English voice it has.
 *
 * Only one thing is ever said at a time -- each new line stops the last, so
 * tapping Hear it again five times never stacks five voices. Speech is
 * started from a tap, which is what iPhones require.
 *
 * A word may one day have a recording (SpellWord.audio); this is the
 * fallback and, for now, the only voice.
 */

let chosen: SpeechSynthesisVoice | null = null;
let looked = false;

/** Names of voices that read clearly to a child, best first. */
const PREFERRED = [
  "Samantha",
  "Ava",
  "Allison",
  "Susan",
  "Nicky",
  "Google US English",
  "Microsoft Aria",
  "Microsoft Jenny",
  "Microsoft Zira",
];

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
  } catch {
    return null;
  }
}

/** Can this device speak at all? */
export function canSpeak(): boolean {
  return synth() !== null && typeof SpeechSynthesisUtterance !== "undefined";
}

function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const voices = s.getVoices();
  if (!voices.length) return null;
  looked = true;
  const us = voices.filter((v) => v.lang.replace("_", "-").toLowerCase() === "en-us");
  for (const name of PREFERRED) {
    const v = us.find((x) => x.name.includes(name) && /enhanced|premium/i.test(x.name)) ?? us.find((x) => x.name.includes(name));
    if (v) return v;
  }
  return us.find((v) => v.localService) ?? us[0] ?? voices.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null;
}

/** Load the voice list early; some browsers fill it in a moment later. */
export function warmVoice(): void {
  const s = synth();
  if (!s) return;
  chosen = pickVoice();
  if (!looked) s.addEventListener?.("voiceschanged", () => (chosen = pickVoice()), { once: true });
}

/** Stop whatever is being said. */
export function hush(): void {
  try {
    synth()?.cancel();
  } catch {
    // Nothing was playing.
  }
}

/**
 * Say a line, stopping anything already being said. Resolves when it ends
 * (or at once if the device can't speak).
 */
export function say(text: string, rate = 0.9): Promise<void> {
  const s = synth();
  if (!s || !canSpeak()) return Promise.resolve();
  hush();
  if (!chosen) chosen = pickVoice();
  return new Promise((resolve) => {
    try {
      const line = new SpeechSynthesisUtterance(text);
      line.lang = "en-US";
      if (chosen) line.voice = chosen;
      line.rate = rate;
      line.pitch = 1.05;
      line.onend = () => resolve();
      line.onerror = () => resolve();
      s.speak(line);
    } catch {
      resolve();
    }
  });
}

/** A word spelled out, letter by letter: "S, H, I, P." Capitals so each is said by its name. */
export function spelledOut(word: string): string {
  return `${[...word].map((ch) => ch.toUpperCase()).join(", ")}.`;
}
