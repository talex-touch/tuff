<script setup lang="ts">
import type { AiToolCallPart } from '@talex-touch/tuffex/ai-elements'
import type { TxAiSegment } from '../types'
import type { FormFieldValue } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { TxAiAssistantTurn } from '../components/conversation'
import { CHART_RESULT_PREFIX } from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import '../style/index.scss'

const dark = ref(false)
const replayText = ref('')
const replaying = ref(false)
const lastEvent = ref<{ kind: string; payload: unknown } | null>(null)
let replayTimer: ReturnType<typeof setInterval> | undefined
const initialTheme = document.documentElement.dataset.theme
const initialDark = document.documentElement.classList.contains('dark')
watch(dark, value => {
  document.documentElement.dataset.theme = value ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', value)
}, { immediate: true })

// Composition adapted from the chart, state and form gallery examples.
const openuiProgram = `root = Col([Title("Quarterly growth plan", "lg"), Row([Badge("On track", "success"), Badge("+18.4% QoQ", "info"), Badge("Owner: Ada")], 3), Text("A compact view of the signals behind this week's recommendation."), Chart("bar", rows, "month", ["Revenue"], "currency", "USD", false, 220), stateCard, Form([Input($destination, "Focus market", "text", "Where should we focus?"), Select($pace, ["Conservative", "Balanced", "Bold"], "Pace"), Checkbox($outdoors, "Include customer interviews"), TextArea($notes, "Notes", "What should the team know?", 2), Button("Send plan to assistant", @ToAssistant("Plan the next sprint for this market"))])], 3)
$destination = "Lisbon"
$pace = "Balanced"
$outdoors = true
$notes = "Keep the first experiment small and measurable."
rows = [{month: "Jan", Revenue: 8400}, {month: "Feb", Revenue: 12300}, {month: "Mar", Revenue: 10800}, {month: "Apr", Revenue: 16100}]
stateCard = Col([Title("Live planning state", "md"), Text("Focus: " + $destination + " · " + $pace + " pace", "md", "muted")], 1)`

const beforeFence = 'Here is the plan.'
const afterFence = 'Change the focus market or pace above, then send the plan back to the assistant when the details look right.'
const fullText = `${beforeFence}\n\n\`\`\`openui\n${openuiProgram}\n\`\`\`\n\n${afterFence}`

const chartSpec = {
  type: 'line',
  title: 'Tool result · weekly activation',
  labels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'],
  series: [{ name: 'Activation', values: [42, 49, 47, 61, 68, 76] }],
  yLabel: '%',
  showValues: true,
}
const chartPart: AiToolCallPart = {
  type: 'tool-call',
  id: 'tool-chart-1',
  name: 'tuff_render_chart',
  status: 'done',
  output: `${CHART_RESULT_PREFIX}${JSON.stringify(chartSpec)}`,
}

const baseSegments: TxAiSegment[] = [
  {
    kind: 'reasoning',
    id: 'reasoning-1',
    step: {
      id: 'reasoning-1',
      kind: 'thinking',
      title: 'Reasoning · choosing a focused experiment',
      body: 'I compared the recent activation trend with the requested market and kept the answer interactive so the host can continue the conversation with the selected values.',
      status: 'done',
    },
  },
  { kind: 'text', id: 'text-1', text: fullText, streaming: false },
  { kind: 'tool', id: chartPart.id, part: chartPart },
]

const segments = computed<TxAiSegment[]>(() => baseSegments.map((segment) => {
  if (segment.kind !== 'text') return segment
  return { ...segment, text: replaying.value ? replayText.value : fullText, streaming: replaying.value }
}))

function record(kind: string, payload: unknown) {
  lastEvent.value = { kind, payload }
}
function handleFormSubmit(part: AiToolCallPart, values: Record<string, FormFieldValue>) {
  record('form-submit', { partId: part.id, values })
}
function stopReplay() {
  if (replayTimer) clearInterval(replayTimer)
  replayTimer = undefined
  replaying.value = false
  replayText.value = fullText
}
function replay() {
  stopReplay()
  replayText.value = ''
  replaying.value = true
  let index = 0
  replayTimer = setInterval(() => {
    index = Math.min(fullText.length, index + 30)
    replayText.value = fullText.slice(0, index)
    if (index >= fullText.length) stopReplay()
  }, 30)
}
function toggleTheme() {
  dark.value = !dark.value
}
onBeforeUnmount(() => {
  stopReplay()
  document.documentElement.classList.toggle('dark', initialDark)
  if (initialTheme === undefined) delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = initialTheme
})
</script>

