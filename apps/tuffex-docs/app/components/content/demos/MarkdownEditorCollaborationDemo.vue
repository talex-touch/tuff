<script setup lang="ts">
import type { MarkdownEditorToolbarActionKey } from '@talex-touch/tuffex/markdown-editor'
import type { DemoRoom, DemoRoomClient } from './markdown-editor-demo-room'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { MARKDOWN_EDITOR_ZH_LABELS } from './markdown-editor-demo-labels'
import { createDemoRoom, startDemoBot } from './markdown-editor-demo-room'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const SAMPLES = {
  zh: {
    doc: `## 2.5 发布清单

- [x] 合并新的搜索管线
- [ ] 写发布说明
- [ ] 更新官网截图

有问题直接写在这里，大家看到的是同一份文档。
`,
    people: [
      { id: 'lin', name: '林夏', color: '#0ea5e9' },
      { id: 'zhou', name: '周远', color: '#f97316' },
    ],
    bot: { id: 'chen', name: '陈默', color: '#a855f7' },
    script: { after: '更新官网截图', text: '\n- [ ] 录一段 30 秒的演示视频', select: '30 秒' },
    screen: '{name}的屏幕',
    hint: '左右两个编辑器是两位同事的屏幕，连着同一个模拟房间（单程延迟约 120–150 ms，不连真实服务器）。在任意一边输入，另一边会同步出文字和你的光标；陈默会自己补上一条待办。',
  },
  en: {
    doc: `## 2.5 launch checklist

- [x] Merge the new search pipeline
- [ ] Write the release notes
- [ ] Update the website screenshots

Questions go right here: everyone sees the same document.
`,
    people: [
      { id: 'lin', name: 'Lin Xia', color: '#0ea5e9' },
      { id: 'zhou', name: 'Zhou Yuan', color: '#f97316' },
    ],
    bot: { id: 'chen', name: 'Chen Mo', color: '#a855f7' },
    script: { after: 'Update the website screenshots', text: '\n- [ ] Record a 30-second demo video', select: '30-second' },
    screen: '{name}’s screen',
    hint: 'The two editors are two colleagues’ screens in one simulated room (about 120–150 ms each way, no real server). Type in either and the other shows your text and caret; Chen Mo adds a to-do too.',
  },
}

const TOOLBAR: MarkdownEditorToolbarActionKey[] = ['heading', 'bold', 'italic', 'highlight', 'taskList', 'undo', 'redo']

const sample = computed(() => SAMPLES[zh.value ? 'zh' : 'en'])
const labels = computed(() => (zh.value ? MARKDOWN_EDITOR_ZH_LABELS : undefined))

interface Session {
  room: DemoRoom
  clients: DemoRoomClient[]
  /** Remounts the editors with a new room. */
  key: number
}

const rootRef = ref<HTMLElement | null>(null)
const session = shallowRef<Session>(open(0))
const texts = ref(session.value.clients.map(client => client.text()))
let stopBot: (() => void) | null = null
let seen = false
let observer: IntersectionObserver | null = null

function open(key: number): Session {
  const room = createDemoRoom(sample.value.doc)
  return { room, clients: sample.value.people.map(person => room.join(person)), key }
}

function startBot(): void {
  stopBot?.()
  stopBot = startDemoBot(session.value.room, sample.value.bot, sample.value.script)
}

function close(): void {
  stopBot?.()
  stopBot = null
  session.value.room.dispose()
}

watch(zh, () => {
  close()
  session.value = open(session.value.key + 1)
  texts.value = session.value.clients.map(client => client.text())
  if (seen)
    startBot()
})

// The colleague starts typing once the demo is in view, not while it mounts ahead of it.
onMounted(() => {
  const el = rootRef.value
  const show = () => {
    seen = true
    startBot()
  }
  if (!el || typeof IntersectionObserver === 'undefined') {
    show()
    return
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting))
      return
    observer?.disconnect()
    observer = null
    show()
  }, { threshold: 0.5 })
  observer.observe(el)
})

onBeforeUnmount(() => {
  observer?.disconnect()
  observer = null
  close()
})
</script>

<template>
  <div ref="rootRef" class="markdown-editor-collaboration not-prose">
    <div class="markdown-editor-collaboration__screens">
      <section
        v-for="(person, index) in sample.people"
        :key="`${session.key}-${person.id}`"
        class="markdown-editor-collaboration__screen"
      >
        <span class="markdown-editor-collaboration__who">
          <span class="markdown-editor-collaboration__dot" :style="{ background: person.color }" />
          {{ sample.screen.replace('{name}', person.name) }}
        </span>
        <TxMarkdownEditor
          v-model="texts[index]"
          :user="person"
          :collaboration="session.clients[index]?.collaboration"
          :labels="labels"
          :toolbar-actions="TOOLBAR"
          :min-height="200"
          :max-height="360"
        />
      </section>
    </div>
    <span class="markdown-editor-collaboration__hint">{{ sample.hint }}</span>
  </div>
</template>

<style scoped>
.markdown-editor-collaboration {
  display: grid;
  gap: 8px;
}

.markdown-editor-collaboration__screens {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 12px;
}

.markdown-editor-collaboration__screen {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.markdown-editor-collaboration__who {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.markdown-editor-collaboration__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.markdown-editor-collaboration__hint {
  font-size: 14px;
  color: var(--tx-text-color-secondary);
}
</style>
