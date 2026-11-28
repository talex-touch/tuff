<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const variant = ref<'corners' | 'rim' | 'aurora'>('corners')
const open = ref(false)

const copy = computed(() => zh.value
  ? { trigger: '项目操作', newChat: '新建对话', openIn: '在本机代理中打开', rename: '重命名', archive: '归档', off: '设置中已关闭' }
  : { trigger: 'Project actions', newChat: 'New chat', openIn: 'Open in local agent', rename: 'Rename', archive: 'Archive', off: 'Turned off' })
</script>

<template>
  <div class="flow-light-menu-demo not-prose">
    <TxFlatRadio v-model="variant" size="sm">
      <TxFlatRadioItem value="corners" label="corners" />
      <TxFlatRadioItem value="rim" label="rim" />
      <TxFlatRadioItem value="aurora" label="aurora" />
    </TxFlatRadio>

    <!-- The submenu names no flow light of its own, so it takes the menu's. -->
    <TxDropdownMenu v-model="open" placement="bottom-start" :panel-card="{ flowLight: variant }">
      <template #trigger>
        <TxButton variant="secondary">
          {{ copy.trigger }}
        </TxButton>
      </template>
      <TxDropdownItem>{{ copy.newChat }}</TxDropdownItem>
      <TxDropdownSubmenu :min-width="180">
        {{ copy.openIn }}
        <template #menu>
          <TxDropdownItem disabled>
            Pi
            <template #right>
              {{ copy.off }}
            </template>
          </TxDropdownItem>
          <TxDropdownItem>OMP</TxDropdownItem>
        </template>
      </TxDropdownSubmenu>
      <TxDropdownItem>{{ copy.rename }}</TxDropdownItem>
      <TxDropdownItem>{{ copy.archive }}</TxDropdownItem>
    </TxDropdownMenu>
  </div>
</template>

<style scoped>
.flow-light-menu-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  min-height: 72px;
}
</style>
