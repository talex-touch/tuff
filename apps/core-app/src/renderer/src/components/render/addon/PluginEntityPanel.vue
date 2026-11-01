<script setup lang="ts" name="PluginEntityPanel">
import type { TuffItem } from '@talex-touch/utils'
import type { PluginEntityActionId } from '../../../../../shared/plugin-entity'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxIcon } from '@talex-touch/tuffex/icon'
import { TxScroll } from '@talex-touch/tuffex/scroll'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import DefaultIcon from '~/assets/svg/EmptyAppPlaceholder.svg'
import { resolveI18nText } from '~/modules/lang/resolve-i18n-text'
import { getCurrentRendererPlatformState } from '~/modules/platform/renderer-platform'
import { describePluginIssue } from '~/modules/plugin/plugin-issue-display'
import {
  isPluginEntityActionId,
  PLUGIN_ENTITY_ACTION_IDS,
  readPluginEntitySnapshot
} from '../../../../../shared/plugin-entity'
import {
  normalizeCoreBoxIcon,
  resolveCoreBoxIconColor,
  shouldRenderCoreBoxIconColorful
} from '../icon-color-mode'

/**
 * The management pane of an installed plugin's CoreBox row.
 *
 * Everything it shows comes from the row (`meta.extension.pluginEntity` and `actions`), so it
 * never disagrees with the ⌘K panel: after a step the row is searched again and the pane redraws
 * from the new one. The buttons keep the input's focus (`mousedown.prevent`) — Enter belongs to
 * the result list, and a focused button would answer it a second time.
 */
const props = defineProps<{
  item: TuffItem
  runAction: (actionId: PluginEntityActionId) => Promise<void>
}>()

const emit = defineEmits<{
  (event: 'runFeature', item: TuffItem): void
}>()

/** Kept in the SFC on purpose: UnoCSS extracts icon classes from `.vue` sources only. */
const ACTION_ICONS: Readonly<Record<PluginEntityActionId, string>> = {
  'plugin-entity:run-feature': 'i-ri-play-line',
  'plugin-entity:enable': 'i-ri-play-circle-line',
  'plugin-entity:disable': 'i-ri-stop-circle-line',
  'plugin-entity:reload': 'i-ri-refresh-line',
  'plugin-entity:open-folder': 'i-ri-folder-line',
  'plugin-entity:open-detail': 'i-ri-information-line'
}

interface PaneAction {
  id: PluginEntityActionId
  label: string
  icon: string
  primary: boolean
}

const { t, locale } = useI18n()
const isMac = getCurrentRendererPlatformState().isMac

const entity = computed(() => readPluginEntitySnapshot(props.item))
const problem = computed(() =>
  entity.value?.problem ? describePluginIssue(entity.value.problem, t, locale.value) : null
)
const headerIcon = computed(() => normalizeCoreBoxIcon(props.item.render?.basic?.icon))
const headerIconStyle = computed(() => ({
  '--icon-color': resolveCoreBoxIconColor(props.item.render?.basic?.icon)
}))
const stateLabel = computed(() =>
  entity.value ? t(`corebox.pluginEntity.state.${entity.value.state}`) : ''
)

/** The row's own management actions; running a feature is the feature list's job. */
const actions = computed<PaneAction[]>(() =>
  (props.item.actions ?? []).flatMap((action) => {
    if (!isPluginEntityActionId(action.id)) return []
    if (action.id === PLUGIN_ENTITY_ACTION_IDS.runFeature) return []
    return [
      {
        id: action.id,
        label: action.label ?? action.id,
        icon: ACTION_ICONS[action.id],
        primary: action.primary === true
      }
    ]
  })
)

const pending = ref<PluginEntityActionId | null>(null)

async function run(actionId: PluginEntityActionId): Promise<void> {
  if (pending.value) return
  pending.value = actionId
  try {
    await props.runAction(actionId)
  } finally {
    pending.value = null
  }
}

function featureTitle(name: string): string {
  return resolveI18nText(name, t)
}
</script>

