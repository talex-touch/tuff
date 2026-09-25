<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const draft = ref('')
const unrestricted = ref(false)

const copy = computed(() => zh.value
  ? {
      placeholder: '输入消息…',
      send: '发送',
      ask: '请求批准',
      free: '无限制访问',
    }
  : {
      placeholder: 'Start by typing…',
      send: 'Send',
      ask: 'Request approval',
      free: 'Unrestricted access',
    })
</script>

<template>
  <div class="composer-chip-demo">
    <TxChatComposer
      v-model="draft"
      :placeholder="copy.placeholder"
      :min-rows="2"
      :send-button-text="copy.send"
    >
      <template #toolbar-left>
        <TxModeChip
          :icon="unrestricted ? 'i-carbon-unlocked' : 'i-carbon-touch-1'"
          :label="unrestricted ? copy.free : copy.ask"
          :tone="unrestricted ? 'danger' : 'muted'"
          @click="unrestricted = !unrestricted"
        />
      </template>
    </TxChatComposer>
  </div>
</template>

<style scoped>
.composer-chip-demo {
  max-width: 520px;
}
</style>
