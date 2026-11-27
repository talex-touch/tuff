<script setup lang="ts">
import { computed, ref } from 'vue'

type Manager = 'pnpm' | 'npm' | 'yarn' | 'bun'

const { locale } = useI18n()
const PACKAGE = '@talex-touch/tuffex'
const MANAGERS: Manager[] = ['pnpm', 'npm', 'yarn', 'bun']
const COMMANDS: Record<Manager, string> = {
  pnpm: `pnpm add ${PACKAGE}`,
  npm: `npm install ${PACKAGE}`,
  yarn: `yarn add ${PACKAGE}`,
  bun: `bun add ${PACKAGE}`,
}

const manager = ref<Manager>('pnpm')
const command = computed(() => COMMANDS[manager.value])

const labels = computed(() => (locale.value === 'zh'
  ? {
      copy: '复制安装命令',
      copied: '已复制',
      failed: '复制失败',
      manager: '包管理器',
    }
  : {
      copy: 'Copy install command',
      copied: 'Copied',
      failed: 'Copy failed',
      manager: 'Package manager',
    }))
</script>

<template>
  <div class="copy-demo not-prose">
    <div class="copy-demo__snippet">
      <div class="copy-demo__head">
        <TxFlatRadio v-model="manager" size="sm" :aria-label="labels.manager">
          <TxFlatRadioItem v-for="name in MANAGERS" :key="name" :value="name" :label="name" />
        </TxFlatRadio>
        <TxCopyButton
          icon-only
          :text="command"
          :copy-label="labels.copy"
          :copied-label="labels.copied"
          :failed-label="labels.failed"
        />
      </div>
      <div class="copy-demo__command">
        <span class="copy-demo__prompt" aria-hidden="true">$</span>
        <TxTextTransformer :text="command" />
      </div>
    </div>

    <div class="copy-demo__row">
      <code class="copy-demo__inline">{{ command }}</code>
      <TxCopyButton
        size="md"
        :text="command"
        :copy-label="labels.copy"
        :copied-label="labels.copied"
        :failed-label="labels.failed"
      />
    </div>
  </div>
</template>

<style scoped>
.copy-demo {
  display: grid;
  gap: 16px;
  width: 100%;
  max-width: 560px;
}

.copy-demo__snippet {
  border-radius: 14px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  overflow: hidden;
}

.copy-demo__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 6px 6px 8px;
  box-shadow: inset 0 -1px 0 var(--tx-border-color-lighter);
}

.copy-demo__command {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  font-family: var(--tx-font-mono, ui-monospace, monospace);
  font-size: 13px;
  color: var(--tx-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
}

.copy-demo__prompt {
  color: var(--tx-text-color-placeholder);
  user-select: none;
}

.copy-demo__row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.copy-demo__inline {
  flex: 1;
  min-width: 0;
  height: 34px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
  font-family: var(--tx-font-mono, ui-monospace, monospace);
  font-size: 13px;
  color: var(--tx-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