<template>
  <div v-if="entity" class="PluginEntityPanel">
    <TxScroll class="h-full w-full" no-padding :native="isMac" :native-auto-fallback="!isMac">
      <div class="PluginEntityPanel-Body">
        <header class="PluginEntityPanel-Header">
          <TxIcon
            class="PluginEntityPanel-Icon"
            :empty="DefaultIcon"
            :icon="headerIcon"
            :alt="entity.displayName"
            :size="40"
            :colorful="shouldRenderCoreBoxIconColorful(item.render?.basic?.icon)"
            :style="headerIconStyle"
          />
          <div class="PluginEntityPanel-Identity">
            <h3 class="PluginEntityPanel-Title">{{ entity.displayName }}</h3>
            <p class="PluginEntityPanel-Meta">
              <span>{{ entity.name }}</span>
              <span>v{{ entity.version }}</span>
              <span v-if="entity.dev">{{ t('corebox.pluginEntity.dev') }}</span>
            </p>
          </div>
          <span class="PluginEntityPanel-State" :data-state="entity.state">{{ stateLabel }}</span>
        </header>

        <p v-if="entity.description" class="PluginEntityPanel-Description">
          {{ entity.description }}
        </p>
        <div v-if="problem" class="PluginEntityPanel-Problem" role="status">
          <p class="PluginEntityPanel-ProblemTitle">{{ problem.title }}</p>
          <p v-if="problem.advice">{{ problem.advice }}</p>
          <p v-if="problem.detail" class="PluginEntityPanel-ProblemDetail">{{ problem.detail }}</p>
        </div>

        <div
          v-if="actions.length"
          class="PluginEntityPanel-Actions"
          role="group"
          :aria-label="t('corebox.pluginEntity.manage')"
        >
          <TxButton
            v-for="action in actions"
            :key="action.id"
            size="sm"
            :variant="action.primary ? 'primary' : 'secondary'"
            :icon="action.icon"
            :loading="pending === action.id"
            :disabled="pending !== null"
            :data-plugin-entity-action="action.id"
            @mousedown.prevent
            @click="run(action.id)"
          >
            {{ action.label }}
          </TxButton>
        </div>

        <section class="PluginEntityPanel-Features">
          <h4 class="PluginEntityPanel-SectionTitle">
            {{ t('corebox.pluginEntity.features', { count: entity.features.length }) }}
          </h4>
          <p v-if="!entity.features.length" class="PluginEntityPanel-Hint">
            {{ t('corebox.pluginEntity.noFeatures') }}
          </p>
          <template v-else>
            <p v-if="entity.state !== 'enabled'" class="PluginEntityPanel-Hint">
              {{ t('corebox.pluginEntity.featuresNeedEnable') }}
            </p>
            <ul class="PluginEntityPanel-FeatureList">
              <li
                v-for="feature in entity.features"
                :key="feature.id"
                class="PluginEntityPanel-Feature"
                :data-plugin-entity-feature="feature.id"
              >
                <TxIcon
                  class="PluginEntityPanel-FeatureIcon"
                  :empty="DefaultIcon"
                  :icon="normalizeCoreBoxIcon(feature.icon)"
                  :alt="featureTitle(feature.name)"
                  :size="20"
                />
                <div class="PluginEntityPanel-FeatureText">
                  <span class="PluginEntityPanel-FeatureName">{{
                    featureTitle(feature.name)
                  }}</span>
                  <span v-if="feature.desc" class="PluginEntityPanel-FeatureDesc">
                    {{ featureTitle(feature.desc) }}
                  </span>
                </div>
                <TxButton
                  v-if="feature.item"
                  size="sm"
                  variant="ghost"
                  icon="i-ri-play-line"
                  @mousedown.prevent
                  @click="emit('runFeature', feature.item)"
                >
                  {{ t('corebox.pluginEntity.actions.run') }}
                </TxButton>
              </li>
            </ul>
          </template>
        </section>
      </div>
    </TxScroll>
  </div>
</template>

<style lang="scss" scoped>
.PluginEntityPanel {
  width: 100%;
  height: 100%;
}

.PluginEntityPanel-Body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.PluginEntityPanel-Header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.PluginEntityPanel-Icon {
  flex-shrink: 0;
}

.PluginEntityPanel-Identity {
  flex: 1;
  min-width: 0;
}

.PluginEntityPanel-Title {
  margin: 0;
  overflow: hidden;
  color: var(--tx-text-color-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.PluginEntityPanel-Meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0 8px;
  margin: 2px 0 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 16px;
}

.PluginEntityPanel-State {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background-color: var(--tx-fill-color-light);
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 16px;

  &[data-state='enabled'] {
    background-color: var(--tx-color-success-light-9);
    color: var(--tx-color-success);
  }

  &[data-state='failed'],
  &[data-state='crashed'] {
    background-color: var(--tx-color-danger-light-9);
    color: var(--tx-color-danger);
  }

  &[data-state='dev-disconnected'],
  &[data-state='loading'] {
    background-color: var(--tx-color-warning-light-9);
    color: var(--tx-color-warning);
  }
}

.PluginEntityPanel-Description {
  margin: 0;
  color: var(--tx-text-color-regular);
  font-size: 13px;
  line-height: 20px;
}

.PluginEntityPanel-Problem {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 8px;
  background-color: var(--tx-color-danger-light-9);
  color: var(--tx-color-danger);
  font-size: 12px;
  line-height: 18px;
  word-break: break-word;

  p {
    margin: 0;
  }
}

.PluginEntityPanel-ProblemTitle {
  font-weight: 600;
}

.PluginEntityPanel-ProblemDetail {
  color: var(--tx-text-color-secondary);
  font-family: var(--tx-font-family-mono, monospace);
  font-size: 11px;
  overflow-wrap: anywhere;
}

.PluginEntityPanel-Actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.PluginEntityPanel-Features {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--tx-border-color-lighter, var(--tx-border-color));
}

.PluginEntityPanel-SectionTitle {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
}

.PluginEntityPanel-Hint {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
}

.PluginEntityPanel-FeatureList {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.PluginEntityPanel-Feature {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 4px 6px;
  border-radius: 8px;

  &:hover {
    background-color: var(--tx-fill-color-light);
  }
}

.PluginEntityPanel-FeatureIcon {
  flex-shrink: 0;
}

.PluginEntityPanel-FeatureText {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.PluginEntityPanel-FeatureName {
  overflow: hidden;
  color: var(--tx-text-color-primary);
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.PluginEntityPanel-FeatureDesc {
  overflow: hidden;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
