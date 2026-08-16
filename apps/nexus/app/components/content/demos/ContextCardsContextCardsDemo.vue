<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

// The timeline lives here, not in the component: TxContextCards is a controlled
// primitive, and these numbers are the upstream demo's cadence.
const STAGGER_STEP = 100
const CHIP_DELAY = 700
const CHIP_STAGGER_STEP = 80

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      replay: '重放入场',
      hint: `卡片每 ${STAGGER_STEP}ms 依次浮现，来源胶囊延后 ${CHIP_DELAY}ms 再逐个解析出来。`,
      reduced: '开启「减少动态效果」后，延迟会被清零而不是留白等待。',
      opened: '宿主将打开：',
      idle: '点击来源胶囊 —— 组件只发事件，不自行跳转。',
      chunks: [
        {
          id: 'c1',
          title: '供应商准入规则',
          chars: '290 characters',
          body: '新增乳制品供应商进入补货流程前，必须先核验冷链认证。',
          source: { name: '乳制品准入 SOP.pdf', badge: 'PDF', tone: 'red' as const, href: 'https://example.com/sop.pdf' },
        },
        {
          id: 'c2',
          title: '季节性需求行',
          chars: '1,250 characters',
          body: 'Q4 动销表：开心果 +18%、香草 +6%、石板街 −11%；周销低于 40 球的口味予以下架。',
          source: { name: '销售动销导出.csv', badge: 'CSV', tone: 'green' as const, href: 'https://example.com/velocity.csv' },
        },
      ],
    }
  }

  return {
    replay: 'Replay entrance',
    hint: `Cards fade up ${STAGGER_STEP}ms apart; the source chips resolve in ${CHIP_DELAY}ms later, one after another.`,
    reduced: 'Under reduced motion the delays are zeroed rather than left as blank waits.',
    opened: 'Host would open:',
    idle: 'Click a source chip — the component emits rather than navigating.',
    chunks: [
      {
        id: 'c1',
        title: 'Vendor onboarding rule',
        chars: '290 characters',
        body: 'Cold-chain certification must be verified before a new dairy can be added to the reorder workflow.',
        source: { name: 'Dairy Onboarding SOP.pdf', badge: 'PDF', tone: 'red' as const, href: 'https://example.com/sop.pdf' },
      },
      {
        id: 'c2',
        title: 'Seasonal demand row',
        chars: '1,250 characters',
        body: 'Q4 velocity table: pistachio +18%, vanilla +6%, rocky road −11%; retire flavors below 40 scoops weekly.',
        source: { name: 'Sales Velocity Export.csv', badge: 'CSV', tone: 'green' as const, href: 'https://example.com/velocity.csv' },
      },
    ],
  }
})

// Remounting is what replays a CSS entrance — the animation only runs when the
// element is created, so a stable list would never play twice.
const generation = ref(0)
const opened = ref<string | null>(null)

function replay() {
  opened.value = null
  generation.value += 1
}

function onOpen(payload: { source: { name: string, href?: string } }) {
  opened.value = payload.source.href ?? payload.source.name
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <TxContextCards
      :key="generation"
      :chunks="copy.chunks"
      :total="32"
      :stagger-step="STAGGER_STEP"
      :chip-delay="CHIP_DELAY"
      :chip-stagger-step="CHIP_STAGGER_STEP"
      @open="onOpen"
    />

    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        class="rounded-md border border-[var(--tx-border-color)] px-2 py-1 text-xs"
        @click="replay"
      >
        {{ copy.replay }}
      </button>
      <p class="text-xs text-[var(--tx-text-color-secondary)]">
        <template v-if="opened">
          {{ copy.opened }} <code>{{ opened }}</code>
        </template>
        <template v-else>
          {{ copy.idle }}
        </template>
      </p>
    </div>

    <p class="text-xs text-[var(--tx-text-color-secondary)]">
      {{ copy.hint }} {{ copy.reduced }}
    </p>
  </div>
</template>
