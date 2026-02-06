<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const cascaderOptions = ref([])
const cascaderValue = ref('')
const open = ref(false)
const selectValue = ref('')
const treeNodes = ref('')
const treeValue = ref('')
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 14px; width: 520px; max-width: 100%;">
        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <TxPopover
            v-model="open"
            :offset="8"
            :reference-full-width="false"
            panel-variant="solid"
            panel-background="glass"
            panel-shadow="soft"
            :panel-radius="18"
            :panel-padding="10"
          >
            <template #reference>
              <TxButton variant="primary">
                Popover panel
              </TxButton>
            </template>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                Popover panel uses TxCard
              </div>
              <TxButton size="small" @click="open = false">
                Close
              </TxButton>
            </div>
          </TxPopover>

          <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
            panelVariant/panelBackground/panelShadow/panelRadius/panelPadding
          </div>
        </div>

        <TxSearchSelect
          v-model="value"
          placeholder="Search..."
          :options="[
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
            { value: 'g', label: 'Gamma' },
          ]"
          panel-variant="solid"
          panel-background="glass"
          panel-shadow="soft"
          :panel-radius="18"
          :panel-padding="6"
        />

        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
          <TuffSelect v-model="selectValue" placeholder="Select">
            <TuffSelectItem value="option1" label="Option 1" />
            <TuffSelectItem value="option2" label="Option 2" />
            <TuffSelectItem value="option3" label="Option 3" />
          </TuffSelect>

          <TxCascader v-model="cascaderValue" :options="cascaderOptions" placeholder="Cascader" />
        </div>

        <TxTreeSelect v-model="treeValue" :nodes="treeNodes" placeholder="TreeSelect" />
      </div>
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 14px; width: 520px; max-width: 100%;">
        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <TxPopover
            v-model="open"
            :offset="8"
            :reference-full-width="false"
            panel-variant="solid"
            panel-background="glass"
            panel-shadow="soft"
            :panel-radius="18"
            :panel-padding="10"
          >
            <template #reference>
              <TxButton variant="primary">
                Popover panel
              </TxButton>
            </template>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                Popover panel uses TxCard
              </div>
              <TxButton size="small" @click="open = false">
                Close
              </TxButton>
            </div>
          </TxPopover>

          <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
            panelVariant/panelBackground/panelShadow/panelRadius/panelPadding
          </div>
        </div>

        <TxSearchSelect
          v-model="value"
          placeholder="Search..."
          :options="[
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
            { value: 'g', label: 'Gamma' },
          ]"
          panel-variant="solid"
          panel-background="glass"
          panel-shadow="soft"
          :panel-radius="18"
          :panel-padding="6"
        />

        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
          <TuffSelect v-model="selectValue" placeholder="Select">
            <TuffSelectItem value="option1" label="Option 1" />
            <TuffSelectItem value="option2" label="Option 2" />
            <TuffSelectItem value="option3" label="Option 3" />
          </TuffSelect>

          <TxCascader v-model="cascaderValue" :options="cascaderOptions" placeholder="Cascader" />
        </div>

        <TxTreeSelect v-model="treeValue" :nodes="treeNodes" placeholder="TreeSelect" />
      </div>
  </div>
</template>
