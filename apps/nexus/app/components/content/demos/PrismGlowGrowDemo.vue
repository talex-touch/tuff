<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const active = ref(true)
const loaded = ref(false)

const copy = computed(() => zh.value
  ? {
      title: '会议摘要',
      pending: '正在生成摘要…',
      ready: '已生成 3 条要点',
      points: ['发布时间改到下周三。', '设计评审前补齐暗色截图。', '性能回归指派给了搜索小组。'],
      load: '加载内容',
      reset: '重置',
    }
  : {
      title: 'Meeting summary',
      pending: 'Writing the summary…',
      ready: '3 key points',
      points: [
        'Release moves to next Wednesday.',
        'Dark-mode screenshots are due before the design review.',
        'The search team takes the performance regression.',
      ],
      load: 'Load content',
      reset: 'Reset',
    })

// The points land while the light is still on: the card grows and the glow retracts at once.
function load() {
  loaded.value = true
}

// A collapse holds until `active` cycles. Switch it off, let the component see that, then back on.
async function reset() {
  loaded.value = false
  active.value = false
  await nextTick()
  active.value = true
}
</script>

<template>
  <div class="prism-grow not-prose">
    <!-- Wrapper usage: the root is the card, and the root is what collapseOnGrow watches by default. -->
    <TxPrismGlow class="prism-grow__card" :active="active">
      <span class="prism-grow__title">{{ copy.title }}</span>
      <span class="prism-grow__status" role="status">{{ loaded ? copy.ready : copy.pending }}</span>
      <ul v-if="loaded" class="prism-grow__list">
        <li v-for="point in copy.points" :key="point" class="prism-grow__item">
          {{ point }}
        </li>
      </ul>
    </TxPrismGlow>

    <div class="prism-grow__actions">
      <TxButton size="sm" variant="primary" :disabled="loaded" @click="load">
        {{ copy.load }}
      </TxButton>
      <TxButton size="sm" variant="secondary" :disabled="!loaded" @click="reset">
        {{ copy.reset }}
      </TxButton>
    </div>
  </div>
</template>

<style scoped>
.prism-grow {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}

/* No fixed height: the card is as tall as its content, so the points landing make it grow.
   The min-height only gives the light room, and sits well above the status lines so a late
   font swap cannot nudge the card taller and set off the collapse by itself. */
.prism-grow__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 140px;
  padding: 18px 20px;
  border-radius: 16px;
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.prism-grow__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.prism-grow__status {
  font-size: 13px;
  color: var(--tx-text-color-regular, #606266);
}

.prism-grow__list {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.prism-grow__item {
  padding: 8px 0;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  font-size: 13px;
  color: var(--tx-text-color-primary, #303133);
}

.prism-grow__actions {
  display: flex;
  gap: 8px;
}
</style>
