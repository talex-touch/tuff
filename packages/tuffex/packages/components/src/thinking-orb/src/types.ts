// Vendored from thinking-orbs v0.2.0 (MIT © Jakub Antalik) — https://github.com/Jakubantalik/thinking-orbs
// Trimmed to the framework-free surface: the upstream React prop bag is
// replaced by TxThinkingOrb's own Vue props.

export type OrbState
  = | 'working'
    | 'searching'
    | 'solving'
    | 'listening'
    | 'connecting'
    | 'weaving'
    | 'composing'
    | 'breathing'
    | 'shaping'

/** The two sizes the presets were hand-tuned for; CSS may scale further. */
export type OrbSize = 20 | 64

export type OrbTheme = 'auto' | 'dark' | 'light'

export const ORB_STATES: readonly OrbState[] = [
  'working',
  'searching',
  'solving',
  'listening',
  'connecting',
  'weaving',
  'composing',
  'breathing',
  'shaping',
]
