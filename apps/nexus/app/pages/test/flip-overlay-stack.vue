<script setup lang="ts">
import { TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import { computed, ref } from 'vue'

definePageMeta({
  layout: 'default',
  title: 'FlipOverlay Stack Test',
})

const MAX_DEPTH = 5
const sameLayerStates = ref(Array.from({ length: MAX_DEPTH }, () => false))
const diffLayerStates = ref(Array.from({ length: MAX_DEPTH }, () => false))
type LayerGroup = 'same' | 'diff'

const diffCardClassList = [
  'FlipStackTest-Card--diff-a',
  'FlipStackTest-Card--diff-b',
  'FlipStackTest-Card--diff-c',
  'FlipStackTest-Card--diff-d',
  'FlipStackTest-Card--diff-e',
]

const sameDepth = computed(() => sameLayerStates.value.filter(Boolean).length)
const diffDepth = computed(() => diffLayerStates.value.filter(Boolean).length)

function resolveLayerStates(group: LayerGroup): typeof sameLayerStates {
  return group === 'same' ? sameLayerStates : diffLayerStates
}

function applyDepth(group: LayerGroup, depth: number): void {
  const target = resolveLayerStates(group)
  const safeDepth = Math.max(0, Math.min(MAX_DEPTH, depth))
  target.value = target.value.map((_, index) => index < safeDepth)
}

function setLayerVisible(group: LayerGroup, index: number, isVisible: boolean): void {
  const target = resolveLayerStates(group)

  if (isVisible) {
    applyDepth(group, index + 1)
    return
  }

  target.value = target.value.map((current, layerIndex) => {
    if (layerIndex < index)
      return current
    return false
  })
}

function openNextLayer(group: LayerGroup, index: number): void {
  applyDepth(group, index + 2)
}

function resetLayers(group: LayerGroup): void {
  applyDepth(group, 0)
}

function cardClassForSame(): string {
  return 'FlipStackTest-Card FlipStackTest-Card--same'
}

function cardClassForDiff(index: number): string {
  return `FlipStackTest-Card ${diffCardClassList[index] || 'FlipStackTest-Card--diff-a'}`
}
</script>

<template>
  <main class="FlipStackTest">
    <header class="FlipStackTest-Header">
      <h1 class="FlipStackTest-Title">
        FlipOverlay Stack Playground
      </h1>
      <p class="FlipStackTest-Desc">
        目标：验证多实例时只保留单层 mask，以及尺寸匹配时的递进位移/缩放叠层效果。
      </p>
    </header>

    <section class="FlipStackTest-Section">
      <div class="FlipStackTest-SectionHeader">
        <h2>同尺寸链路（应触发叠层）</h2>
        <p>当前层数：{{ sameDepth }}</p>
      </div>
      <div class="FlipStackTest-Actions">
        <TxButton size="small" @click="applyDepth('same', 1)">
          打开第 1 层
        </TxButton>
        <TxButton size="small" variant="secondary" @click="applyDepth('same', Math.min(MAX_DEPTH, sameDepth + 1))">
          +1 层
        </TxButton>
        <TxButton size="small" variant="secondary" @click="applyDepth('same', MAX_DEPTH)">
          直接到 5 层
        </TxButton>
        <TxButton size="small" variant="ghost" @click="resetLayers('same')">
          重置
        </TxButton>
      </div>
    </section>

    <section class="FlipStackTest-Section">
      <div class="FlipStackTest-SectionHeader">
        <h2>异尺寸链路（不应触发位移叠层）</h2>
        <p>当前层数：{{ diffDepth }}</p>
      </div>
      <div class="FlipStackTest-Actions">
        <TxButton size="small" @click="applyDepth('diff', 1)">
          打开第 1 层
        </TxButton>
        <TxButton size="small" variant="secondary" @click="applyDepth('diff', Math.min(MAX_DEPTH, diffDepth + 1))">
          +1 层
        </TxButton>
        <TxButton size="small" variant="secondary" @click="applyDepth('diff', MAX_DEPTH)">
          直接到 5 层
        </TxButton>
        <TxButton size="small" variant="ghost" @click="resetLayers('diff')">
          重置
        </TxButton>
      </div>
    </section>

    <Teleport to="body">
      <TxFlipOverlay
        v-for="(_, index) in sameLayerStates"
        :key="`same-${index}`"
        :model-value="sameLayerStates[index]"
        :header-title="`同尺寸 Overlay #${index + 1}`"
        header-desc="多开时应出现旧层上移收缩、新层展开的叠加感"
        transition-name="FlipStackTest-MaskTransition"
        mask-class="FlipStackTest-Mask"
        :card-class="cardClassForSame()"
        @update:model-value="value => setLayerVisible('same', index, value)"
      >
        <template #default="{ close }">
          <div class="FlipStackTest-Body">
            <p>当前层：{{ index + 1 }} / {{ MAX_DEPTH }}</p>
            <p>预期：mask 始终只有一层可见，旧层向上缩放并递进淡化。</p>
            <div class="FlipStackTest-BodyActions">
              <TxButton
                v-if="index < MAX_DEPTH - 1"
                size="small"
                variant="secondary"
                @click="openNextLayer('same', index)"
              >
                打开下一层
              </TxButton>
              <TxButton size="small" @click="close">
                关闭当前层
              </TxButton>
            </div>
          </div>
        </template>
      </TxFlipOverlay>

      <TxFlipOverlay
        v-for="(_, index) in diffLayerStates"
        :key="`diff-${index}`"
        :model-value="diffLayerStates[index]"
        :header-title="`异尺寸 Overlay #${index + 1}`"
        header-desc="尺寸差异较大时不做位移叠层，仅保持顶层展开"
        transition-name="FlipStackTest-MaskTransition"
        mask-class="FlipStackTest-Mask"
        :card-class="cardClassForDiff(index)"
        @update:model-value="value => setLayerVisible('diff', index, value)"
      >
        <template #default="{ close }">
          <div class="FlipStackTest-Body">
            <p>当前层：{{ index + 1 }} / {{ MAX_DEPTH }}</p>
            <p>预期：尺寸不匹配时，下层不应出现 `is-stack-layered` 位移态。</p>
            <div class="FlipStackTest-BodyActions">
              <TxButton
                v-if="index < MAX_DEPTH - 1"
                size="small"
                variant="secondary"
                @click="openNextLayer('diff', index)"
              >
                打开下一层
              </TxButton>
              <TxButton size="small" @click="close">
                关闭当前层
              </TxButton>
            </div>
          </div>
        </template>
      </TxFlipOverlay>
    </Teleport>
  </main>
</template>

<style scoped>
.FlipStackTest {
  max-width: 980px;
  margin: 0 auto;
  padding: 28px 20px 48px;
  display: grid;
  gap: 18px;
}

.FlipStackTest-Header {
  display: grid;
  gap: 8px;
}

.FlipStackTest-Title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
}

