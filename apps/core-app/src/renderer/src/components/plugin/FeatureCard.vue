<script lang="ts" setup>
import { computed } from 'vue'
import type { IFeatureCommand, IPluginFeature } from '@talex-touch/utils/plugin'

interface FeatureCommandData {
  name?: string
  shortcut?: string
  desc?: string
}

type PluginFeatureWithCommandsData = IPluginFeature & {
  commandsData?: Partial<Record<IFeatureCommand['type'], FeatureCommandData>>
}

const props = defineProps<{
  feature: PluginFeatureWithCommandsData
}>()

const emit = defineEmits(['click'])

const platformMeta = [
  {
    id: 'win',
    keys: ['win', 'win32', 'windows'],
    icon: 'i-ri-windows-fill',
    className: 'is-win',
    label: 'Windows'
  },
  {
    id: 'darwin',
    keys: ['darwin', 'mac', 'macos', 'osx'],
    icon: 'i-ri-apple-fill',
    className: 'is-mac',
    label: 'macOS'
  },
  {
    id: 'linux',
    keys: ['linux'],
    icon: 'i-ri-ubuntu-fill',
    className: 'is-linux',
    label: 'Linux'
  }
]

const enabledPlatforms = computed(() => {
  const platform = props.feature.platform as Record<string, unknown> | undefined
  if (!platform) return []
  return platformMeta.filter((meta) =>
    meta.keys.some((key) => {
      const value = platform[key]
      if (typeof value === 'boolean') return value
      if (typeof value === 'object' && value) {
        const enabled = (value as { enable?: boolean }).enable
        return Boolean(enabled)
      }
      return false
    })
  )
})

function getPriorityLabel(): string {
  const value = props.feature.priority
  if (typeof value === 'number') return `P${value}`
  return 'P0'
}

function getInteractionLabel(): string {
  const raw = props.feature.interaction?.type || 'standard'
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function getCommandName(command: IFeatureCommand): string {
  const data = props.feature.commandsData?.[command.type]
  if (data?.name) return data.name
  return command.type
}

function getPrimaryCommandLabel(): string {
  const primary = props.feature.commands?.[0]
  if (!primary) return '-'
  return getCommandName(primary).toUpperCase()
}
</script>

<template>
  <div class="FeatureCard element" @click="emit('click')">
    <div class="FeatureCard-Content">
      <div class="FeatureCard-Header flex items-start justify-between">
        <div class="FeatureCard-HeaderMain flex items-center gap-4">
          <div
            class="FeatureCard-Icon w-12 h-12 bg-black/10 dark:bg-white/10 rounded-xl flex items-center justify-center"
          >
            <TuffIcon colorful :icon="feature.icon" :size="32">
              <template #empty>
                <i class="i-carbon-application" />
              </template>
            </TuffIcon>
          </div>
          <div class="FeatureCard-HeaderInfo">
            <div class="FeatureCard-TitleRow flex items-center gap-2">
              <h3
                class="FeatureCard-Title text-lg font-semibold text-[var(--el-text-color-primary)]"
              >
                {{ feature.name }}
              </h3>
              <span
                class="FeatureCard-InteractionBadge bg-[var(--el-fill-color)] text-[var(--el-text-color-regular)] text-xs px-2 py-1 rounded-full"
              >
                {{ getInteractionLabel() }}
              </span>
            </div>
          </div>
        </div>
        <div
          class="FeatureCard-PriorityBadge bg-[var(--el-color-warning-light-9)] text-[var(--el-color-warning)] text-xs px-2 py-1 rounded-full border border-[var(--el-color-warning-light-7)]"
        >
          {{ getPriorityLabel() }}
        </div>
      </div>

      <div class="FeatureCard-Body">
        <p class="FeatureCard-Desc text-sm text-[var(--el-text-color-secondary)] line-clamp-2">
          {{ feature.desc }}
        </p>
      </div>

      <div class="FeatureCard-Footer">
        <div class="FeatureCard-Platforms">
          <span
            v-for="platform in enabledPlatforms"
            :key="platform.id"
            class="FeatureCard-PlatformIcon"
            :class="platform.className"
            :title="platform.label"
          >
            <i :class="platform.icon" />
          </span>
        </div>
        <div class="FeatureCard-CommandTag">
          {{ getPrimaryCommandLabel() }}
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.FeatureCard {
  background: var(--el-bg-color-overlay);
  backdrop-filter: blur(12px);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 1.25rem; // 20px
  padding: 1.5rem; // 24px
  cursor: pointer;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.FeatureCard-Content {
  z-index: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.FeatureCard-Body {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.FeatureCard-Desc {
  flex-grow: 1;
  min-height: 2.5em; /* 确保至少有两行的高度 */
}

.FeatureCard-PriorityBadge {
  font-weight: 600;
}

.FeatureCard-Header {
  margin-bottom: 1rem;
}

.FeatureCard-TitleRow {
  line-height: 1.2;
}

.FeatureCard-InteractionBadge {
  text-transform: capitalize;
  border: 1px solid var(--el-border-color-lighter);
}

.FeatureCard-Footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.85rem;
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: 1.25rem;
}

.FeatureCard-Platforms {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.FeatureCard-PlatformIcon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}

.FeatureCard-PlatformIcon.is-win {
  color: #3bb44a;
}

.FeatureCard-PlatformIcon.is-mac {
  color: #4c79ff;
}

.FeatureCard-PlatformIcon.is-linux {
  color: #ff4d4f;
}

.FeatureCard-CommandTag {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--el-color-warning);
}
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
