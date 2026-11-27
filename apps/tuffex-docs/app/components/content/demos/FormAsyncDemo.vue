<script setup lang="ts">
import type { FormRules } from '@talex-touch/tuffex/form'
import { computed, reactive } from 'vue'

const { locale } = useI18n()
const TAKEN = ['admin', 'talex', 'tuff']

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      handle: '账号名',
      help: '试试 admin 或 talex',
      required: '请输入账号名',
      pattern: '只能使用小写字母、数字和连字符',
      taken: (name: string) => `${name} 已被占用`,
      validating: '正在检查…',
    }
  }

  return {
    handle: 'Handle',
    help: 'Try admin or talex',
    required: 'Enter a handle',
    pattern: 'Use lowercase letters, digits and hyphens',
    taken: (name: string) => `${name} is taken`,
    validating: 'Checking…',
  }
})

const messages = computed(() => ({ validating: labels.value.validating }))

const form = reactive({ handle: '' })

// Stands in for a request; the signal cancels it once the value moves on.
function lookup(name: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TAKEN.includes(name)), 1200)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

const rules = computed<FormRules>(() => ({
  handle: [
    { required: true, message: labels.value.required },
    { pattern: /^[a-z0-9-]+$/, message: labels.value.pattern },
    {
      async validator(value: string, _rule, _model, { signal }) {
        return !await lookup(value, signal) || labels.value.taken(value)
      },
    },
  ],
}))
</script>

<template>
  <div class="form-async-demo not-prose">
    <TxForm :model="form" :rules="rules" :messages="messages">
      <TxFormItem :label="labels.handle" prop="handle" :help="labels.help">
        <TuffInput v-model="form.handle" autocomplete="off" />
      </TxFormItem>
    </TxForm>
  </div>
</template>

<style scoped>
.form-async-demo {
  width: min(100%, 560px);
}
</style>
