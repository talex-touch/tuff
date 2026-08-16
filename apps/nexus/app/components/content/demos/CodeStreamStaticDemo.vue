<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const CODE = `type Flavor = {
  name: string
  gallons: number
}

export function totalGallons(flavors: Flavor[]) {
  return flavors.reduce((sum, flavor) => sum + flavor.gallons, 0)
}`

const copy = computed(() => (locale.value === 'zh'
  ? { copyLabel: '复制', copiedLabel: '已复制' }
  : { copyLabel: 'Copy', copiedLabel: 'Copied' }))
</script>

<template>
  <div class="max-w-[380px]">
    <!-- No revealedLines: the whole listing is shown and no caret is drawn. -->
    <TxCodeStream
      :code="CODE"
      lang="ts"
      filename="inventory.ts"
      lang-label="TypeScript"
      :copy-label="copy.copyLabel"
      :copied-label="copy.copiedLabel"
    />
  </div>
</template>
