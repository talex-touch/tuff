<script setup lang="ts">
import { hasNavigator } from '@talex-touch/utils/env'
import { computed, ref } from 'vue'

const { locale } = useI18n()

const peeled = ref(false)
const progress = ref(0.12)
const corner = ref<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('bottom-right')
const trigger = ref<'hover-drag' | 'hover' | 'click'>('hover-drag')
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | undefined

const copy = computed(() => (locale.value === 'zh'
  ? {
      cornerLabel: '折角位置',
      triggerLabel: '触发方式',
      peelAction: '掀起折角',
      flattenAction: '展平页面',
      frontBadge: 'DRAFT #204',
      frontTitle: 'Tuff 快捷键与命令行配置',
      frontDesc: '悬停预览边角卷起，斜向拖拽或点击卡片即可掀起并操作底层密钥卡片。',
      frontHint: '试试从任意角斜向往内拉开',
      underKicker: '底层令牌 · SECRET KEY',
      underTitle: '已解锁底层签名凭证',
      underCode: 'tx_live_98f4c1a7_fold_preview',
      copyLabel: copied.value ? '已复制' : '复制密钥',
      corners: [
        { value: 'top-left', label: '左上' },
        { value: 'top-right', label: '右上' },
        { value: 'bottom-left', label: '左下' },
        { value: 'bottom-right', label: '右下' },
      ],
      triggers: [
        { value: 'hover-drag', label: '悬停 + 拖拽' },
        { value: 'hover', label: '仅悬停' },
        { value: 'click', label: '点击切换' },
      ],
    }
  : {
      cornerLabel: 'Corner',
      triggerLabel: 'Trigger',
      peelAction: 'Peel corner',
      flattenAction: 'Flatten',
      frontBadge: 'DRAFT #204',
      frontTitle: 'Tuff Workspace Manifest',
      frontDesc: 'Hover to curl the corner, or drag diagonally across the sheet to reveal the underlying token.',
      frontHint: 'Pull inward from the active corner',
      underKicker: 'UNDERLAY · SECRET KEY',
      underTitle: 'Signing Token Unlocked',
      underCode: 'tx_live_98f4c1a7_fold_preview',
      copyLabel: copied.value ? 'Copied' : 'Copy key',
      corners: [
        { value: 'top-left', label: 'Top Left' },
        { value: 'top-right', label: 'Top Right' },
        { value: 'bottom-left', label: 'Bottom Left' },
        { value: 'bottom-right', label: 'Bottom Right' },
      ],
      triggers: [
        { value: 'hover-drag', label: 'Hover + Drag' },
        { value: 'hover', label: 'Hover' },
        { value: 'click', label: 'Click' },
      ],
    }))

async function handleCopy() {
  if (!hasNavigator() || !navigator.clipboard?.writeText)
    return
  try {
    await navigator.clipboard.writeText(copy.value.underCode)
  }
  catch {
    return
  }
  copied.value = true
  if (copyTimer)
    clearTimeout(copyTimer)
  copyTimer = setTimeout(() => {
    copied.value = false
  }, 1500)
}

onBeforeUnmount(() => {
  if (copyTimer)
    clearTimeout(copyTimer)
})
</script>

<template>
  <div class="not-prose fold-corner-demo">
    <div class="fold-corner-demo__toolbar">
      <div class="fold-corner-demo__group">
        <span class="fold-corner-demo__label">{{ copy.cornerLabel }}</span>
        <TxFlatRadio v-model="corner" size="sm">
          <TxFlatRadioItem v-for="opt in copy.corners" :key="opt.value" :value="opt.value" :label="opt.label" />
        </TxFlatRadio>
      </div>
      <div class="fold-corner-demo__group">
        <span class="fold-corner-demo__label">{{ copy.triggerLabel }}</span>
        <TxFlatRadio v-model="trigger" size="sm">
          <TxFlatRadioItem v-for="opt in copy.triggers" :key="opt.value" :value="opt.value" :label="opt.label" />
        </TxFlatRadio>
      </div>
      <TxButton size="sm" @click="peeled = !peeled">
        {{ peeled ? copy.flattenAction : copy.peelAction }}
      </TxButton>
    </div>

    <div class="fold-corner-demo__stage">
      <TxFoldCorner
        v-model="peeled"
        :corner="corner"
        :trigger="trigger"
        size="lg"
        @update:progress="progress = $event"
      >
        <template #default>
          <div class="fold-corner-demo__front">
            <div class="fold-corner-demo__head">
              <span class="fold-corner-demo__badge">{{ copy.frontBadge }}</span>
              <span class="fold-corner-demo__progress">{{ Math.round(progress * 100) }}%</span>
            </div>
            <p class="fold-corner-demo__title">
              {{ copy.frontTitle }}
            </p>
            <p class="fold-corner-demo__desc">
              {{ copy.frontDesc }}
            </p>
            <span class="fold-corner-demo__hint">
              <i class="i-carbon-touch-1" aria-hidden="true" />
              {{ copy.frontHint }}
            </span>
          </div>
        </template>

        <template #under>
          <div class="fold-corner-demo__under">
            <div class="fold-corner-demo__under-main">
              <div class="fold-corner-demo__under-head">
                <span class="fold-corner-demo__badge">{{ copy.underKicker }}</span>
                <span class="fold-corner-demo__seal" aria-hidden="true">VERIFIED</span>
              </div>
              <p class="fold-corner-demo__title">
                {{ copy.underTitle }}
              </p>
              <code class="fold-corner-demo__code">{{ copy.underCode }}</code>
              <div>
                <TxButton size="sm" variant="primary" @click="handleCopy">
                  {{ copy.copyLabel }}
                </TxButton>
              </div>
            </div>
          </div>
        </template>
      </TxFoldCorner>
    </div>
  </div>
</template>

<style scoped>
.fold-corner-demo {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fold-corner-demo__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
}

.fold-corner-demo__group {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.fold-corner-demo__label {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
  white-space: nowrap;
}

.fold-corner-demo__stage {
  padding: 18px;
  border-radius: 16px;
  background:
    radial-gradient(85% 80% at 85% 15%, color-mix(in srgb, var(--tx-color-primary) 16%, transparent), transparent 62%),
    var(--tx-fill-color-lighter);
}

.fold-corner-demo__front {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  height: 100%;
}

.fold-corner-demo__under {
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding-inline: clamp(48px, 18%, 116px);
  height: 100%;
  box-sizing: border-box;
}

.fold-corner-demo__under-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  max-width: 340px;
}

.fold-corner-demo__under-head {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}

.fold-corner-demo__seal {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--tx-color-success);
  background: var(--tx-color-success-light-9);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-color-success) 32%, transparent);
}

.fold-corner-demo__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fold-corner-demo__badge {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--tx-color-primary);
}

.fold-corner-demo__progress {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: var(--tx-text-color-secondary);
}

.fold-corner-demo__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.fold-corner-demo__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--tx-text-color-regular);
}

.fold-corner-demo__hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}

.fold-corner-demo__code {
  display: inline-block;
  width: fit-content;
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 12px;
  background: var(--tx-bg-color);
  color: var(--tx-text-color-primary);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-light);
}
</style>
