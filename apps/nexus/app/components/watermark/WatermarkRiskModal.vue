<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import Modal from '~/components/ui/Modal.vue'
import { useTurnstileWidget } from '~/composables/useTurnstileWidget'
import { useWatermarkRisk } from '~/composables/useWatermarkRisk'
import { useWatermarkToken } from '~/composables/useWatermarkToken'

const { risk, clearRisk } = useWatermarkRisk()
const { refresh } = useWatermarkToken()
const { token, state, render, reset } = useTurnstileWidget()

const verifying = ref(false)
const verifyError = ref('')
const turnstileId = 'wm-turnstile-widget'

const active = computed(() => risk.value.active)
const title = computed(() => '风险验证')
const message = computed(() => {
  if (risk.value.code === 'WM_TAMPERED')
    return '当前存在风险，请完成验证继续。'
  if (risk.value.code === 'WM_EXPIRED')
    return '当前存在风险，请完成验证继续。'
  return '当前存在风险，请完成验证继续。'
})

async function verifyTurnstile(value: string) {
  verifying.value = true
  verifyError.value = ''
  try {
    await $fetch('/api/watermark/turnstile/verify', {
      method: 'POST',
      body: {
        token: value,
        risk_code: risk.value.code,
        detail: risk.value.detail,
      },
    })
    clearRisk()
    await refresh()
    reset()
  }
  catch (error: any) {
    verifyError.value = error?.data?.statusMessage || error?.message || '验证失败，请重试。'
  }
  finally {
    verifying.value = false
  }
}

watch(active, async (value) => {
  if (!value) {
    reset()
    return
  }
  await nextTick()
  await render(`#${turnstileId}`, 'watermark')
})

watch(token, (value) => {
  if (!value || !active.value)
    return
  void verifyTurnstile(value)
})
</script>

<template>
  <Modal :model-value="active" :title="title" width="460px" @update:model-value="() => {}">
    <div class="wm-risk">
      <p class="wm-risk__message">
        {{ message }}
      </p>
      <div class="wm-risk__turnstile">
        <div :id="turnstileId" class="wm-risk__turnstile-slot" />
        <div v-if="state === 'loading'" class="wm-risk__turnstile-hint">
正在加载验证…
</div>
        <div v-else-if="state === 'error'" class="wm-risk__turnstile-hint">
验证加载失败，请刷新重试。
</div>
      </div>
      <p v-if="verifying" class="wm-risk__status">
验证中…
</p>
      <p v-if="verifyError" class="wm-risk__error">
{{ verifyError }}
</p>
    </div>
  </Modal>
</template>

<style scoped>
.wm-risk {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wm-risk__message {
  margin: 0;
  font-size: 14px;
  color: rgba(15, 23, 42, 0.78);
}

.wm-risk__turnstile {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wm-risk__turnstile-slot {
  min-height: 78px;
}

.wm-risk__turnstile-hint {
  font-size: 12px;
  color: rgba(15, 23, 42, 0.6);
}

.wm-risk__status {
  margin: 0;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.65);
}

.wm-risk__error {
  margin: 0;
  font-size: 12px;
  color: #dc2626;
}

:deep(.tx-modal__close) {
  display: none;
}
</style>
