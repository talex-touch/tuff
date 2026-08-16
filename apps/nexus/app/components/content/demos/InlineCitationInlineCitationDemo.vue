<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

interface SourceItem {
  id: string
  url: string
  title?: string
  favicon?: string
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const scoop: SourceItem = {
  id: 'scoop',
  url: 'https://scoopdata.io/flavors/pistachio',
  favicon:
    'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'16\' fill=\'%231f7a5f\'/%3E%3Ccircle cx=\'32\' cy=\'30\' r=\'14\' fill=\'%23bff3dd\'/%3E%3C/svg%3E',
}

// No favicon and no title: the chip falls back to the hostname, `www.` stripped.
const trends: SourceItem = { id: 'trends', url: 'https://www.trends.google.com/trends/' }

// A title wins over the hostname when the source carries one.
const market: SourceItem = { id: 'market', url: 'https://marketbasket.io/q3', title: 'Market Basket' }

const opened = ref<string | null>(null)

function open(source: SourceItem): void {
  opened.value = source.url
}
</script>

<template>
  <div class="flex flex-col gap-3" style="max-width: 380px;">
    <p class="text-[13px] leading-relaxed text-[var(--tx-text-color-primary)]">
      <template v-if="zh">
        开心果是增长最快的口味<TxInlineCitation :source="scoop" @open="open" />，
        同区间内核果类口味同样在上升<TxInlineCitation :source="trends" @open="open" />，
        补货窗口建议提前两周<TxInlineCitation :source="market" @open="open" />。
      </template>
      <template v-else>
        Pistachio is the fastest-growing flavor<TxInlineCitation :source="scoop" @open="open" />,
        stone-fruit is trending in the same range<TxInlineCitation :source="trends" @open="open" />,
        and the restock window should move two weeks earlier<TxInlineCitation :source="market" @open="open" />.
      </template>
    </p>

    <p class="text-sm text-[var(--tx-text-color-secondary)]">
      <template v-if="opened">
        {{ zh ? '宿主会打开：' : 'Host would open: ' }}<code>{{ opened }}</code>
      </template>
      <template v-else>
        {{ zh ? '点击引用——组件只派发 open，不会自己跳转。' : 'Click a citation — the chip emits open rather than navigating.' }}
      </template>
    </p>
  </div>
</template>
