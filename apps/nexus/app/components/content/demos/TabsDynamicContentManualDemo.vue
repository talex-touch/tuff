<script setup lang="ts">
import { computed, ref } from 'vue'
const { locale } = useI18n()
const active = ref('Overview')
const expanded = ref(false)
const count = ref(3)
const query = ref('')
const items = computed(() => Array.from({ length: count.value }, (_, index) => `Item ${index + 1}`))
const increment = () => {
  count.value += 1
}
const decrement = () => {
  if (count.value > 0)
    count.value -= 1
}
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: grid; gap: 10px; min-height: 120px; max-width: 100%;">
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <TxButton size="small" @click="expanded = !expanded">
            Toggle details
          </TxButton>
          <TxButton size="small" :disabled="count <= 0" @click="decrement">
            - Item
          </TxButton>
          <TxButton size="small" @click="increment">
            + Item
          </TxButton>
        </div>

        <TxTabs
          v-model="active"
          placement="left"
          :content-scrollable="false"
          auto-width
          :animation="{ size: { enabled: true, durationMs: 260, easing: 'ease' } }"
        >
          <TxTabItem name="Overview" activation icon-class="i-carbon-dashboard">
            <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="12">
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="font-weight: 650;">
                  Overview
                </div>
                <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                  This tab is intentionally compact.
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <div style="font-size: 12px;">
                    Search
                  </div>
                  <div style="width: 220px; max-width: 100%;">
                    <TxSearchInput v-model="query" placeholder="Try typing..." />
                  </div>
                </div>
              </div>
            </TxCard>
          </TxTabItem>

          <TxTabItem name="Details" icon-class="i-carbon-list">
            <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="12">
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                  <div style="font-weight: 650;">
                    Details
                  </div>
                  <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                    Items: {{ items.length }}
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
                  <div
                    v-for="it in items"
                    :key="it"
                    style="border-radius: 12px; padding: 10px; border: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 65%, transparent);"
                  >
                    <div style="font-weight: 600;">
                      {{ it }}
                    </div>
                    <div style="margin-top: 4px; font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                      Dynamic grid cell
                    </div>
                  </div>
                </div>

                <div v-if="expanded" style="display: flex; flex-direction: column; gap: 6px;">
                  <div style="font-weight: 600;">
                    Expanded block
                  </div>
                  <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                    This area appears/disappears and should trigger AutoSizer refresh.
                  </div>
                  <div
                    style="height: 110px; border-radius: 12px; background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);"
                  />
                </div>
              </div>
            </TxCard>
          </TxTabItem>

          <TxTabItem name="Form" icon-class="i-carbon-settings">
            <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="12">
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="font-weight: 650;">
                  Form
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">
                  <TxSearchInput v-model="query" placeholder="Field A" />
                  <TxSearchInput v-model="query" placeholder="Field B" />
                </div>

                <div
                  style="height: 160px; border-radius: 12px; background: color-mix(in srgb, var(--tx-color-success, #67c23a) 10%, transparent);"
                />
              </div>
            </TxCard>
          </TxTabItem>
        </TxTabs>
      </div>
  </div>
  <div v-else>
      <div style="display: grid; gap: 10px; min-height: 120px; max-width: 100%;">
        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <TxButton size="small" @click="expanded = !expanded">
            Toggle details
          </TxButton>
          <TxButton size="small" :disabled="count <= 0" @click="decrement">
            - Item
          </TxButton>
          <TxButton size="small" @click="increment">
            + Item
          </TxButton>
        </div>

        <TxTabs
          v-model="active"
          placement="left"
          :content-scrollable="false"
          auto-width
          :animation="{ size: { enabled: true, durationMs: 260, easing: 'ease' } }"
        >
          <TxTabItem name="Overview" activation icon-class="i-carbon-dashboard">
            <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="12">
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="font-weight: 650;">
                  Overview
                </div>
                <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                  This tab is intentionally compact.
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                  <div style="font-size: 12px;">
                    Search
                  </div>
                  <div style="width: 220px; max-width: 100%;">
                    <TxSearchInput v-model="query" placeholder="Try typing..." />
                  </div>
                </div>
              </div>
            </TxCard>
          </TxTabItem>

          <TxTabItem name="Details" icon-class="i-carbon-list">
            <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="12">
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                  <div style="font-weight: 650;">
                    Details
                  </div>
                  <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                    Items: {{ items.length }}
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
                  <div
                    v-for="it in items"
                    :key="it"
                    style="border-radius: 12px; padding: 10px; border: 1px solid color-mix(in srgb, var(--tx-border-color, #dcdfe6) 65%, transparent);"
                  >
                    <div style="font-weight: 600;">
                      {{ it }}
                    </div>
                    <div style="margin-top: 4px; font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                      Dynamic grid cell
                    </div>
                  </div>
                </div>

                <div v-if="expanded" style="display: flex; flex-direction: column; gap: 6px;">
                  <div style="font-weight: 600;">
                    Expanded block
                  </div>
                  <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                    This area appears/disappears and should trigger AutoSizer refresh.
                  </div>
                  <div
                    style="height: 110px; border-radius: 12px; background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);"
                  />
                </div>
              </div>
            </TxCard>
          </TxTabItem>

          <TxTabItem name="Form" icon-class="i-carbon-settings">
            <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="12">
              <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="font-weight: 650;">
                  Form
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;">
                  <TxSearchInput v-model="query" placeholder="Field A" />
                  <TxSearchInput v-model="query" placeholder="Field B" />
                </div>

                <div
                  style="height: 160px; border-radius: 12px; background: color-mix(in srgb, var(--tx-color-success, #67c23a) 10%, transparent);"
                />
              </div>
            </TxCard>
          </TxTabItem>
        </TxTabs>
      </div>
  </div>
</template>
