<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const FEEDBACK_MS = 1200

type Outcome = 'copied' | 'failed'

const copy = computed(() => zh.value
  ? {
      footer: '底栏：贴边覆盖左半边',
      header: '顶栏：行内胶囊',
      query: '翻译…',
      title: '备忘录',
      kind: '应用',
      open: '打开',
      actions: '操作',
      copy: '复制',
      fail: '模拟失败',
      copied: '已复制',
      failed: '操作失败',
    }
  : {
      footer: 'Footer: flush over the left half',
      header: 'Header: inline chip',
      query: 'Translate…',
      title: 'Notes',
      kind: 'Application',
      open: 'Open',
      actions: 'Actions',
      copy: 'Copy',
      fail: 'Simulate a failure',
      copied: 'Copied',
      failed: 'Action failed',
    })

const feedback = ref<{ id: number, outcome: Outcome } | null>(null)
const message = computed(() => feedback.value ? copy.value[feedback.value.outcome] : '')
const tone = computed(() => feedback.value?.outcome === 'failed' ? 'danger' : 'success')
let lastId = 0
let timer: number | undefined

function show(outcome: Outcome) {
  lastId += 1
  feedback.value = { id: lastId, outcome }
  window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    feedback.value = null
  }, FEEDBACK_MS)
}

onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div class="status-hint-placement not-prose">
    <div class="status-hint-placement__actions">
      <TxButton size="sm" @click="show('copied')">
        {{ copy.copy }}
      </TxButton>
      <TxButton size="sm" @click="show('failed')">
        {{ copy.fail }}
      </TxButton>
    </div>

    <div class="status-hint-placement__specimen">
      <span class="status-hint-placement__caption">{{ copy.footer }}</span>
      <div class="status-hint-placement__footer">
        <!-- The item comes back in the same update the message clears; the hint fades out over it. -->
        <div v-if="!feedback" class="status-hint-placement__item">
          <span class="status-hint-placement__item-icon i-carbon-notebook" aria-hidden="true" />
          <span class="status-hint-placement__item-title">{{ copy.title }}</span>
          <span>{{ copy.kind }}</span>
        </div>
        <Transition name="tx-status-hint">
          <TxStatusHint
            v-if="feedback"
            class="status-hint-placement__overlay"
            :text="message"
            :tone="tone"
            :pulse-key="feedback.id"
            :live="false"
          />
        </Transition>
        <div class="status-hint-placement__keys">
          <span><TxKbd>↵</TxKbd>{{ copy.open }}</span>
          <span><TxKbd>⌘K</TxKbd>{{ copy.actions }}</span>
        </div>
      </div>
    </div>

    <div class="status-hint-placement__specimen">
      <span class="status-hint-placement__caption">{{ copy.header }}</span>
      <div class="status-hint-placement__header">
        <span class="status-hint-placement__query">{{ copy.query }}</span>
        <span class="status-hint-placement__chip-slot">
          <Transition name="tx-status-hint">
            <TxStatusHint
              v-if="feedback"
              class="status-hint-placement__chip"
              size="sm"
              :text="message"
              :tone="tone"
              :pulse-key="feedback.id"
              :live="false"
            />
          </Transition>
        </span>
      </div>
    </div>

    <!-- One announcer for both copies, always mounted. -->
    <span class="status-hint-placement__live" role="status" aria-live="polite">{{ message }}</span>
  </div>
</template>

<style scoped>
.status-hint-placement {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 560px;
}

.status-hint-placement__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-hint-placement__specimen {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-hint-placement__caption {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

/* The bar is the overlay's containing block, and clips the wash to its own corners. */
.status-hint-placement__footer {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 12px;
  overflow: hidden;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.status-hint-placement__item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  white-space: nowrap;
}

.status-hint-placement__item-icon {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--tx-color-primary, #409eff);
}

.status-hint-placement__item-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

/* Flush over the left half. A scoped class outweighs the root's one-class rule in any load
   order, so `position` and the padding take effect whichever sheet loads last. */
.status-hint-placement__overlay {
  --tx-status-hint-radius: 0;
  --tx-status-hint-pad-x: 12px;

  position: absolute;
  inset-block: 0;
  left: 0;
  width: 50%;
  pointer-events: none;
}

/* Pinned right with an auto margin rather than space-between, so the keys stay put
   while the item is swapped out. */
.status-hint-placement__keys {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  white-space: nowrap;
}

.status-hint-placement__keys > span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.status-hint-placement__header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 8px 0 14px;
  border-radius: 10px;
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.status-hint-placement__query {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  color: var(--tx-text-color-placeholder, #a8abb2);
  white-space: nowrap;
}

/* One grid cell, so a hint arriving while the last one fades out lands on top of it. */
.status-hint-placement__chip-slot {
  display: grid;
  flex: 0 1 auto;
  justify-items: end;
  min-width: 0;
}

.status-hint-placement__chip {
  grid-area: 1 / 1;
}

.status-hint-placement__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
