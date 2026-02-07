<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const { locale } = useI18n()

const active = ref('')
const expanded = ref(false)
const count = ref(3)
const query = ref('')

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      toggleDetails: '切换详情',
      removeItem: '- 条目',
      addItem: '+ 条目',
      overviewTab: '概览',
      detailsTab: '详情',
      formTab: '表单',
      overviewTitle: '概览',
      overviewDesc: '这个标签页故意保持紧凑。',
      searchLabel: '搜索',
      searchPlaceholder: '试着输入...',
      detailsTitle: '详情',
      itemsCount: '条目数',
      cellDescription: '动态网格单元',
      expandedTitle: '展开区块',
      expandedDesc: '这个区域出现/消失时会触发 AutoSizer 刷新。',
      formTitle: '表单',
      fieldA: '字段 A',
      fieldB: '字段 B',
    }
  }

  return {
    toggleDetails: 'Toggle details',
    removeItem: '- Item',
    addItem: '+ Item',
    overviewTab: 'Overview',
    detailsTab: 'Details',
    formTab: 'Form',
    overviewTitle: 'Overview',
    overviewDesc: 'This tab is intentionally compact.',
    searchLabel: 'Search',
    searchPlaceholder: 'Try typing...',
    detailsTitle: 'Details',
    itemsCount: 'Items',
    cellDescription: 'Dynamic grid cell',
    expandedTitle: 'Expanded block',
    expandedDesc: 'This area appears/disappears and should trigger AutoSizer refresh.',
    formTitle: 'Form',
    fieldA: 'Field A',
    fieldB: 'Field B',
  }
})

const items = computed(() => {
  return Array.from({ length: count.value }, (_, index) => {
    const number = index + 1
    return locale.value === 'zh' ? `条目 ${number}` : `Item ${number}`
  })
})

watch(
  () => locale.value,
  () => {
    active.value = labels.value.overviewTab
  },
  { immediate: true },
)

function increment() {
  count.value += 1
}

function decrement() {
  if (count.value > 0)
    count.value -= 1
}
</script>

<template>
  <div style="display: grid; gap: 10px; min-height: 120px; max-width: 100%;">
    <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
      <TxButton size="small" @click="expanded = !expanded">
        {{ labels.toggleDetails }}
      </TxButton>
      <TxButton size="small" :disabled="count <= 0" @click="decrement">
        {{ labels.removeItem }}
      </TxButton>
      <TxButton size="small" @click="increment">
        {{ labels.addItem }}
      </TxButton>
    </div>

    <TxTabs
      v-model="active"
      placement="left"
      :content-scrollable="false"
      auto-width
      :animation="{ size: { enabled: true, durationMs: 260, easing: 'ease' } }"
    >
      <TxTabItem :name="labels.overviewTab" activation icon-class="i-carbon-dashboard">
        <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="12">
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="font-weight: 650;">
              {{ labels.overviewTitle }}
            </div>
            <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
              {{ labels.overviewDesc }}
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <div style="font-size: 12px;">
                {{ labels.searchLabel }}
              </div>
              <div style="width: 220px; max-width: 100%;">
                <TxSearchInput v-model="query" :placeholder="labels.searchPlaceholder" />
              </div>
            </div>
          </div>
        </TxCard>
      </TxTabItem>

      <TxTabItem :name="labels.detailsTab" icon-class="i-carbon-list">
        <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="12">
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <div style="font-weight: 650;">
                {{ labels.detailsTitle }}
              </div>
              <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                {{ labels.itemsCount }}: {{ items.length }}
              </div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
              <div
                v-for="item in items"
                :key="item"
                style="border-radius: 12px; padding: 10px; border: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 65%, transparent);"
              >
                <div style="font-weight: 600;">
                  {{ item }}
                </div>
                <div style="margin-top: 4px; font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                  {{ labels.cellDescription }}
                </div>
              </div>
            </div>

            <div v-if="expanded" style="display: flex; flex-direction: column; gap: 6px;">
              <div style="font-weight: 600;">
                {{ labels.expandedTitle }}
              </div>
              <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                {{ labels.expandedDesc }}
              </div>
              <div
                style="height: 110px; border-radius: 12px; background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);"
              />
            </div>
          </div>
        </TxCard>
      </TxTabItem>

      <TxTabItem :name="labels.formTab" icon-class="i-carbon-settings">
        <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="12">
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="font-weight: 650;">
              {{ labels.formTitle }}
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">
              <TxSearchInput v-model="query" :placeholder="labels.fieldA" />
              <TxSearchInput v-model="query" :placeholder="labels.fieldB" />
            </div>

            <div
              style="height: 160px; border-radius: 12px; background: color-mix(in srgb, var(--tx-color-success, #67c23a) 10%, transparent);"
            />
          </div>
        </TxCard>
      </TxTabItem>
    </TxTabs>
  </div>
</template>
