<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

// The revision the copy button yields. A diff with its markers stripped is
// neither revision, so the host says explicitly which text is copyable.
const CODE = `export async function churnBatch() {
  const flavor = await getFlavor("pistachio")
  const base = await dairy.fetch({ flavor })
  await freezer.store(base, { temp: "-16C" })
  if (!base.approved) return null
  return base.gallons
}`

// A removed row and the added row replacing it share gutter number 4: each is
// line 4 of its own revision.
const diff = [
  { number: 1, content: 'export async function churnBatch() {' },
  { number: 2, content: '  const flavor = await getFlavor("pistachio")' },
  { number: 3, content: '  const base = await dairy.fetch({ flavor })' },
  { number: 4, kind: 'removed' as const, content: '  await freezer.store(base, { temp: "-14C" })' },
  { number: 4, kind: 'added' as const, content: '  await freezer.store(base, { temp: "-16C" })' },
  { number: 5, kind: 'added' as const, content: '  if (!base.approved) return null' },
  { number: 6, content: '  return base.gallons' },
  { number: 7, content: '}' },
]
</script>

<template>
  <TxCodeStream
    :code="CODE"
    :diff="diff"
    lang="ts"
    filename="churn.ts"
    :copy-label="zh ? '复制' : 'Copy'"
    :copied-label="zh ? '已复制' : 'Copied'"
  />
</template>
