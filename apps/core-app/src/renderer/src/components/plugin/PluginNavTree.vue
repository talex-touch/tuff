<script lang="ts" name="PluginNavTree" setup>
import type { ITouchPlugin } from '@talex-touch/utils'
import { TxButton, TxTransition, TxTransitionSmoothSize } from '@talex-touch/tuffex'
import { PluginStatus as EPluginStatus } from '@talex-touch/utils'
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg?url'
import StatusIcon from '~/components/base/StatusIcon.vue'
import { appSetting } from '~/modules/channel/storage'
import { usePluginSelection } from '~/modules/hooks/usePluginSelection'

type PluginCategoryId = string

interface PluginCategoryGroup {
  id: PluginCategoryId
  label: string
  plugins: ITouchPlugin[]
}

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const { plugins, curSelect, selectPlugin } = usePluginSelection()
const isPluginRoute = computed(() => route.path.startsWith('/plugin'))

const developerMode = computed(() => Boolean(appSetting?.dev?.developerMode))
const visiblePlugins = computed(() => {
  if (developerMode.value) return plugins.value
  return plugins.value.filter((p) => !p.meta?.internal)
})

const CATEGORY_ALIASES: Record<string, string> = {
  tools: 'utilities',
  tool: 'utilities',
  dev: 'development'
}

const CATEGORY_ORDER: readonly string[] = [
  'productivity',
  'utilities',
  'development',
  'writing',
  'creativity',
  'ai',
  'automation',
  'communication',
  'analytics',
  'design',
  'education',
  'finance',
  'uncategorized'
]

function normalizeCategoryId(raw: unknown): PluginCategoryId {
  const id = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!id) return 'uncategorized'
  return CATEGORY_ALIASES[id] ?? id
}

function resolveCategoryLabel(categoryId: PluginCategoryId): string {
  const key = `market.categories.${categoryId}`
  const label = t(key)
  if (label !== key) return label
  return categoryId
}

const groups = computed<PluginCategoryGroup[]>(() => {
  const map = new Map<PluginCategoryId, ITouchPlugin[]>()

  for (const plugin of visiblePlugins.value) {
    const id = normalizeCategoryId(plugin.category)
    const list = map.get(id) ?? []
    list.push(plugin)
    map.set(id, list)
  }

  const list: PluginCategoryGroup[] = []
  for (const [id, items] of map.entries()) {
    items.sort((a, b) => a.name.localeCompare(b.name))
    list.push({
      id,
      label: resolveCategoryLabel(id),
      plugins: items
    })
  }

  const orderIndex = new Map<string, number>(CATEGORY_ORDER.map((id, i) => [id, i]))
  list.sort((a, b) => {
    const ai = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bi = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    return a.label.localeCompare(b.label)
  })

  return list
})

const expanded = ref<Set<PluginCategoryId>>(new Set())

watch(
  groups,
  (next) => {
    const merged = new Set(expanded.value)
    for (const group of next) {
      if (!merged.has(group.id)) merged.add(group.id)
    }
    expanded.value = merged
  },
  { immediate: true }
)

watch(
  () => curSelect.value?.name,
  (name) => {
    if (!name) return
    const plugin = visiblePlugins.value.find((p) => p.name === name)
    if (!plugin) return
    const id = normalizeCategoryId(plugin.category)
    if (!expanded.value.has(id)) {
      expanded.value = new Set([...expanded.value, id])
    }
  }
)

function isExpanded(id: PluginCategoryId): boolean {
  return expanded.value.has(id)
}

