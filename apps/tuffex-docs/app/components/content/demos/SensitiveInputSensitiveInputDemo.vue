<script setup lang="ts">
import type { SensitiveInputLabels } from '@talex-touch/tuffex/sensitive-input'
import { TxSensitiveInput } from '@talex-touch/tuffex/sensitive-input'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const apiKey = ref('sk_live_a1b2c3d4e5f6g7h8')
const invalidKey = ref('sk_test_expired')
const lastCopied = ref<string | null>(null)

const copy = computed(() => zh.value
  ? {
      key: 'API Key',
      readonly: '只读密钥',
      invalid: '校验失败',
      description: '保管好这个值，不要分享给别人。',
      error: '这个 API Key 无效。',
      copied: '已复制到剪贴板',
      hint: '悬停或聚焦时掩码会变成提示文案；点击或按回车揭示，失焦自动重新掩码，Esc 也可以。',
    }
  : {
      key: 'API Key',
      readonly: 'Read-only key',
      invalid: 'Validation failed',
      description: 'Keep this value secure and do not share it.',
      error: 'This API key is not valid.',
      copied: 'Copied to clipboard',
      hint: 'The mask turns into a prompt on hover or focus. Click or press Enter to reveal; blur re-masks, and so does Escape.',
    })

// TuffEx primitives carry no message catalog, so the page localizes the
// component's own strings the same way it localizes its own copy.
const labels = computed<Partial<SensitiveInputLabels>>(() => zh.value
  ? {
      reveal: '点击查看',
      copy: '复制',
      copied: '已复制',
      hide: '隐藏值',
      show: '显示值',
      hidden: '值已隐藏',
      masked: '已遮蔽。',
      copySuccess: '已复制到剪贴板',
      instruction: '点击或按回车查看。',
      fallbackName: '敏感值',
    }
  : {})

function onCopy(value: string): void {
  lastCopied.value = `${value.slice(0, 7)}…`
}
</script>

<template>
  <div class="sensitive-demo">
    <TxSensitiveInput
      v-model="apiKey"
      :label="copy.key"
      :description="copy.description"
      :labels="labels"
      @copy="onCopy"
    />

    <TxSensitiveInput
      v-model="invalidKey"
      :label="copy.invalid"
      :error="copy.error"
      :labels="labels"
    />

    <TxSensitiveInput
      model-value="view-only-secret-key"
      :label="copy.readonly"
      :labels="labels"
      readonly
    />

    <p v-if="lastCopied" class="sensitive-demo__note">
      {{ copy.copied }}: <code>{{ lastCopied }}</code>
    </p>
    <p class="sensitive-demo__hint">
      {{ copy.hint }}
    </p>
  </div>
</template>

<style scoped>
.sensitive-demo {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  max-width: 340px;
}

.sensitive-demo__hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--tx-text-color-secondary, #909399);
}

.sensitive-demo__note {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.sensitive-demo__note code {
  font-variant-numeric: tabular-nums;
}
</style>
