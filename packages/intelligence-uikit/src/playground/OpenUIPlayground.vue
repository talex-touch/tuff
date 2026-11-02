<script setup lang="ts">
import type { OpenUIAction } from '../components/openui'
import { onBeforeUnmount, ref, watch } from 'vue'
import { TxAiOpenUI } from '../components/openui'
import { openUIPrograms } from './openui-programs'
import '@talex-touch/tuffex/base.css'

const dark = ref(false)
const streaming = ref('')
const drafts = ref<Record<string, string>>({})
const action = ref<OpenUIAction | null>(null)
let timer: ReturnType<typeof setInterval> | undefined
watch(dark, (value) => {
  document.documentElement.classList.toggle('openui-playground-dark', value)
  document.documentElement.dataset.theme = value ? 'dark' : 'light'
}, { immediate: true })
function stream(program: (typeof openUIPrograms)[number]) {
  clearInterval(timer)
  streaming.value = program.id
  drafts.value[program.id] = ''
  let index = 0
  timer = setInterval(() => {
    index += 40
    drafts.value[program.id] = program.code.slice(0, index)
    if (index >= program.code.length) { clearInterval(timer); streaming.value = '' }
  }, 30)
}
onBeforeUnmount(() => {
  clearInterval(timer)
  document.documentElement.classList.remove('openui-playground-dark')
  delete document.documentElement.dataset.theme
})
</script>

<template>
  <main class="openui-playground">
    <header class="openui-playground__header">
      <div>
        <a href="/">intelligence-uikit</a>
        <h1>Answers you can use.</h1>
        <p>OpenUI Lang · Vue 3 · Live, local state</p>
      </div>
      <button type="button" :aria-pressed="dark" @click="dark = !dark">
        {{ dark ? 'Light mode' : 'Dark mode' }}
      </button>
    </header>
    <aside class="openui-playground__action" role="status" aria-live="polite">
      <strong>Host action</strong><code data-testid="last-action">{{ action ? JSON.stringify(action) : 'Interact with a program. Assistant actions appear here.' }}</code>
    </aside>
    <div class="openui-playground__gallery">
      <section v-for="program in openUIPrograms" :id="program.id" :key="program.id" class="openui-playground__example">
        <div class="openui-playground__example-heading">
          <div>
            <h2>{{ program.title }}</h2>
            <p>{{ program.note }}</p>
          </div>
          <button type="button" :disabled="!!streaming" :aria-label="`Stream ${program.title}`" @click="stream(program)">
            {{ streaming === program.id ? 'Streaming…' : 'Stream it' }}
          </button>
        </div>
        <div class="openui-playground__preview">
          <TxAiOpenUI :content="drafts[program.id] ?? program.code" :streaming="streaming === program.id" @action="action = $event" />
        </div>
        <details>
          <summary>View OpenUI program</summary>
          <pre>{{ program.code }}</pre>
        </details>
      </section>
    </div>
  </main>
</template>

<style>
:root:has(.openui-playground) {
  --tx-color-primary: #4163d8;
  --tx-color-success: #32805b;
  --tx-color-warning: #a67518;
  --tx-color-danger: #c94b4b;
  --tx-text-color-primary: #24262d;
  --tx-text-color-regular: #424550;
  --tx-text-color-secondary: #686d7c;
  --tx-text-color-placeholder: #777c89;
  --tx-border-color: #d0d4df;
  --tx-border-color-light: #e1e4eb;
  --tx-fill-color: #edf0f6;
  --tx-fill-color-light: #f4f5f9;
  --tx-fill-color-lighter: #f7f8fb;
  --tx-bg-color: #fff;
  --tx-surface-color: #fff;
  color-scheme: light;
  background: #f7f8fb;
}
:root.openui-playground-dark:has(.openui-playground) {
  --tx-color-primary: #9aafff;
  --tx-color-success: #7bcc9d;
  --tx-color-warning: #e0b968;
  --tx-color-danger: #f69696;
  --tx-text-color-primary: #eff0f6;
  --tx-text-color-regular: #d4d6e0;
  --tx-text-color-secondary: #a1a7b8;
  --tx-text-color-placeholder: #969eaf;
  --tx-border-color: #424858;
  --tx-border-color-light: #333947;
  --tx-fill-color: #2a303e;
  --tx-fill-color-light: #252b37;
  --tx-fill-color-lighter: #292f3b;
  --tx-bg-color: #1b202b;
  --tx-surface-color: #1b202b;
  color-scheme: dark;
  background: #141923;
}
body:has(.openui-playground) { margin: 0; }
.openui-playground { max-width: 1320px; margin: 0 auto; padding: 40px; font: 14px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--tx-text-color-primary); }
.openui-playground__header { display: flex; align-items: start; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.openui-playground__header a { color: var(--tx-color-primary); font-size: 13px; text-decoration: none; }
.openui-playground h1 { font-size: 32px; line-height: 1.25; font-weight: 600; margin: 12px 0 8px; }
.openui-playground__header p, .openui-playground__example-heading p { color: var(--tx-text-color-secondary); margin: 0; }
.openui-playground__header > button, .openui-playground__example-heading > button { color: var(--tx-text-color-primary); font: inherit; font-size: 13px; padding: 7px 12px; border: 0; border-radius: 7px; background: var(--tx-bg-color); box-shadow: inset 0 0 0 1px var(--tx-border-color); cursor: pointer; flex-shrink: 0; }
.openui-playground__header > button:hover:not(:disabled), .openui-playground__example-heading > button:hover:not(:disabled) { background: var(--tx-fill-color); }
.openui-playground__example-heading > button:disabled { opacity: .55; cursor: default; }
.openui-playground__header > button:focus-visible, .openui-playground__example-heading > button:focus-visible, .openui-playground summary:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
.openui-playground__action { display: flex; gap: 16px; align-items: baseline; padding: 12px 16px; margin-bottom: 28px; border-radius: 8px; background: var(--tx-fill-color); overflow-wrap: anywhere; }
.openui-playground__action strong { font-size: 12px; white-space: nowrap; }
.openui-playground__action code { font-size: 12px; color: var(--tx-text-color-secondary); }
.openui-playground__gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 24px; }
.openui-playground__example { min-width: 0; border-radius: 12px; background: var(--tx-bg-color); box-shadow: inset 0 0 0 1px var(--tx-border-color-light); overflow: hidden; }
.openui-playground__example-heading { display: flex; justify-content: space-between; gap: 12px; padding: 20px; border-bottom: 1px solid var(--tx-border-color-light); }
.openui-playground h2 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
.openui-playground__example-heading p { font-size: 12px; max-width: 36ch; }
.openui-playground__preview { padding: 24px; }
.openui-playground details { border-top: 1px solid var(--tx-border-color-light); padding: 10px 20px; font-size: 12px; color: var(--tx-text-color-secondary); }
.openui-playground summary { cursor: pointer; }
.openui-playground details pre { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 11px; }
@media (max-width: 780px) { .openui-playground { padding: 20px; } .openui-playground__gallery { grid-template-columns: minmax(0, 1fr); } .openui-playground__action { flex-direction: column; gap: 4px; } }
</style>
