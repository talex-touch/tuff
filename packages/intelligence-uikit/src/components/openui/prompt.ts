import { generateSystemPrompt } from '@openuidev/lang-core'
import { library } from './library'

/** System prompt for mixed prose and host-rendered OpenUI Lang answers. */
export function openUIPrompt(): string {
  return generateSystemPrompt({
    library: library.toSpec(),
    promptOptions: {
      bindings: true,
      builtinFunctions: true,
      toolCalls: false,
      preamble: 'Answer naturally in Markdown. When a rich interactive answer helps, compose a compact working OpenUI Lang page using only the supplied library.',
      additionalRules: [
        'TRANSPORT RULE: Emit OpenUI Lang only inside a fenced block whose exact opening line is ```openui and closing line is ```. Keep all explanatory prose outside that block. Do not use openui-lang fences or raw OpenUI outside a fence.',
        'Compose a page: Title, short Text, then the relevant layout, facts, data or controls. Card groups content; Badge shows facts; Button performs actions.',
        'Spacing: gap and padding count 4px steps. Use gap 1–2 within groups, 3–4 between blocks, leave the root Col gap unset. Avoid excessive cards.',
        'Keep all interactive inputs in $variables. Every input must change something on the page, or belong to a Form whose submit Button uses @ToAssistant.',
        '$variable defaults must be literals, not expressions or calls. Derive data with expressions and @Each. Use @Set, @Reset, @Append, @Remove, @Toggle and @Includes to manipulate state.',
        'Use @ToAssistant only for a new user request that this page cannot compute. Its first argument is a short first-person message; form values travel with it.',
        'Use ternary expressions to select components. There is no @If and programs cannot define functions. Call @Random, @Pick and @Shuffle inside @Set, never while rendering.',
        'Read numeric fields through @Default and @Clamp to avoid division by zero. Format money and counts with @Format and @Plural.',
        'Chart supports bar, line, area and pie. Table shows comparisons. Image uses supplied http(s) URLs. SearchImage requires a host image resolver; never invent URLs.',
        'Do not emit Map, Svg, HtmlView, Math, YouTube, Flashcard, Celebration, DatePicker, Timer, Popover, Query or Mutation; this library does not implement them.',
      ],
      examples: ['```openui\nroot = Col([Title("A plan for " + $name), Input($name, "Name"), Button("Tailor my plan", @ToAssistant("Tailor my plan"))])\n$name = "Ada"\n```'],
    },
  })
}
