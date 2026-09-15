<script setup lang="ts">
import type { IconPickerShape } from '@talex-touch/tuffex/icon-picker'
import { TxIconPicker } from '@talex-touch/tuffex/icon-picker'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const identifier = ref('emoji:🚀')
const shape = ref<IconPickerShape>('rounded')

// `carbon` is one of the four collections this app installs. The picker's own catalog is
// `ri`/`simple`, which Nexus does not carry, so a class from there renders as an empty box —
// check-icon-collections is the gate that catches it.
const inlineIdentifier = ref('class:i-carbon-crop-growth')

const copy = computed(() => {
  if (locale.value === 'zh') {
    return {
      trigger: '触发器模式（带形状选择）',
      inline: '内联模式',
      stored: '存下来的值',
      note: '选中的图标始终是一个字符串，因此可以直接写进 JSON 配置或数据库字段。',
    }
  }

  return {
    trigger: 'Trigger mode, with the shape row',
    inline: 'Inline mode',
    stored: 'Stored value',
    note: 'A pick is always one string, so it drops straight into a JSON config or a database column.',
  }
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ copy.trigger }}</span>
      <div class="flex items-center gap-3">
        <TxIconPicker v-model="identifier" v-model:shape="shape" shape-selectable />
        <code class="text-xs text-[var(--tx-text-color-secondary)]">
          {{ identifier || '""' }} · {{ shape }}
        </code>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <span class="text-xs text-[var(--tx-text-color-secondary)]">{{ copy.inline }}</span>
      <TxIconPicker v-model="inlineIdentifier" inline :sections="['icon', 'brand']" />
      <code class="text-xs text-[var(--tx-text-color-secondary)]">
        {{ copy.stored }}: {{ inlineIdentifier || '""' }}
      </code>
    </div>

    <p class="text-xs text-[var(--tx-text-color-secondary)]">
      {{ copy.note }}
    </p>
  </div>
</template>
