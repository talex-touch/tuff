<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const draft = ref('')
const placement = ref<'top' | 'bottom'>('bottom')

const copy = computed(() => zh.value
  ? {
      placeholder: '输入消息…',
      send: '发送',
      attach: '添加附件',
      tray: '上下文',
      connect: '连接应用',
      project: '选择项目',
      hint: '点托盘里的按钮，托盘会换到另一侧。',
    }
  : {
      placeholder: 'Start by typing…',
      send: 'Send',
      attach: 'Attach',
      tray: 'Context',
      connect: 'Connect apps',
      project: 'Select a project',
      hint: 'Press the tray action to move the tray to the other side.',
    })

function flip(): void {
  placement.value = placement.value === 'bottom' ? 'top' : 'bottom'
}
</script>

<template>
  <div class="composer-tray-demo">
    <TxChatComposer
      v-model="draft"
      :placeholder="copy.placeholder"
      :min-rows="2"
      :send-button-text="copy.send"
      :attachment-button-text="copy.attach"
      show-attachment-button
      :tray-placement="placement"
      :tray-label="copy.tray"
    >
      <template #tray>
        <TxModeChip
          v-if="placement === 'bottom'"
          icon="i-carbon-plug"
          :label="copy.connect"
          @click="flip"
        />
        <TxModeChip
          v-else
          icon="i-carbon-folder"
          :label="copy.project"
          @click="flip"
        />
      </template>
    </TxChatComposer>
    <p class="composer-tray-demo__hint">
      {{ copy.hint }}
    </p>
  </div>
</template>

<style scoped>
.composer-tray-demo {
  display: grid;
  gap: 10px;
  max-width: 520px;
}

.composer-tray-demo__hint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #6b7280);
}
</style>
