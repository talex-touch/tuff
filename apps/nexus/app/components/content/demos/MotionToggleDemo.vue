<script setup lang="ts">
import type { MotionHapticResult } from '@talex-touch/tuffex/motion'
import type { MotionToggleValue, MotionToggleVariant } from '@talex-touch/tuffex/motion-toggle'
import { MOTION_TOGGLE_VARIANTS, TxMotionToggle } from '@talex-touch/tuffex/motion-toggle'
import { computed, reactive, ref, useId } from 'vue'
const { locale } = useI18n()
const panelId = `motion-toggle-${useId()}`
const copy = computed(() => locale.value === 'zh' ? {
  reset: '外部重置模型', disabled: '禁用操作', animated: '启用动画', haptics: '请求触觉反馈',
  filter: '筛选变体', all: '全部变体',
  on: '已开启', off: '已关闭', saved: '已收藏', save: '收藏', like: '喜欢', dislike: '不喜欢', repost: '转发', theme: '深色主题', lock: '解锁', check: '确认', period: '统计周期',
  periods: ['每日', '每周', '每月'], unsupported: '浏览器不支持 Vibration API', accepted: '浏览器接受请求；无法确认设备实际震动', rejected: '浏览器未接受请求',
  count: '调用方计数', model: '模型', action: '操作次数', sizes: '尺寸',
} : {
  reset: 'Reset models externally', disabled: 'Disable actions', animated: 'Enable animation', haptics: 'Request haptic feedback',
  filter: 'Filter variant', all: 'All variants',
  on: 'On', off: 'Off', saved: 'Saved', save: 'Bookmark', like: 'Like', dislike: 'Dislike', repost: 'Repost', theme: 'Dark theme', lock: 'Unlock', check: 'Confirm', period: 'Reporting period',
  periods: ['Daily', 'Weekly', 'Monthly'], unsupported: 'Vibration API unavailable', accepted: 'Browser accepted the request; physical vibration is not confirmed', rejected: 'Browser rejected the request',
  count: 'Caller-owned count', model: 'Model', action: 'Activations', sizes: 'Sizes',
})
const models = reactive(Object.fromEntries(MOTION_TOGGLE_VARIANTS.map(variant => [variant, variant === 't-pill' ? 'daily' : false])) as Record<MotionToggleVariant, MotionToggleValue>)
const counts = reactive<Record<string, number>>({ 't-like': 42, 't-repost': 18 })
const actions = ref(0)
const disabled = ref(false)
const animated = ref(true)
const haptic = ref(false)
const hapticMessage = ref('')
const size = ref<'xs' | 'sm' | 'md' | 'lg'>('md')
const filter = ref<'all' | MotionToggleVariant>('all')
const variants = computed(() => filter.value === 'all' ? MOTION_TOGGLE_VARIANTS : MOTION_TOGGLE_VARIANTS.filter(variant => variant === filter.value))
const options = computed(() => ['daily', 'weekly', 'monthly'].map((value, index) => ({ value, label: copy.value.periods[index]!, panelId: `${panelId}-${value}` })))
function label(variant: MotionToggleVariant) {
  const labels: Partial<Record<MotionToggleVariant, string>> = { 't-bookmark': copy.value.save, 't-like': copy.value.like, 't-dislike': copy.value.dislike, 't-repost': copy.value.repost, 't-theme': copy.value.theme, 't-morph': copy.value.lock, 't-check': copy.value.check, 't-pill': copy.value.period }
  return labels[variant] ?? `${variant} ${copy.value.model}`
}
function receiveHaptic(result: MotionHapticResult) { hapticMessage.value = !result.supported ? copy.value.unsupported : result.accepted ? copy.value.accepted : copy.value.rejected }
function reset() {
  for (const variant of MOTION_TOGGLE_VARIANTS) models[variant] = variant === 't-pill' ? 'daily' : false
  counts['t-like'] = 42
  counts['t-repost'] = 18
  actions.value = 0
}
</script>

<template>
  <div class="motion-toggle-demo not-prose">
    <div class="motion-toggle-demo__controls">
      <button type="button" @click="reset">
{{ copy.reset }}
</button>
      <label><input v-model="disabled" type="checkbox"> {{ copy.disabled }}</label>
      <label><input v-model="animated" type="checkbox"> {{ copy.animated }}</label>
      <label><input v-model="haptic" type="checkbox"> {{ copy.haptics }}</label>
      <label>{{ copy.sizes }} <select v-model="size"><option v-for="value in ['xs', 'sm', 'md', 'lg']" :key="value" :value="value">{{ value }}</option></select></label>
      <label>{{ copy.filter }} <select v-model="filter"><option value="all">{{ copy.all }}</option><option v-for="variant in MOTION_TOGGLE_VARIANTS" :key="variant" :value="variant">{{ variant }}</option></select></label>
    </div>
    <div class="motion-toggle-demo__grid">
      <section v-for="variant in variants" :key="variant" class="motion-toggle-demo__specimen" :data-theme="variant === 't-theme' && models[variant] === true ? 'dark' : undefined">
        <h3>{{ variant }}</h3>
        <TxMotionToggle v-model="models[variant]" :variant="variant" :size="size" :disabled="disabled" :enabled="animated" :label="label(variant)" :on-label="variant === 't-bookmark' ? copy.saved : copy.on" :off-label="variant === 't-bookmark' ? copy.save : copy.off" :options="options" :count="counts[variant]" :haptic="haptic ? 'light' : false" @update:count="value => counts[variant] = value" @activate="actions++" @haptic="receiveHaptic" />
        <output>{{ copy.model }}: {{ models[variant] }}<template v-if="counts[variant] !== undefined"> · {{ copy.count }}: {{ counts[variant] }}</template></output>
        <template v-if="variant === 't-pill'">
<div v-for="option in options" v-show="models[variant] === option.value" :id="option.panelId" :key="option.value" role="tabpanel" :aria-label="option.label">
{{ option.label }}
</div>
</template>
      </section>
    </div>
    <output>{{ copy.action }}: {{ actions }}</output>
    <p v-if="hapticMessage" role="status">
{{ hapticMessage }}
</p>
  </div>
</template>

<style scoped>
.motion-toggle-demo { display: grid; gap: 16px; font-size: 14px; color: var(--tx-text-color-primary); }
.motion-toggle-demo__controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.motion-toggle-demo__controls button, .motion-toggle-demo__controls select { appearance: none; border: 0; border-radius: 8px; background: var(--tx-fill-color-light); color: var(--tx-text-color-primary); padding: 7px 12px; box-shadow: inset 0 0 0 1px var(--tx-border-color); font: inherit; cursor: pointer; }
.motion-toggle-demo__controls button:focus-visible, .motion-toggle-demo__controls select:focus-visible { outline: 2px solid var(--tx-color-primary); outline-offset: 3px; }
.motion-toggle-demo__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 12px; }
.motion-toggle-demo__specimen { display: grid; gap: 14px; align-content: start; padding: 16px; border-radius: 12px; background: var(--tx-bg-color); color: var(--tx-text-color-primary); box-shadow: inset 0 0 0 1px var(--tx-border-color); }
.motion-toggle-demo h3 { margin: 0; font-size: 14px; font-weight: 600; }
.motion-toggle-demo output { color: var(--tx-text-color-regular); font-size: 13px; overflow-wrap: anywhere; }
.motion-toggle-demo p { margin: 0; color: var(--tx-text-color-regular); }
</style>
