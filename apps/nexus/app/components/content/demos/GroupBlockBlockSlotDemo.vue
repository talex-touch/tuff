<script setup lang="ts">
import { TxBlockSlot, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { TuffSelectItem, TxSelect } from '@talex-touch/tuffex/select'
import { computed, ref } from 'vue'

const { locale } = useI18n()
const theme = ref<'light' | 'dark' | 'auto'>('auto')

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '外观设置',
      description: '自定义控件插槽',
      theme: '主题',
      themeDesc: '选择界面外观',
      placeholder: '选择主题',
      light: '浅色',
      dark: '深色',
      auto: '跟随系统',
    }
  : {
      title: 'Appearance',
      description: 'Custom control slot',
      theme: 'Theme',
      themeDesc: 'Choose the interface appearance',
      placeholder: 'Select theme',
      light: 'Light',
      dark: 'Dark',
      auto: 'System',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-palette-line"
      active-icon="i-ri-palette-fill"
      :collapsible="false"
    >
      <TxBlockSlot
        :title="labels.theme"
        :description="labels.themeDesc"
        default-icon="i-carbon-color-palette"
      >
        <TxSelect v-model="theme" :placeholder="labels.placeholder" class="group-block-showcase__select">
          <TuffSelectItem value="light" :label="labels.light" />
          <TuffSelectItem value="dark" :label="labels.dark" />
          <TuffSelectItem value="auto" :label="labels.auto" />
        </TxSelect>
      </TxBlockSlot>
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}

.group-block-showcase__select {
  width: 180px;
}
</style>
