<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCard } from '@talex-touch/tuffex/card'
import { TxIconMorph } from '@talex-touch/tuffex/icon-morph'
import { TxSlider } from '@talex-touch/tuffex/slider'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const icons = ['menu', 'close', 'check', 'plus', 'arrow-down', 'chevron-up', 'search']
const index = ref(0)
const controlled = ref(false)
const progress = ref(0)

const currentIcon = computed(() => icons[index.value] ?? 'menu')
const nextIcon = computed(() => icons[(index.value + 1) % icons.length] ?? 'close')

function next() {
  index.value = (index.value + 1) % icons.length
}

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      toggle: '切换下一个图标',
      autoMode: '自动弹簧模式',
      dragMode: '受控进度模式',
      progress: '变形进度',
      note: '两个任意轮廓线条图标之间的平滑形变，基于 2D Procrustes 对齐与极坐标弹簧插值。',
    }
  }

  return {
    toggle: 'Next icon',
    autoMode: 'Automatic spring mode',
    dragMode: 'Controlled progress mode',
    progress: 'Morph progress',
    note: 'Smooth vector morphing between arbitrary stroke-based icons with 2D Procrustes alignment and polar spring physics.',
  }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-3 flex-wrap">
      <TxButton @click="next">
        {{ copy.toggle }}
      </TxButton>
      <TxButton variant="flat" @click="controlled = !controlled">
        {{ controlled ? copy.autoMode : copy.dragMode }}
      </TxButton>

      <div v-if="controlled" class="w-48">
        <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ copy.progress }}</span>
        <TxSlider v-model="progress" :min="0" :max="1" :step="0.01" show-value />
      </div>
    </div>

    <TxCard variant="plain" background="mask" :padding="24" :radius="14">
      <div class="flex items-center justify-center p-6 text-primary text-3xl">
        <TxIconMorph
          v-if="!controlled"
          :icon="currentIcon"
          :size="48"
          spring="snappy"
        />
        <TxIconMorph
          v-else
          :from="currentIcon"
          :to="nextIcon"
          :progress="progress"
          :size="48"
        />
      </div>
    </TxCard>

    <p class="text-xs text-[var(--tx-text-color-secondary)]">
      {{ copy.note }}
    </p>
  </div>
</template>
