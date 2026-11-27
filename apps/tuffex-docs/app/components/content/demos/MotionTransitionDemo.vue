<script setup lang="ts">
import type { MotionTransitionCompletion, MotionTransitionVariant } from '@talex-touch/tuffex/pro'
import { computed, reactive, ref, useId } from 'vue'

const { locale } = useI18n()
const id = useId()
const variants: MotionTransitionVariant[] = [
  'spatial-door-portal', 'french-doors-3d', 'obsidian-liquid-wave', 'radial-iris-mask',
  'perspective-flip-stage', 'staggered-glass-curtain', 'double-stairs', 'liquid-wave', 'cross-fade',
]
const selected = ref<MotionTransitionVariant>('spatial-door-portal')
const speed = ref(1)
const instant = ref(false)
const disabled = ref(false)
const inlineKey = ref(0)
const inlineReplay = ref(0)
const inlineResult = ref<MotionTransitionCompletion | null>(null)
const dialogKey = ref(0)
const dialogReplay = ref(0)
const dialogMode = ref<'modal' | 'overlay'>('modal')
const open = ref(false)
const dialogResult = ref<MotionTransitionCompletion | null>(null)
const cardKeys = reactive(Object.fromEntries(variants.map(variant => [variant, 0])) as Record<MotionTransitionVariant, number>)
const cardReplay = reactive(Object.fromEntries(variants.map(variant => [variant, 0])) as Record<MotionTransitionVariant, number>)
const results = reactive<Partial<Record<MotionTransitionVariant, MotionTransitionCompletion>>>({})
const cardRunning = reactive<Partial<Record<MotionTransitionVariant, boolean>>>({})
const customText = ref('')
const copy = computed(() => locale.value === 'zh' ? {
  effect: '转场效果', speed: '播放速度', instant: '立即提交内容（duration=0）', input: '写入真实内容',
  disabled: '禁用动态效果（内容仍提交）',
  inputHint: '这里输入的文字会出现在每个进场视图。', next: '替换内容', replay: '重复播放',
  modal: '打开弹窗', overlay: '打开全屏', close: '关闭', title: '内容转场',
  first: '项目概览', second: '交付清单', descriptionA: '整理需求、负责人和待确认事项。',
  descriptionB: '检查文档、组件和可观察的完成结果。', revision: '内容版本', initial: '等待触发',
  focus: '可聚焦内容按钮', focusHint: '内容内触发替换后，焦点会移至新内容。',
  note: '持续点击“替换内容”可打断当前转场。关闭仍提交最新内容；Escape 关闭后回到打开按钮。系统的减少动态效果偏好会立即完成内容状态。',
  cards: '全部独立效果', inline: '行内内容', registry: 'Registry 的真实分支：交错阶梯、液体波和通用淡化。其余上游声明名只有同一淡化兜底，不作为独立效果展示。',
} : {
  effect: 'Transition effect', speed: 'Playback rate', instant: 'Commit immediately (duration=0)', input: 'Supply real content',
  disabled: 'Disable motion (content still commits)',
  inputHint: 'Your text appears in each incoming view.', next: 'Replace content', replay: 'Replay',
  modal: 'Open modal', overlay: 'Open fullscreen', close: 'Close', title: 'Content transition',
  first: 'Project overview', second: 'Delivery checklist', descriptionA: 'Organize requirements, owners and pending decisions.',
  descriptionB: 'Review documentation, components and observable completion.', revision: 'Content revision', initial: 'Ready to trigger',
  focus: 'Focusable content action', focusHint: 'A replacement from inside the content transfers focus to the new view.',
  note: 'Keep pressing Replace content to interrupt a running transition. Closing commits the latest content; Escape restores focus to the opener. The system reduced-motion preference commits content immediately.',
  cards: 'Every distinct effect', inline: 'Inline content', registry: 'The registry implements alternating stairs, liquid wave and a generic fade. Its other declared names share that fade fallback and are not presented as distinct effects.',
})
const names = computed<Record<MotionTransitionVariant, string>>(() => locale.value === 'zh' ? {
  'spatial-door-portal': '空间双门', 'french-doors-3d': '法式对开门', 'obsidian-liquid-wave': '黑曜石液体波',
  'radial-iris-mask': '径向光圈', 'perspective-flip-stage': '透视翻转', 'staggered-glass-curtain': '错层玻璃帘',
  'double-stairs': '交错阶梯', 'liquid-wave': 'Registry 液体波', 'cross-fade': '通用淡化',
} : {
  'spatial-door-portal': 'Spatial door portal', 'french-doors-3d': 'French doors', 'obsidian-liquid-wave': 'Obsidian liquid wave',
  'radial-iris-mask': 'Radial iris', 'perspective-flip-stage': 'Perspective flip', 'staggered-glass-curtain': 'Glass curtain',
  'double-stairs': 'Alternating stairs', 'liquid-wave': 'Registry liquid wave', 'cross-fade': 'Generic fade',
})
function resultText(result: MotionTransitionCompletion | null | undefined): string {
  return result ? `${result.from} → ${result.to} · ${result.status}` : copy.value.initial
}
function showDialog(mode: 'modal' | 'overlay'): void {
  dialogMode.value = mode
  open.value = true
}
function hoverCard(variant: MotionTransitionVariant): void {
  if (!cardRunning[variant])
    cardKeys[variant]++
}
function completeCard(variant: MotionTransitionVariant, detail: MotionTransitionCompletion): void {
  results[variant] = detail
  if (detail.status !== 'interrupted')
    cardRunning[variant] = false
}
</script>

