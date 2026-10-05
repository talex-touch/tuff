<!--
  SettingSkillDetail

  The drawer body for one skill on this machine: Tuff's own switch, its description, every agent
  whose directory holds the file (with the entry in that directory), and where the file really is —
  its real path and the root that stores it.

  Read-only toward the agents. The switch changes only whether Tuff offers the skill to its own
  conversations; nothing here touches an agent's directory or the file itself.
-->
<script lang="ts" name="SettingSkillDetail" setup>
import type { SkillInventoryRow } from '@talex-touch/utils/transport/sdk/domains/skill-local'
import type { ResourceRowTag } from '~/components/settings/resources/types'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import AgentGlyph from '~/components/settings/resources/AgentGlyph.vue'
import { agentBrand } from '~/components/settings/resources/agent-registry'
import SettingChip from '~/components/settings/SettingChip.vue'

const props = defineProps<{
  row: SkillInventoryRow
  /** A switch request for this skill is in flight. */
  pending: boolean
  /** Why the last attempt to switch it failed, in the page's words. */
  failure?: string
  /** The page's labels for this row, shown again at the top of the drawer. */
  tags: readonly ResourceRowTag[]
  /** Where the file is stored, as the row's label says it. */
  storageLabel: string
}>()

const emit = defineEmits<{
  toggle: [value: boolean]
}>()

const { t } = useI18n()
const switchTitleId = useId()

const imported = computed(() => props.row.kind === 'imported')

const stateText = computed(() => {
  if (props.row.unavailableReason === 'source-missing')
    return t('settings.skillsPage.unavailableSourceMissing')
  if (props.row.unavailableReason === 'invalid') return t('settings.skillsPage.unavailableInvalid')
  return props.row.enabledInTuff
    ? t('settings.skillsPage.stateEnabled')
    : t('settings.skillsPage.stateDisabled')
})
</script>

<template>
  <div class="SkillDetail" :data-skill-id="row.id">
    <div v-if="tags.length > 0" class="SkillDetail-Tags">
      <SettingChip v-for="tag in tags" :key="tag.key ?? tag.label" :tone="tag.tone ?? 'neutral'">
        {{ tag.label }}
      </SettingChip>
    </div>

    <section class="SkillDetail-Switch">
      <div class="SkillDetail-SwitchText">
        <span :id="switchTitleId" class="SkillDetail-SwitchTitle">
          {{ t('settings.skillsPage.enableTitle') }}
        </span>
        <span class="SkillDetail-SwitchDesc">{{ stateText }}</span>
        <span v-if="failure" class="SkillDetail-Failure" role="alert">{{ failure }}</span>
      </div>
      <TxSwitch
        :model-value="row.enabledInTuff"
        :loading="pending"
        :aria-labelledby="switchTitleId"
        @update:model-value="(value) => emit('toggle', Boolean(value))"
      />
    </section>

    <section class="SkillDetail-Section">
      <h3>{{ t('settings.skillsPage.detailDescription') }}</h3>
      <p v-if="row.description" class="SkillDetail-Text">{{ row.description }}</p>
      <p v-else class="SkillDetail-None">{{ t('settings.skillsPage.noDescription') }}</p>
    </section>

    <section class="SkillDetail-Section">
      <h3>{{ t('settings.skillsPage.detailSources') }}</h3>
      <ul v-if="row.sources.length > 0" class="SkillDetail-Sources">
        <li
          v-for="source in row.sources"
          :key="`${source.agentId}:${source.entryPath ?? ''}`"
          class="SkillDetail-Source"
        >
          <AgentGlyph :agent-id="source.agentId" :size="18" />
          <div class="SkillDetail-SourceText">
            <span class="SkillDetail-SourceName">{{ agentBrand(source.agentId).label }}</span>
            <code v-if="source.entryPath" class="SkillDetail-Path">{{ source.entryPath }}</code>
            <span v-else class="SkillDetail-SourceNote">
              {{ t('settings.skillsPage.detailImportedFrom') }}
            </span>
          </div>
        </li>
      </ul>
      <p v-else class="SkillDetail-None">{{ t('settings.skillsPage.detailSourcesNone') }}</p>
    </section>

    <section class="SkillDetail-Section">
      <h3>{{ t('settings.skillsPage.detailLocation') }}</h3>
      <dl class="SkillDetail-Location">
        <dt>{{ t('settings.skillsPage.detailRealPath') }}</dt>
        <dd>
          <code v-if="row.realPath" class="SkillDetail-Code">{{ row.realPath }}</code>
          <span v-else class="SkillDetail-None">{{ t('settings.skillsPage.detailInTuff') }}</span>
        </dd>
        <dt>{{ t('settings.skillsPage.detailStorage') }}</dt>
        <dd class="SkillDetail-Storage">
          <span>{{ storageLabel }}</span>
          <code v-if="row.storageRoot" class="SkillDetail-Code">{{ row.storageRoot }}</code>
        </dd>
      </dl>
      <p v-if="imported" class="SkillDetail-Note">
        {{ t('settings.skillsPage.detailImportedNote') }}
      </p>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.SkillDetail {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-5);
  color: var(--shell-text-primary);
}

.SkillDetail-Tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.SkillDetail-Switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-4);
  padding: var(--shell-space-3) var(--shell-space-4);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-lg);
}

.SkillDetail-SwitchText {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.SkillDetail-SwitchTitle {
  font-size: var(--shell-fs-md);
  font-weight: 500;
}

.SkillDetail-SwitchDesc,
.SkillDetail-Note {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.SkillDetail-Failure {
  color: var(--shell-danger);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.SkillDetail-Section {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);

  h3 {
    margin: 0;
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-sm);
    font-weight: 600;
  }
}

.SkillDetail-Text {
  margin: 0;
  font-size: var(--shell-fs-body);
  line-height: 1.6;
  white-space: pre-line;
  overflow-wrap: anywhere;
  user-select: text;
}

.SkillDetail-None {
  margin: 0;
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
  line-height: 1.5;
}

.SkillDetail-Note {
  margin: 0;
}

.SkillDetail-Sources {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.SkillDetail-Source {
  display: flex;
  align-items: flex-start;
  gap: var(--shell-space-3);
}

.SkillDetail-SourceText {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.SkillDetail-SourceName {
  font-size: var(--shell-fs-body);
  line-height: 18px;
}

.SkillDetail-SourceNote {
  color: var(--shell-text-secondary);
  font-size: var(--shell-fs-sm);
}

.SkillDetail-Path {
  color: var(--shell-text-secondary);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  overflow-wrap: anywhere;
  user-select: text;
}

.SkillDetail-Location {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: var(--shell-space-2) var(--shell-space-4);
  margin: 0;

  dt {
    color: var(--shell-text-secondary);
    font-size: var(--shell-fs-sm);
    line-height: 22px;
  }

  dd {
    min-width: 0;
    margin: 0;
  }
}

.SkillDetail-Storage {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: var(--shell-fs-body);
  line-height: 22px;
}

.SkillDetail-Code {
  display: inline-block;
  max-width: 100%;
  padding: 2px 6px;
  border-radius: var(--shell-radius-sm);
  background: var(--shell-surface-2);
  color: var(--shell-text-primary);
  font-family: var(--shell-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11.5px;
  line-height: 18px;
  overflow-wrap: anywhere;
  user-select: text;
}
</style>
