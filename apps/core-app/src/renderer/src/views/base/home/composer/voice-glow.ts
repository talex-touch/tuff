/**
 * The colour of each stop in a CSS gradient stop list, in order: `#0894ff, #c959dd 27%, …` →
 * `['#0894ff', '#c959dd', …]`. Commas inside a colour function (`rgb(…)`) do not split a stop, and
 * a stop's positions are dropped.
 */
export function gradientStopColors(stops: string): string[] {
  const colors: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index <= stops.length; index += 1) {
    const char = stops[index]
    if (char === '(') depth += 1
    else if (char === ')') depth -= 1
    else if (index === stops.length || (char === ',' && depth === 0)) {
      const color = stops
        .slice(start, index)
        .trim()
        .replace(/(?:\s+-?[\d.]+(?:%|deg|turn|rad|grad|px)?)+$/, '')
      if (color) colors.push(color)
      start = index + 1
    }
  }
  return colors
}

/**
 * The dictation glow's seven lobes for TuffEx `TxVoiceBeam` (`colors`: centre first, then the
 * pairs outward), as indices into the stops of the composer's live rim (`--home-live-stops`, the
 * TuffIntelligence wheel the box wears while a reply streams). Read off that one token, so the two
 * lights one box can carry stay one family (`home-composer` › 语音听写态): violet in the centre,
 * then blue and red, orange and blue, red and violet.
 */
const LOBE_STOPS = [1, 0, 2, 3, 4, 2, 1] as const

/**
 * The lobes for a `--home-live-stops` value. A list too short for every slot gives none, and the
 * beam keeps its own palette rather than a half-mapped one.
 */
export function voiceGlowLobes(liveStops: string): string[] {
  const colors = gradientStopColors(liveStops)
  if (colors.length <= Math.max(...LOBE_STOPS)) return []
  return LOBE_STOPS.map((index) => colors[index]!)
}

/**
 * How fast the glow follows the ≈10 Hz level frames: the beam's envelope time constants, seconds.
 *
 * The beam's own (325ms up, 860ms down) are tuned for a microphone analysed every frame. On level
 * frames they swelled over 0.7s and barely dipped between words, so the glow read as a slow tide
 * rather than a voice. 50ms up shows a word within the frame that carries it; 180ms down lets the
 * gap between two words show before the next one lands, and the glow settles within half a second
 * of the last word. Under reduced motion the beam keeps its own, slower envelope.
 */
export const VOICE_GLOW_RESPONSE = { attack: 0.05, release: 0.18 } as const

/**
 * How much each part of the glow moves on its own while words are heard (TxVoiceBeam `organic`).
 *
 * The dictation session hands the glow one number, how loud the voice is, so on its own the beam
 * shows one symmetric arch that grows and shrinks with it — a meter, not a voice. At 1 every lobe,
 * the band line and the arch's crest, lean and sway move on their own, so successive words land in
 * different shapes; silence stays still. Reduced motion drops it with the rest of the envelope.
 */
export const VOICE_GLOW_ORGANIC = 1

/**
 * The beam props for the composer's glow: {@link VOICE_GLOW_RESPONSE} and {@link VOICE_GLOW_ORGANIC},
 * or none under reduced motion.
 */
export function voiceGlowResponse(reducedMotion: boolean): {
  attack?: number
  release?: number
  organic?: number
} {
  return reducedMotion ? {} : { ...VOICE_GLOW_RESPONSE, organic: VOICE_GLOW_ORGANIC }
}

/**
 * The level to hand the beam for a normalized dictation level (`voice-level.ts`, 0..1).
 *
 * The beam runs every level through its own saturating curve (built for raw microphone RMS), and
 * the normalizer has already lifted speech to 0.6–1 so its waveform stays readable. Stacked, a
 * speaking voice sat in the top fifth of the beam's range (0.77–0.95, measured on a recorded
 * phrase), past the point where the arc stops growing, so it barely moved. The fourth power undoes
 * the normalizer's square root and squares the result — each frame's energy relative to the recent
 * peak — which spreads the same phrase over about 0.55–1: the arc drops between words and rises on
 * each one.
 */
export function voiceGlowDriveLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0
  return Math.min(1, level) ** 4
}