<template>
  <div class="motion-transition-demo not-prose">
    <div class="motion-transition-demo__settings">
      <div>
        <label :for="`${id}-effect`">{{ copy.effect }}</label>
        <select :id="`${id}-effect`" v-model="selected">
          <option v-for="variant in variants" :key="variant" :value="variant">
{{ names[variant] }}
</option>
        </select>
      </div>
      <div>
        <label :for="`${id}-speed`">{{ copy.speed }}</label>
        <select :id="`${id}-speed`" v-model.number="speed">
<option :value="0.5">
0.5×
</option><option :value="1">
1×
</option><option :value="2">
2×
</option>
</select>
      </div>
      <label class="motion-transition-demo__check"><input v-model="instant" type="checkbox">{{ copy.instant }}</label>
      <label class="motion-transition-demo__check"><input v-model="disabled" type="checkbox">{{ copy.disabled }}</label>
    </div>
    <label :for="`${id}-content`">{{ copy.input }}</label>
    <input :id="`${id}-content`" v-model="customText" class="motion-transition-demo__input" :placeholder="copy.inputHint">
    <p class="motion-transition-demo__note">
{{ copy.note }}
</p>

    <h4>{{ copy.inline }}</h4>
    <ClientOnly>
      <TxMotionTransition :model-value="inlineKey" :replay-key="inlineReplay" :variant="selected" :speed="speed" :duration="instant ? 0 : undefined" :disabled="disabled" @completed="inlineResult = $event">
        <template #default="{ key }">
          <div class="motion-transition-demo__content" :class="{ 'motion-transition-demo__content--alternate': Number(key) % 2 }">
            <span>{{ copy.revision }} {{ key }}</span>
            <h4>{{ Number(key) % 2 ? copy.second : copy.first }}</h4>
            <p>{{ customText || (Number(key) % 2 ? copy.descriptionB : copy.descriptionA) }}</p>
            <TxButton size="sm" @click="inlineKey++">
{{ copy.focus }}
</TxButton>
          </div>
        </template>
      </TxMotionTransition>
    </ClientOnly>
    <div class="motion-transition-demo__actions">
      <TxButton size="sm" @click="inlineKey++">
{{ copy.next }}
</TxButton>
      <TxButton size="sm" @click="inlineReplay++">
{{ copy.replay }}
</TxButton>
      <TxButton size="sm" @click="showDialog('modal')">
{{ copy.modal }}
</TxButton>
      <TxButton size="sm" @click="showDialog('overlay')">
{{ copy.overlay }}
</TxButton>
    </div>
    <p role="status" aria-live="polite" class="motion-transition-demo__result">
{{ resultText(inlineResult) }}
</p>
    <p class="motion-transition-demo__note">
{{ copy.focusHint }}
</p>

    <ClientOnly>
      <TxMotionTransition
        v-model:open="open" :model-value="dialogKey" :replay-key="dialogReplay" :variant="selected" :mode="dialogMode"
        :title="copy.title" :aria-label="copy.title" :close-label="copy.close" :speed="speed" :duration="instant ? 0 : undefined"
        :disabled="disabled"
        @completed="dialogResult = $event"
      >
        <template #default="{ key }">
          <div class="motion-transition-demo__content motion-transition-demo__content--dialog" :class="{ 'motion-transition-demo__content--alternate': Number(key) % 2 }">
            <span>{{ copy.revision }} {{ key }} · {{ names[selected] }}</span>
            <h4>{{ Number(key) % 2 ? copy.second : copy.first }}</h4>
            <p>{{ customText || (Number(key) % 2 ? copy.descriptionB : copy.descriptionA) }}</p>
            <TxButton size="sm" @click="dialogKey++">
{{ copy.focus }}
</TxButton>
          </div>
        </template>
        <template #footer="{ close }">
          <div class="motion-transition-demo__actions">
            <TxButton size="sm" @click="dialogKey++">
{{ copy.next }}
</TxButton>
            <TxButton size="sm" @click="dialogReplay++">
{{ copy.replay }}
</TxButton>
            <TxButton size="sm" @click="close">
{{ copy.close }}
</TxButton>
            <span role="status" aria-live="polite">{{ resultText(dialogResult) }}</span>
          </div>
        </template>
      </TxMotionTransition>
    </ClientOnly>

    <h4>{{ copy.cards }}</h4>
    <p class="motion-transition-demo__note">
{{ copy.registry }}
</p>
    <div class="motion-transition-demo__grid">
      <ClientOnly>
        <TxMotionTransition
          v-for="variant in variants" :key="variant" :model-value="cardKeys[variant]" :replay-key="cardReplay[variant]"
          mode="card" size="sm" :variant="variant" :title="names[variant]" :speed="speed" :duration="instant ? 0 : undefined"
          :disabled="disabled"
          @mouseenter="hoverCard(variant)"
          @start="cardRunning[variant] = true"
          @completed="completeCard(variant, $event)"
        >
          <template #default="{ key }">
            <div class="motion-transition-demo__content" :class="{ 'motion-transition-demo__content--alternate': Number(key) % 2 }">
              <span>{{ copy.revision }} {{ key }}</span>
              <h4>{{ Number(key) % 2 ? copy.second : copy.first }}</h4>
              <p>{{ customText || (Number(key) % 2 ? copy.descriptionB : copy.descriptionA) }}</p>
              <TxButton size="sm" @click="cardKeys[variant]++">
{{ copy.focus }}
</TxButton>
            </div>
          </template>
          <template #footer>
            <div class="motion-transition-demo__card-footer">
              <div class="motion-transition-demo__actions">
                <TxButton size="sm" @click="cardKeys[variant]++">
{{ copy.next }}
</TxButton>
                <TxButton size="sm" @click="cardReplay[variant]++">
{{ copy.replay }}
</TxButton>
              </div>
              <span role="status" aria-live="polite">{{ resultText(results[variant]) }}</span>
            </div>
          </template>
        </TxMotionTransition>
      </ClientOnly>
    </div>
  </div>
