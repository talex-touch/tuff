<script lang="ts" name="HomeSidePluginsPane" setup>
import type { ITouchPlugin } from '@talex-touch/utils'
import { PluginStatus } from '@talex-touch/utils'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSkeleton } from '@talex-touch/tuffex/skeleton'
import { isElectronRenderer } from '@talex-touch/utils/env'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createPluginSdk } from '@talex-touch/utils/transport/sdk/domains/plugin'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import HomePreviewEmpty from './HomePreviewEmpty.vue'

const { t } = useI18n()
const router = useRouter()
const transport = isElectronRenderer() ? useTuffTransport() : null
const pluginSdk = transport ? createPluginSdk(transport) : null

const plugins = ref<ITouchPlugin[]>([])
const loading = ref(false)
const query = ref('')

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return plugins.value
  return plugins.value.filter(
    (plugin) =>
      plugin.name.toLowerCase().includes(q) || (plugin.desc ?? '').toLowerCase().includes(q)
  )
})

function isActiveStatus(status: PluginStatus): boolean {
  return status === PluginStatus.ACTIVE || status === PluginStatus.ENABLED
}

async function refresh(): Promise<void> {
  if (!pluginSdk) return
  loading.value = true
  try {
    plugins.value = await pluginSdk.list()
  } catch {
    plugins.value = []
  } finally {
    loading.value = false
  }
}

async function openPluginStore(): Promise<void> {
  await router.push('/store').catch(() => {})
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="HomeSidePluginsPane">
    <div class="HomeSidePluginsPane-Top">
      <label class="HomeSidePluginsPane-Search">
        <span class="i-ri-search-line HomeSidePluginsPane-SearchIcon" aria-hidden="true" />
        <input
          v-model="query"
          type="text"
          class="HomeSidePluginsPane-Input"
          :placeholder="t('home.sidePanel.filterPlugins')"
          :aria-label="t('home.sidePanel.filterPlugins')"
        />
      </label>
      <TxButton size="sm" variant="secondary" @click="openPluginStore">
        {{ t('shell.store') }}
      </TxButton>
    </div>

    <div class="HomeSidePluginsPane-List">
      <div v-if="loading && !plugins.length" class="HomeSidePluginsPane-Loading" aria-hidden="true">
        <TxSkeleton :rows="5" animated />
      </div>

      <HomePreviewEmpty
        v-else-if="!filtered.length"
        icon="i-ri-puzzle-line"
        :text="t('home.sidePanel.pluginsEmpty')"
      />

      <div v-for="plugin in filtered" :key="plugin.name" class="HomeSidePluginsPane-Row">
        <span class="i-ri-puzzle-line HomeSidePluginsPane-Icon" aria-hidden="true" />
        <div class="HomeSidePluginsPane-Info">
          <div class="HomeSidePluginsPane-NameRow">
            <span class="HomePreview-Name">{{ plugin.name }}</span>
            <span
              class="HomeSidePluginsPane-Status"
              :class="{ 'is-active': isActiveStatus(plugin.status) }"
            >
              {{
                isActiveStatus(plugin.status)
                  ? t('home.sidePanel.enabled')
                  : t('home.sidePanel.disabled')
              }}
            </span>
          </div>
          <span v-if="plugin.desc" class="HomePreview-Detail" :title="plugin.desc">
            {{ plugin.desc }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomeSidePluginsPane {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.HomeSidePluginsPane-Top {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid var(--shell-border);
}

.HomeSidePluginsPane-Search {
  display: flex;
  flex: 1 1 auto;
  gap: 6px;
  align-items: center;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--shell-surface);
  box-shadow: inset 0 0 0 1px var(--shell-border);

  &:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--shell-primary);
  }
}

.HomeSidePluginsPane-SearchIcon {
  flex: none;
  color: var(--shell-text-muted);
  font-size: 14px;
}

.HomeSidePluginsPane-Input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--shell-text-primary);
  font: inherit;
  font-size: var(--shell-fs-sm);
  outline: none;

  &::placeholder {
    color: var(--shell-text-muted);
  }
}

.HomeSidePluginsPane-List {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 12px 16px;
}

.HomeSidePluginsPane-Loading {
  padding: 12px 4px;
}

.HomeSidePluginsPane-Row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 8px 10px;
  border-radius: var(--shell-radius-sm);

  &:hover {
    background: var(--shell-surface-2);
  }
}

.HomeSidePluginsPane-Icon {
  flex: none;
  margin-top: 2px;
  color: var(--shell-text-muted);
  font-size: 15px;
}

.HomeSidePluginsPane-Info {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.HomeSidePluginsPane-NameRow {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.HomeSidePluginsPane-Status {
  flex: none;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--shell-surface-2);
  color: var(--shell-text-muted);
  font-size: 11px;

  &.is-active {
    background: var(--shell-success-soft);
    color: var(--shell-success);
  }
}
</style>