function toggleGroup(id: PluginCategoryId): void {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

async function handleSelectPlugin(plugin: ITouchPlugin): Promise<void> {
  await selectPlugin(plugin.name)
  const current = typeof route.params?.name === 'string' ? route.params.name : undefined
  if (route.path.startsWith('/plugin') && current === plugin.name) return
  await router.push(`/plugin/${encodeURIComponent(plugin.name)}`)
}

function hasError(plugin: ITouchPlugin): boolean {
  return Boolean(plugin.issues?.some((issue) => issue.type === 'error'))
}

function shortenTooltip(message: string, max = 80): string {
  const normalized = message.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

function getIssueTitle(plugin: ITouchPlugin): string | undefined {
  const issues = plugin.issues ?? []
  const errors = issues.filter((issue) => issue.type === 'error')
  if (errors.length > 0) {
    const first = errors[0]?.message ? shortenTooltip(errors[0].message) : ''
    return t('plugin.navTree.badges.error', { count: errors.length, message: first })
  }

  const warnings = issues.filter((issue) => issue.type === 'warning')
  if (warnings.length > 0) {
    const first = warnings[0]?.message ? shortenTooltip(warnings[0].message) : ''
    return t('plugin.navTree.badges.warning', { count: warnings.length, message: first })
  }

  return undefined
}

type PluginIndicatorTone = 'none' | 'loading' | 'warning' | 'success' | 'error' | 'info'

function resolveIndicatorTone(plugin: ITouchPlugin): PluginIndicatorTone {
  if (plugin.status === EPluginStatus.LOADING) return 'loading'
  if (plugin.status === EPluginStatus.LOAD_FAILED || plugin.status === EPluginStatus.CRASHED)
    return 'error'
  if (plugin.status === EPluginStatus.DEV_RECONNECTING) return 'loading'

  const issues = plugin.issues ?? []
  if (issues.some((issue) => issue.type === 'error')) return 'error'
  if (issues.some((issue) => issue.type === 'warning')) return 'warning'

  if (plugin.status === EPluginStatus.DEV_DISCONNECTED) return 'warning'
  if (plugin.status === EPluginStatus.DISABLED || plugin.status === EPluginStatus.DISABLING)
    return 'info'
  if (
    plugin.status === EPluginStatus.ACTIVE ||
    plugin.status === EPluginStatus.ENABLED ||
    plugin.status === EPluginStatus.LOADED
  ) {
    return 'success'
  }

  return 'none'
}
</script>

<template>
  <div class="PluginNavTree">
    <TxTransition
      class="PluginNavTree-GroupsTransition"
      group
      preset="slide-fade"
      tag="div"
      :appear="false"
      :duration="180"
    >
      <section v-for="group in groups" :key="group.id" class="PluginNavTree-Group">
        <TxButton
          variant="bare"
          native-type="button"
          class="PluginNavTree-GroupHeader"
          :aria-expanded="isExpanded(group.id)"
          @click="toggleGroup(group.id)"
        >
          <span class="PluginNavTree-GroupChevron" :class="{ open: isExpanded(group.id) }">
            <i class="i-ri-arrow-right-s-line" />
          </span>
          <span class="PluginNavTree-GroupLabel">{{ group.label }}</span>
          <span
            class="PluginNavTree-GroupCount"
            :title="t('plugin.navTree.groupCount', { count: group.plugins.length })"
            >{{ group.plugins.length }}</span
          >
        </TxButton>

        <TxTransitionSmoothSize
          v-if="isExpanded(group.id)"
          class="PluginNavTree-GroupBody"
          :appear="false"
          motion="slide-fade"
          :duration="180"
        >
          <div class="PluginNavTree-Items">
            <TxTransition
              class="PluginNavTree-ItemsTransition"
              group
              preset="slide-fade"
              tag="div"
              :appear="false"
              :duration="180"
            >
              <TxButton
                v-for="plugin in group.plugins"
                :key="plugin.name"
                variant="bare"
                native-type="button"
                class="PluginNavTree-Item"
                :class="{ active: isPluginRoute && curSelect?.name === plugin.name }"
                @click="handleSelectPlugin(plugin)"
              >
                <StatusIcon
                  class="PluginNavTree-ItemIcon"
                  :icon="plugin.icon"
                  :alt="plugin.name"
                  :size="18"
                  colorful
                  :empty="DefaultIcon"
                  :tone="resolveIndicatorTone(plugin)"
                />
                <span class="PluginNavTree-ItemName">
                  {{ plugin.name }}
                </span>
                <span
                  v-if="hasError(plugin)"
                  class="PluginNavTree-ItemBadge error"
                  :title="getIssueTitle(plugin)"
                >
                  <i class="i-ri-error-warning-line" />
                </span>
                <span
                  v-else-if="plugin.issues?.length"
                  class="PluginNavTree-ItemBadge warning"
                  :title="getIssueTitle(plugin)"
                >
                  <i class="i-ri-alert-line" />
                </span>
              </TxButton>
            </TxTransition>
          </div>
        </TxTransitionSmoothSize>
      </section>
    </TxTransition>
  </div>
</template>

<style lang="scss" scoped>
.PluginNavTree {
  margin: 6px 0 0 0;
  padding: 0 6px;
}

.PluginNavTree-GroupsTransition :deep(> div) {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.PluginNavTree-Group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.PluginNavTree-GroupHeader {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 10px;
  border: none;
  background: transparent;
  --fake-inner-opacity: 0;
  --fake-color: transparent;
  cursor: pointer;
  user-select: none;
  color: var(--el-text-color-secondary);
  transition: background-color 0.2s ease;

  &:hover {
    background: var(--el-fill-color-light);
  }
}

.PluginNavTree-GroupChevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  color: var(--el-text-color-secondary);
  transition: transform 0.18s ease;

  &.open {
    transform: rotate(90deg);
  }
}

.PluginNavTree-GroupLabel {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.PluginNavTree-GroupCount {
  margin-left: auto;
  font-size: 12px;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 8px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.PluginNavTree-GroupBody {
  padding-left: 18px;
}

.PluginNavTree-Items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.PluginNavTree-ItemsTransition :deep(> div) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.PluginNavTree-Item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 12px;
  border: none;
  background: transparent;
  --fake-inner-opacity: 0;
  --fake-color: transparent;
  cursor: pointer;
  user-select: none;
  color: var(--el-text-color-primary);
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;

  &:hover {
    background: var(--el-fill-color-light);
  }

  &.active {
    background: color-mix(in srgb, var(--el-color-primary) 14%, transparent);
    color: var(--el-color-primary);
  }

  &:active {
    transform: translateY(1px);
  }
}

.PluginNavTree-ItemIcon {
  flex: 0 0 auto;
}

.PluginNavTree-ItemName {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  line-height: 18px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.PluginNavTree-ItemBadge {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 6px;
  font-size: 14px;

  &.error {
    color: var(--el-color-error);
    background: color-mix(in srgb, var(--el-color-error) 12%, transparent);
  }

  &.warning {
    color: var(--el-color-warning);
    background: color-mix(in srgb, var(--el-color-warning) 12%, transparent);
  }
}
</style>
