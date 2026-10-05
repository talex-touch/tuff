/**
 * The brand glyph for each agent that has one, as an icon class.
 *
 * Kept free of imports on purpose: `uno.config.ts` evaluates this module to safelist the classes,
 * since UnoCSS scans templates and never `.ts` tables — a class named only here would otherwise
 * never be generated and the agent would show an empty box. The config loader can evaluate a module
 * with no runtime imports; anything richer belongs in `agent-registry.ts`.
 *
 * Only marks the installed `@iconify-json/simple-icons` (1.2.90) actually carries, checked against
 * the set. `codex` is OpenAI's CLI and the set has no Codex mark of its own; Pi and Oh My Pi share
 * Pi's mark because Oh My Pi is Pi's distribution. Every other agent — Kiro, Qoder, CodeBuddy,
 * Factory, Reasonix, Kilo Code, Devin, and any id this build has never heard of — draws a monogram.
 */
export const AGENT_BRAND_ICONS: Readonly<Record<string, string>> = Object.freeze({
  claude: 'i-simple-icons-claude',
  codex: 'i-simple-icons-openai',
  gemini: 'i-simple-icons-googlegemini',
  cursor: 'i-simple-icons-cursor',
  opencode: 'i-simple-icons-opencode',
  pi: 'i-simple-icons-pi',
  'oh-my-pi': 'i-simple-icons-pi'
})

/**
 * Every class the table can render, de-duplicated, for the UnoCSS safelist. Derived from the table
 * so the safelist cannot drift from it.
 */
export const AGENT_ICON_CLASSES: readonly string[] = Object.freeze(
  Array.from(new Set(Object.values(AGENT_BRAND_ICONS)))
)
