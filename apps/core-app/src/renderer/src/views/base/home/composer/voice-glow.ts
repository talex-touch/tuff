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