<template>
  <main class="turn-playground" :class="{ 'is-dark': dark }" :data-stream-chars="replaying ? replayText.length : fullText.length" :data-stream-total="fullText.length">
    <header class="turn-playground__header">
      <div>
        <a href="/">intelligence-uikit</a>
        <p class="turn-playground__eyebrow">
          Integrated conversation proof
        </p>
        <h1>One assistant turn, all the way through.</h1>
        <p class="turn-playground__lede">
          The real <code>TxAiAssistantTurn</code> with reasoning, prose, a streamed OpenUI fence, a tool face, and host-owned actions.
        </p>
      </div>
      <div class="turn-playground__controls">
        <button type="button" class="turn-playground__button" @click="replay">
          {{ replaying ? 'Replay from start' : 'Replay stream' }}
        </button>
        <button type="button" class="turn-playground__button" :aria-pressed="dark" @click="toggleTheme">
          {{ dark ? 'Light mode' : 'Dark mode' }}
        </button>
      </div>
    </header>

    <section class="turn-playground__action" role="status" aria-live="polite">
      <strong>Host action</strong>
      <code data-testid="last-action">{{ lastEvent ? `${lastEvent.kind}: ${JSON.stringify(lastEvent.payload)}` : 'Interact with the OpenUI form or footer actions. Events appear here.' }}</code>
    </section>

    <section class="turn-playground__surface" aria-labelledby="turn-heading">
      <div class="turn-playground__surface-heading">
        <div>
          <p class="turn-playground__eyebrow">
            assistant / turn-042
          </p>
          <h2 id="turn-heading">
            Weekly activation recommendation
          </h2>
        </div>
        <span class="turn-playground__status" :class="{ 'is-streaming': replaying }">{{ replaying ? 'streaming' : 'complete' }}</span>
      </div>
      <TxAiAssistantTurn
        :segments="segments"
        :streaming="replaying"
        :footer="{ content: fullText, resting: false, regenerable: true, branchable: true, metrics: { latencyMs: 1840, totalTokens: 728, model: 'gpt-6.1', coordinator: 'Tuff Pi' } }"
        :show-tool-payload="true"
        payload-label="View request payload"
        thinking-verb="Reasoning"
        @openui-action="record('openui-action', $event)"
        @form-submit="handleFormSubmit"
        @copy="record('copy', $event)"
        @regenerate="record('regenerate', null)"
      />
    </section>

    <section class="turn-playground__failure" aria-labelledby="failure-heading">
      <div>
        <p class="turn-playground__eyebrow">
          failure branch
        </p>
        <h2 id="failure-heading">
          Failing turn variant
        </h2>
        <p>Host-provided error state stays in the same turn contract.</p>
      </div>
      <TxAiAssistantTurn
        :segments="[{ kind: 'text', id: 'failed-text', text: 'I started checking the latest activation report, but the coordinator could not complete the request.', streaming: false }]"
        :error="{ title: 'Unable to complete this turn', detail: 'The coordinator timed out while waiting for the report service.', reportCode: 'TURN_TIMEOUT', retryable: true, retryLabel: 'Retry turn' }"
        :footer="{ content: 'I started checking the latest activation report, but the coordinator could not complete the request.', resting: false, regenerable: true, metrics: { coordinator: 'Tuff Pi' } }"
        @copy="record('copy', $event)"
        @regenerate="record('regenerate', null)"
        @retry="record('retry', null)"
      />
    </section>
  </main>
</template>

