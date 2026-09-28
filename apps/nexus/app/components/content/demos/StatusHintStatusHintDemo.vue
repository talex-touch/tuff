<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

// As in CoreBox: a message stays up for 1.2s, and a new one replaces it and restarts the clock.
const FEEDBACK_MS = 1200

type Outcome = 'pinned' | 'unpinned' | 'copied' | 'failed'

const copy = computed(() => zh.value
  ? {
      pin: '固定',
      unpin: '取消固定',
      copy: '复制',
      fail: '模拟失败',
      pinned: '已固定',
      unpinned: '已取消固定',
      copied: '已复制',
      failed: '固定失败',
    }
  : {
      pin: 'Pin',
      unpin: 'Unpin',
      copy: 'Copy',
      fail: 'Simulate a failure',
      pinned: 'Pinned',
      unpinned: 'Unpinned',
      copied: 'Copied',
      failed: 'Could not pin',
    })

const pinned = ref(false)
// A new id per message, so the same outcome twice in a row still replays the emphasis.
const feedback = ref<{ id: number, outcome: Outcome } | null>(null)
const message = computed(() => feedback.value ? copy.value[feedback.value.outcome] : '')
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

function togglePin() {
  pinned.value = !pinned.value
  show(pinned.value ? 'pinned' : 'unpinned')
}

onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div class="status-hint-demo not-prose">
    <div class="status-hint-demo__actions">
      <TxButton size="sm" @click="togglePin">
        {{ pinned ? copy.unpin : copy.pin }}
      </TxButton>
      <TxButton size="sm" @click="show('copied')">
        {{ copy.copy }}
      </TxButton>
      <TxButton size="sm" @click="show('failed')">
        {{ copy.fail }}
      </TxButton>
    </div>
    <div class="status-hint-demo__slot">
      <!-- No :key per message: the hint stays mounted while messages change, so the text morphs. -->
      <Transition name="tx-status-hint">
        <TxStatusHint
          v-if="feedback"
          class="status-hint-demo__hint"
          :text="message"
          :tone="feedback.outcome === 'failed' ? 'danger' : 'success'"
          :pulse-key="feedback.id"
          :live="false"
        />
      </Transition>
    </div>
    <!-- The hint mounts together with its message, which not every screen reader announces,
         so the message is announced from a region that is always mounted. -->
    <span class="status-hint-demo__live" role="status" aria-live="polite">{{ message }}</span>
  </div>
</template>

<style scoped>
.status-hint-demo {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.status-hint-demo__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* One grid cell: a hint that arrives while the previous one is still fading out
   lands on top of it instead of beside it. */
.status-hint-demo__slot {
  display: grid;
  flex: 1 1 180px;
  align-items: center;
  justify-items: start;
  min-width: 0;
  min-height: 30px;
}

.status-hint-demo__hint {
  grid-area: 1 / 1;
}

.status-hint-demo__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}
</style>
