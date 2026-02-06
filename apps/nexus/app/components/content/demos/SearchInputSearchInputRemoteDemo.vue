<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const h = ref('')
const hits = ref('')
const loading = ref(false)
const open = ref(false)
const value = ref('')
const onSearch = () => {}
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="width: 320px;">
        <TxPopover v-model="open" :offset="6" :close-on-click-outside="true" :reference-full-width="true">
          <template #reference>
            <TxSearchInput
              v-model="value"
              remote
              :search-debounce="250"
              placeholder="Type to remote-search"
              @focus="open = true"
              @search="onSearch"
            />
          </template>

          <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="10">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                <span v-if="loading">Loading...</span>
                <span v-else>Hits: {{ hits.length }}</span>
              </div>

              <div style="display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow: auto;">
                <button
                  v-for="hitItem in hits"
                  :key="hitItem"
                  type="button"
                  style="text-align: left; padding: 8px 10px; border-radius: 12px; border: 1px solid transparent; background: transparent; cursor: pointer;"
                  @click="onPick(hitItem)"
                >
                  {{ hitItem }}
                </button>

                <div v-if="!loading && value.trim() && !hits.length" style="color: var(--tx-text-color-secondary, #909399); font-size: 12px; padding: 6px 2px;">
                  No results
                </div>
              </div>
            </div>
          </TxCard>
        </TxPopover>
      </div>
  </div>
  <div v-else>
      <div style="width: 320px;">
        <TxPopover v-model="open" :offset="6" :close-on-click-outside="true" :reference-full-width="true">
          <template #reference>
            <TxSearchInput
              v-model="value"
              remote
              :search-debounce="250"
              placeholder="Type to remote-search"
              @focus="open = true"
              @search="onSearch"
            />
          </template>

          <TxCard variant="solid" background="glass" shadow="soft" :radius="18" :padding="10">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="font-size: 12px; color: var(--tx-text-color-secondary, #909399);">
                <span v-if="loading">Loading...</span>
                <span v-else>Hits: {{ hits.length }}</span>
              </div>

              <div style="display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow: auto;">
                <button
                  v-for="hitItem in hits"
                  :key="hitItem"
                  type="button"
                  style="text-align: left; padding: 8px 10px; border-radius: 12px; border: 1px solid transparent; background: transparent; cursor: pointer;"
                  @click="onPick(hitItem)"
                >
                  {{ hitItem }}
                </button>

                <div v-if="!loading && value.trim() && !hits.length" style="color: var(--tx-text-color-secondary, #909399); font-size: 12px; padding: 6px 2px;">
                  No results
                </div>
              </div>
            </div>
          </TxCard>
        </TxPopover>
      </div>
  </div>
</template>