<style>
:root:has(.turn-playground) {
  color-scheme: light;
  background: #f4f6fb;
  --turn-bg: #ffffff;
  --turn-panel: #f8f9fc;
  --turn-text: #20232d;
  --turn-muted: #6b7180;
  --turn-border: #dfe3ec;
  --turn-primary: #536edb;
  --turn-code: #454c61;
  --tx-color-primary: var(--turn-primary);
  --tx-color-success: #32805b;
  --tx-color-warning: #a67518;
  --tx-color-danger: #c94b4b;
  --tx-text-color-primary: var(--turn-text);
  --tx-text-color-regular: #424550;
  --tx-text-color-secondary: var(--turn-muted);
  --tx-text-color-placeholder: #777c89;
  --tx-border-color: var(--turn-border);
  --shell-text-primary: var(--turn-text);
  --shell-text-secondary: var(--turn-muted);
  --shell-border: var(--turn-border);
  --tx-border-color-light: var(--turn-border);
  --tx-fill-color: #edf0f6;
  --tx-fill-color-light: var(--turn-panel);
  --tx-fill-color-lighter: #f7f8fb;
  --tx-bg-color: var(--turn-bg);
  --tx-surface-color: var(--turn-bg);
}
:root:has(.turn-playground.is-dark) {
  color-scheme: dark;
  background: #141820;
  --turn-bg: #1d222d;
  --turn-panel: #252b37;
  --turn-text: #eff1f7;
  --turn-muted: #a5acbc;
  --turn-border: #3b4353;
  --turn-primary: #a9b7ff;
  --turn-code: #dbe0f1;
  --tx-color-success: #7bcc9d;
  --tx-color-warning: #e0b968;
  --tx-color-danger: #f69696;
  --tx-color-danger-light-9: #3b272e;
  --tx-color-danger-light-8: #5a3541;
  --tx-color-danger-light-7: #68404c;
  --tx-text-color-regular: #d4d6e0;
  --tx-text-color-placeholder: #969eaf;
  --tx-fill-color: #2a303e;
  --tx-fill-color-lighter: #292f3b;
}
body:has(.turn-playground) { margin: 0; }
.turn-playground { min-height: 100vh; box-sizing: border-box; max-width: 1080px; margin: 0 auto; padding: 36px 32px 80px; color: var(--turn-text); font: 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.turn-playground__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 32px; margin-bottom: 24px; }
.turn-playground__header a { color: var(--turn-primary); font-size: 13px; text-decoration: none; }
.turn-playground h1 { max-width: 680px; margin: 10px 0 8px; font-size: clamp(28px, 4vw, 42px); line-height: 1.1; letter-spacing: -.03em; font-weight: 650; }
.turn-playground h2 { margin: 0; font-size: 18px; line-height: 1.3; letter-spacing: -.01em; }
.turn-playground__eyebrow { margin: 0; color: var(--turn-primary); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
.turn-playground__lede { max-width: 72ch; margin: 0; color: var(--turn-muted); }
.turn-playground code { color: var(--turn-code); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
.turn-playground__controls { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding-top: 22px; }
.turn-playground__button { border: 1px solid var(--turn-border); border-radius: 8px; padding: 8px 12px; color: var(--turn-text); background: var(--turn-bg); font: inherit; cursor: pointer; }
.turn-playground__button:hover { border-color: var(--turn-primary); }
.turn-playground__button:focus-visible { outline: 2px solid var(--turn-primary); outline-offset: 3px; }
.turn-playground__action { display: flex; align-items: baseline; gap: 14px; min-height: 22px; margin-bottom: 18px; padding: 11px 14px; border: 1px solid var(--turn-border); border-radius: 9px; background: var(--turn-panel); overflow-wrap: anywhere; }
.turn-playground__action strong { flex: 0 0 auto; font-size: 12px; }
.turn-playground__action code { color: var(--turn-muted); font-size: 11px; }
.turn-playground__surface, .turn-playground__failure { border: 1px solid var(--turn-border); border-radius: 14px; background: var(--turn-bg); box-shadow: 0 12px 40px rgb(23 31 51 / 7%); }
.turn-playground__surface { padding: 22px 24px 24px; }
.turn-playground__surface-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid var(--turn-border); }
.turn-playground__status { padding: 3px 8px; border-radius: 999px; color: #2c7756; background: #e6f5ed; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.turn-playground__status.is-streaming { color: #8e6112; background: #fff4d9; }
.turn-playground__failure { display: grid; grid-template-columns: minmax(190px, .6fr) minmax(0, 1.4fr); gap: 30px; margin-top: 20px; padding: 20px 24px 24px; }
.turn-playground__failure > div:first-child p:last-child { margin: 8px 0 0; color: var(--turn-muted); }
@media (max-width: 700px) { .turn-playground { padding: 24px 16px 56px; } .turn-playground__header, .turn-playground__failure { display: block; } .turn-playground__controls { justify-content: flex-start; padding-top: 16px; } .turn-playground__failure { padding-top: 20px; } .turn-playground__failure > .tx-ai-turn { margin-top: 20px; } .turn-playground__surface { padding: 18px 16px; } }
</style>
