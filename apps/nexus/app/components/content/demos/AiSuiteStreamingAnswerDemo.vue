<script setup lang="ts">
// The Beautiful UI "streaming text" composition: words resolve out of blur, an
// inline citation lands in context, then the sources summary and the follow-ups
// become usable. The timeline lives here — the components themselves are
// controlled primitives that only render what they are handed.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { hasWindow } from '@talex-touch/utils/env'

interface Token {
  text: string
  cite?: boolean
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const WORD_MS = 55
const HOLD_MS = 3400

const AVATARS = {
  scoop:
    'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'16\' fill=\'%231f7a5f\'/%3E%3Cpath d=\'M20 36c0 7 5.4 12 12 12s12-5 12-12H20Z\' fill=\'%23fff\'/%3E%3Ccircle cx=\'32\' cy=\'25\' r=\'11\' fill=\'%23bff3dd\'/%3E%3C/svg%3E',
  trends:
    'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'16\' fill=\'%232f6fec\'/%3E%3Cpath d=\'M15 43 27 31l8 7 14-18\' fill=\'none\' stroke=\'%23fff\' stroke-width=\'7\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E',
  market:
    'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'16\' fill=\'%23e56d24\'/%3E%3Cpath d=\'M17 45V25h8v20h-8Zm11 0V16h8v29h-8Zm11 0V30h8v15h-8Z\' fill=\'%23fff\'/%3E%3C/svg%3E',
}

const sources = [
  { id: 'scoop', url: 'https://scoopdata.io/flavors', title: 'Scoop Data', favicon: AVATARS.scoop },
  { id: 'trends', url: 'https://trends.google.com/trends/', title: 'Trends Index', favicon: AVATARS.trends },
  { id: 'market', url: 'https://marketbasket.io/report', title: 'Market Basket', favicon: AVATARS.market },
]

// The citation points at its own source rather than being indexed in the
// template — upstream always reads element 0 regardless of position.
const cited = sources[0]!

const tokens = computed<Token[]>(() => {
  const [lead, tail] = zh.value
    ? ['开心果 是 增长 最快 的 口味 —— 本月 销量 上涨 23%， 毛利 比 香草 高 8 个 百分点。', '同区间 内 核果 类 口味 同样 在 上升。']
    : [
        'Pistachio is your fastest-growing flavor — sales are up 23% this month and margins beat vanilla by 8 points.',
        'Stone-fruit flavors are trending in the same range.',
      ]

  return [
    ...lead.split(' ').map(text => ({ text })),
    { text: '', cite: true },
    ...tail.split(' ').map(text => ({ text })),
  ]
})

const followUps = computed(() =>
  zh.value
    ? [
        { id: 'winter', text: '冬天哪些口味卖得最好' },
        { id: 'margins', text: '对比意式冰淇淋和软冰淇淋的毛利' },
      ]
    : [
        { id: 'winter', text: 'Which flavors sell best in winter' },
        { id: 'margins', text: 'Compare gelato and soft serve margins' },
      ],
)

const count = ref(0)
const opened = ref<string | null>(null)
const asked = ref<string | null>(null)

const done = computed(() => count.value >= tokens.value.length)
const visible = computed(() => tokens.value.slice(0, count.value))

// JS timers are not covered by the reduced-motion media query, so the loop has
// to check for itself and settle on the finished state instead.
const still = hasWindow()
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let timer: ReturnType<typeof setTimeout> | undefined

function schedule(): void {
  clearTimeout(timer)
  if (still) {
    count.value = tokens.value.length
    return
  }

  timer = setTimeout(
    () => {
      count.value = done.value ? 0 : count.value + 1
    },
    done.value ? HOLD_MS : WORD_MS,
  )
}

watch(count, schedule, { immediate: true })
// Switching language re-splits the tokens, so restart rather than stream into
// a sentence that no longer exists.
watch(tokens, () => {
  count.value = 0
})

onBeforeUnmount(() => clearTimeout(timer))

function sourceLabel(n: number): string {
  return zh.value ? `${n} 个来源` : `${n} sources`
}
</script>

<template>
  <div class="answer">
    <p class="answer__body">
      <template v-for="(token, index) in visible" :key="index">
        <TxInlineCitation
          v-if="token.cite"
          :source="cited"
          @open="opened = $event.url"
        />
        <span v-else class="answer__word">{{ token.text }} </span>
      </template>
      <span v-if="!done" class="answer__caret" aria-hidden="true" />
    </p>

    <div class="answer__reveal" :class="{ 'is-on': done }">
      <TxSources
        :sources="sources"
        variant="stack"
        :label-formatter="sourceLabel"
        @open="opened = $event.url"
      />
    </div>

    <div class="answer__reveal" :class="{ 'is-on': done }">
      <p class="answer__label">
        {{ zh ? '追问' : 'Follow-ups' }}
      </p>
      <TxSuggestionChips
        :suggestions="followUps"
        layout="list"
        @select="asked = $event.text"
      />
    </div>

    <p class="answer__status">
      <template v-if="opened">
        {{ zh ? '宿主会打开：' : 'Host would open: ' }}<code>{{ opened }}</code>
      </template>
      <template v-else-if="asked">
        {{ zh ? '已追问：' : 'Asked: ' }}<code>{{ asked }}</code>
      </template>
      <template v-else>
        {{ zh ? '链接与追问都只派发事件，由宿主决定后续。' : 'Links and follow-ups only emit — the host decides what happens.' }}
      </template>
    </p>
  </div>
</template>

<style scoped lang="scss">
.answer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 380px;
  min-height: 15.5rem;
}

.answer__body {
  margin: 0;
  font-size: 13px;
  line-height: 1.625;
  color: var(--tx-text-color-primary);
}

.answer__word {
  display: inline;
  will-change: filter, opacity;
  animation: demo-stream-in 420ms cubic-bezier(0.22, 0.61, 0.25, 1) both;
}

// A settled bar, not a blinking one: the caret marks where text is still
// arriving and blinking would compete with the words resolving beside it.
.answer__caret {
  display: inline-block;
  width: 2px;
  height: 12px;
  margin-left: 2px;
  transform: translateY(2px);
  border-radius: 999px;
  background: var(--tx-text-color-primary);
  animation: demo-fade-in 150ms ease-out both;
}

.answer__reveal {
  opacity: 0;
  pointer-events: none;
  transition: opacity 400ms ease;

  &.is-on {
    opacity: 1;
    pointer-events: auto;
  }
}

.answer__label {
  margin: 0 0 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--tx-text-color-secondary);
}

.answer__status {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

@keyframes demo-stream-in {
  0% {
    opacity: 0;
    filter: blur(4px);
  }

  to {
    opacity: 1;
    filter: blur(0);
  }
}

@keyframes demo-fade-in {
  0% {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .answer__word,
  .answer__caret {
    animation: none;
  }

  .answer__reveal {
    transition: none;
  }
}
</style>