.FlipStackTest-Desc {
  margin: 0;
  font-size: 14px;
  color: var(--tx-text-color-secondary);
}

.FlipStackTest-Section {
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light) 75%, transparent);
  border-radius: 16px;
  padding: 14px;
  display: grid;
  gap: 12px;
}

.FlipStackTest-SectionHeader {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.FlipStackTest-SectionHeader h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.FlipStackTest-SectionHeader p {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.FlipStackTest-Actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.FlipStackTest-Body {
  display: grid;
  gap: 10px;
  height: 100%;
  padding: 6px;
}

.FlipStackTest-Body p {
  margin: 0;
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}

.FlipStackTest-BodyActions {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>

<style>
.FlipStackTest-Mask {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 12, 18, 0.46);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  perspective: 1200px;
}

.FlipStackTest-MaskTransition-enter-active,
.FlipStackTest-MaskTransition-leave-active {
  transition: opacity 200ms ease;
}

.FlipStackTest-MaskTransition-enter-from,
.FlipStackTest-MaskTransition-leave-to {
  opacity: 0;
}

.FlipStackTest-Card {
  border-radius: 16px;
  box-shadow: 0 26px 62px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
}

.FlipStackTest-Card--same {
  width: min(560px, 92vw);
  min-height: 300px;
  max-height: 82vh;
}

.FlipStackTest-Card--diff-a {
  width: min(520px, 90vw);
  min-height: 280px;
  max-height: 80vh;
}

.FlipStackTest-Card--diff-b {
  width: min(680px, 94vw);
  min-height: 360px;
  max-height: 84vh;
}

.FlipStackTest-Card--diff-c {
  width: min(430px, 88vw);
  min-height: 260px;
  max-height: 78vh;
}

.FlipStackTest-Card--diff-d {
  width: min(760px, 95vw);
  min-height: 420px;
  max-height: 86vh;
}

.FlipStackTest-Card--diff-e {
  width: min(600px, 93vw);
  min-height: 300px;
  max-height: 82vh;
}
</style>