</template>

<style scoped>
.motion-transition-demo { display: grid; gap: 12px; color: var(--tx-text-color-primary, #303133); font-size: 14px; }
.motion-transition-demo__settings { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; }
.motion-transition-demo__settings > div { display: grid; gap: 4px; }
.motion-transition-demo label { font-size: 13px; }
.motion-transition-demo select, .motion-transition-demo__input { min-height: 32px; max-width: 100%; padding: 6px 10px; border: 0; border-radius: 8px; box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6); color: var(--tx-text-color-primary, #303133); background: var(--tx-bg-color, #fff); font-size: 13px; }
.motion-transition-demo select, .motion-transition-demo__check, .motion-transition-demo__check input { cursor: pointer; }
.motion-transition-demo__check { display: flex; align-items: center; gap: 6px; min-height: 32px; }
.motion-transition-demo__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.motion-transition-demo h4 { margin: 0; font-size: 16px; font-weight: 600; }
.motion-transition-demo__content { min-height: 160px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding: 16px; border-radius: 8px; background: var(--tx-fill-color-light, #f5f7fa); color: var(--tx-text-color-primary, #303133); }
.motion-transition-demo__content--alternate { background: var(--tx-color-primary-light-9, #ecf5ff); }
.motion-transition-demo__content--dialog { min-height: 260px; }
.motion-transition-demo__content p { margin: 0; line-height: 1.6; }
.motion-transition-demo__content span, .motion-transition-demo__result, .motion-transition-demo__card-footer > span { font-size: 13px; color: var(--tx-text-color-regular, #606266); }
.motion-transition-demo__note, .motion-transition-demo__result { margin: 0; line-height: 1.6; }
.motion-transition-demo__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 16px; }
.motion-transition-demo__card-footer { display: grid; gap: 8px; }
</style>
