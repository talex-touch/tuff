<!--
  SettingSkillsMcp Component

  Skills: what the home conversation can reach for beyond the model itself.

  Nothing here needs importing first. The skills list reads what the agents on this machine already
  keep — Codex, Claude Code, cc-switch and their neighbours — plus whatever the user linked by hand
  and whatever was imported before; main owns that merge and this page renders the snapshot it gets
  back. Every row it shows is a skill the conversation can already use.

  MCP servers, and Tuff's own MCP listener, moved to the MCP settings page
  (`IntelligenceMcpPage.vue`). The name stays until the skills get a page of their own too.
-->
<script lang="ts" name="SettingSkillsMcp" setup>
import type { AiImportedConfigItem } from '@talex-touch/tuff-intelligence'
import { TxButton } from '@talex-touch/tuffex/button'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { TxSwitch } from '@talex-touch/tuffex/switch'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import { useIntelligenceSdk } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineEvent, defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import SettingChip from '~/components/settings/SettingChip.vue'
import SettingRow from '~/components/settings/SettingRow.vue'
import SettingSkeleton from '~/components/settings/SettingSkeleton.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import { createRendererLogger } from '~/utils/renderer-log'
import { agentLabel, displayName, errorMessage, MAX_VISIBLE_ROWS } from './setting-ai-import-shared'

/**
 * Mirrored from `skill-local-runtime.ts`; edit both copies or neither.
 *
 * `sourceId` names the agent that owns a directory and is null for one the user linked, so the label
 * a row shows stays the renderer's decision.
 */
interface LocalSkillDirView {
  path: string
  sourceId: string | null
  auto: boolean
}

interface LocalSkillView {
  id: string
  name: string
  description: string
  path: string
  sourceDir: string
  enabled: boolean
}

interface LocalSkillSnapshotView {
  dirs: LocalSkillDirView[]
  skills: LocalSkillView[]
}

/** Where a row in the unified skills list came from. */
type SkillRowKind = 'agent' | 'linked' | 'imported'

interface SkillRow {
  key: string
  title: string
  description: string
  kind: SkillRowKind
  sourceId: string | null
  enabled: boolean
  /** Set for the two rows backed by a file on disk. */
  local: LocalSkillView | null
  /** Set for the row backed by an imported item. */
  item: AiImportedConfigItem | null
}

const skillLocalListEvent = defineEvent('ai')
  .module('skill-local')
  .event('list')
  .define<void, LocalSkillSnapshotView>()
const skillLocalAddDirEvent = defineEvent('ai')
  .module('skill-local')
  .event('add-dir')
  .define<{ path: string }, LocalSkillSnapshotView>()
const skillLocalRemoveDirEvent = defineEvent('ai')
  .module('skill-local')
  .event('remove-dir')
  .define<{ path: string }, LocalSkillSnapshotView>()
const skillLocalSetEnabledEvent = defineEvent('ai')
  .module('skill-local')
  .event('set-enabled')
  .define<{ id: string; enabled: boolean }, LocalSkillSnapshotView>()

const openFileEvent = defineRawEvent<
  { title?: string; buttonLabel?: string; properties?: string[] },
  { filePaths?: string[] }
>('dialog:open-file')

const i18n = useI18n()
const { t } = i18n
const aiClient = useIntelligenceSdk()
const tuffTransport = useTuffTransport()
const skillsMcpLog = createRendererLogger('SettingSkillsMcp')

const items = ref<AiImportedConfigItem[]>([])
const loading = ref(true)
const loadError = ref('')

const localDirs = ref<LocalSkillDirView[]>([])
const localSkills = ref<LocalSkillView[]>([])
const localBusy = ref(false)
const showAllSkills = ref(false)

const importedSkills = computed(() => items.value.filter((item) => item.kind === 'skill'))

/**
 * One list for every skill the conversation can reach: the agents' own libraries, the directories
 * the user linked, and anything imported earlier. They differ only in the source chip a row shows —
 * keeping them in separate lists is what made the page look empty while the disk was full.
 */
const skillRowsAll = computed<SkillRow[]>(() => {
  const agentOfDir = new Map(
    localDirs.value
      .filter((dir): dir is LocalSkillDirView & { sourceId: string } => Boolean(dir.sourceId))
      .map((dir) => [dir.path, dir.sourceId] as const)
  )
  const rows: SkillRow[] = localSkills.value.map((skill) => {
    const sourceId = agentOfDir.get(skill.sourceDir) ?? null
    return {
      key: skill.id,
      title: skill.name,
      description: skill.description || t('settings.skillsMcp.skills.noDescription'),
      kind: sourceId ? 'agent' : 'linked',
      sourceId,
      enabled: skill.enabled,
      local: skill,
      item: null
    }
  })

  for (const item of importedSkills.value) {
    const description = item.normalizedProjection?.description
    rows.push({
      key: item.id,
      title: displayName(item),
      description:
        typeof description === 'string' && description.trim()
          ? description.trim()
          : t('settings.skillsMcp.skills.noDescription'),
      kind: 'imported',
      sourceId: null,
      enabled: item.active,
      local: null,
      item
    })
  }

  return rows.sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
    return left.title.localeCompare(right.title)
  })
})

const skillRows = computed(() =>
  showAllSkills.value ? skillRowsAll.value : skillRowsAll.value.slice(0, MAX_VISIBLE_ROWS)
)
const hiddenSkillCount = computed(() =>
  Math.max(skillRowsAll.value.length - skillRows.value.length, 0)
)

const showStateRow = computed(() => loading.value && items.value.length === 0)

const localDirRows = computed(() =>
  localDirs.value.map((dir) => ({
    ...dir,
    count: localSkills.value.filter((skill) => skill.sourceDir === dir.path).length
  }))
)

/**
 * Only the first load draws a skeleton. Binding to `loading` would also fire on
 * every retry, swapping already-rendered rows back out for placeholders; this
 * flag never returns to false once the first snapshot has landed.
 */
const hasLoaded = ref(false)
const showSkeleton = useDeferredLoading(() => !hasLoaded.value)

/**
 * Mirrors the two sections the loaded page draws. Every list is capped at
 * `MAX_VISIBLE_ROWS` and each section always ends with an action row, so a count
 * inside that range is as close as a skeleton can get before the real one lands.
 */
const skeletonGroups = computed(() => [
  { label: t('settings.skillsMcp.skills.label'), rows: 4, description: true, trailing: true },
  { label: t('settings.skillsMcp.localDirs.label'), rows: 2, description: true, trailing: true }
])

function skillSourceLabel(row: SkillRow): string {
  if (row.kind === 'imported') return t('settings.skillsMcp.sources.imported')
  if (row.kind === 'linked') return t('settings.skillsMcp.sources.linked')
  return agentLabel(row.sourceId ?? '', i18n)
}

async function loadItems(): Promise<void> {
  loading.value = true
  try {
    const snapshot = await aiClient.orchestratorGetSnapshot()
    items.value = snapshot.importedItems
    loadError.value = ''
  } catch (error) {
    skillsMcpLog.error('Failed to read the orchestrator snapshot', error)
    loadError.value = errorMessage(error, t('settings.skillsMcp.loadFailedDesc'))
  } finally {
    loading.value = false
    hasLoaded.value = true
  }
}

async function setItemActive(item: AiImportedConfigItem, active: boolean): Promise<void> {
  try {
    const updated = await aiClient.orchestratorSetImportedItemActive({ itemId: item.id, active })
    items.value = items.value.map((candidate) =>
      candidate.id === updated.id ? updated : candidate
    )
  } catch (error) {
    skillsMcpLog.error('Failed to change the imported item state', error)
    toast.error(errorMessage(error, t('settings.skillsMcp.toggleFailed')))
  }
}

function applyLocalSnapshot(snapshot: LocalSkillSnapshotView | undefined): void {
  localDirs.value = snapshot?.dirs ?? []
  localSkills.value = snapshot?.skills ?? []
}

/**
 * Every local mutation answers with the rescanned snapshot, so the page never
 * builds its own idea of what the directories hold — a skill added or renamed on
 * disk shows up on the same round trip.
 */
async function runLocalAction(
  action: () => Promise<LocalSkillSnapshotView | undefined>,
  failureKey: string
): Promise<void> {
  if (localBusy.value) return
  localBusy.value = true
  try {
    applyLocalSnapshot(await action())
  } catch (error) {
    skillsMcpLog.error('Local skill directory action failed', error)
    toast.error(errorMessage(error, t(failureKey)))
  } finally {
    localBusy.value = false
  }
}

async function loadLocalSkills(): Promise<void> {
  await runLocalAction(
    () => tuffTransport.send(skillLocalListEvent),
    'settings.skillsMcp.localDirs.loadFailed'
  )
}

async function addLocalDir(): Promise<void> {
  const result = await tuffTransport
    .send(openFileEvent, {
      title: t('settings.skillsMcp.localDirs.pickTitle'),
      buttonLabel: t('settings.skillsMcp.localDirs.pickConfirm'),
      properties: ['openDirectory']
    })
    .catch((error: unknown) => {
      skillsMcpLog.error('Failed to open the directory picker', error)
      return undefined
    })
  const path = result?.filePaths?.[0]
  if (!path) return

  await runLocalAction(
    () => tuffTransport.send(skillLocalAddDirEvent, { path }),
    'settings.skillsMcp.localDirs.addFailed'
  )
}

async function removeLocalDir(path: string): Promise<void> {
  await runLocalAction(
    () => tuffTransport.send(skillLocalRemoveDirEvent, { path }),
    'settings.skillsMcp.localDirs.removeFailed'
  )
}

async function setLocalSkillEnabled(skill: LocalSkillView, enabled: boolean): Promise<void> {
  await runLocalAction(
    () => tuffTransport.send(skillLocalSetEnabledEvent, { id: skill.id, enabled }),
    'settings.skillsMcp.localDirs.toggleFailed'
  )
}

/** Imported skills and disk-backed ones are stored in different places, so the toggle splits here. */
async function setSkillEnabled(row: SkillRow, enabled: boolean): Promise<void> {
  if (row.item) {
    await setItemActive(row.item, enabled)
    return
  }
  if (row.local) await setLocalSkillEnabled(row.local, enabled)
}

onMounted(() => {
  void loadItems()
  void loadLocalSkills()
})
</script>

<template>
  <!-- Stands in for both sections on first load. -->
  <SettingSkeleton v-if="showSkeleton" :groups="skeletonGroups" />

  <!--
    One list, three sources. Everything here is live: the agents' libraries and the linked
    directories are read from disk on every snapshot, and the imported rows are the leftovers from
    the earlier one-shot import flow.
  -->
  <TuffGroupBlock v-if="!showSkeleton" :name="t('settings.skillsMcp.skills.label')">
    <!--
      The snapshot read failed, which takes only the imported rows with it: the disk-backed ones
      below come from their own read and still list.
    -->
    <SettingRow
      v-if="loadError"
      :title="t('settings.skillsMcp.loadFailed')"
      :description="loadError"
    >
      <template #trailing>
        <TxButton variant="secondary" size="sm" @click="loadItems">
          {{ t('settings.skillsMcp.retry') }}
        </TxButton>
      </template>
    </SettingRow>

    <SettingRow v-if="showStateRow" :title="t('settings.skillsMcp.loading')" />

    <SettingRow
      v-for="row in skillRows"
      :key="row.key"
      :title="row.title"
      :description="row.description"
    >
      <template #trailing>
        <SettingChip :tone="row.kind === 'imported' ? 'neutral' : 'info'">
          {{ skillSourceLabel(row) }}
        </SettingChip>
        <TxSwitch
          :model-value="row.enabled"
          :disabled="localBusy"
          @update:model-value="(value) => setSkillEnabled(row, Boolean(value))"
        />
      </template>
    </SettingRow>

    <SettingRow
      v-if="hiddenSkillCount > 0"
      :title="t('settings.skillsMcp.skills.showAllTitle')"
      :description="t('settings.skillsMcp.skills.showAllDesc', { count: hiddenSkillCount })"
      navigable
      @activate="showAllSkills = true"
    />

    <SettingRow
      :title="t('settings.skillsMcp.skills.rescanTitle')"
      :description="t('settings.skillsMcp.skills.rescanDesc')"
    >
      <template #trailing>
        <TxButton variant="secondary" size="sm" @click="loadLocalSkills">
          {{ t('settings.skillsMcp.skills.rescanAction') }}
        </TxButton>
      </template>
    </SettingRow>

    <SettingRow
      :title="t('settings.skillsMcp.skills.injectionTitle')"
      :description="t('settings.skillsMcp.skills.injectionDesc')"
    />
  </TuffGroupBlock>

  <!--
    Linked, not imported: these rows describe files that stay where the user put
    them, so removing a directory unlinks it and never deletes anything. The detected rows are the
    agents' own libraries and cannot be unlinked — they are not ours to detach.
  -->
  <TuffGroupBlock v-if="!showSkeleton" :name="t('settings.skillsMcp.localDirs.label')">
    <SettingRow
      v-for="row in localDirRows"
      :key="row.path"
      :title="row.sourceId ? agentLabel(row.sourceId, i18n) : row.path"
      :description="
        row.auto
          ? t('settings.skillsMcp.localDirs.autoDesc', { count: row.count })
          : t('settings.skillsMcp.localDirs.dirDesc', { count: row.count })
      "
    >
      <template #trailing>
        <SettingChip v-if="row.auto" tone="info">
          {{ t('settings.skillsMcp.localDirs.auto') }}
        </SettingChip>
        <TxTooltip
          v-if="row.auto"
          :content="row.path"
          :anchor="{ placement: 'top', showArrow: true }"
        >
          <SettingChip mono>{{ t('settings.skillsMcp.localDirs.pathChip') }}</SettingChip>
        </TxTooltip>
        <TxButton
          v-else
          variant="secondary"
          size="sm"
          :disabled="localBusy"
          @click="removeLocalDir(row.path)"
        >
          {{ t('settings.skillsMcp.localDirs.remove') }}
        </TxButton>
      </template>
    </SettingRow>

    <SettingRow
      :title="t('settings.skillsMcp.localDirs.addTitle')"
      :description="t('settings.skillsMcp.localDirs.addDesc')"
    >
      <template #trailing>
        <TxButton variant="secondary" size="sm" :disabled="localBusy" @click="loadLocalSkills">
          {{ t('settings.skillsMcp.localDirs.rescan') }}
        </TxButton>
        <TxButton size="sm" :disabled="localBusy" @click="addLocalDir">
          {{ t('settings.skillsMcp.localDirs.addAction') }}
        </TxButton>
      </template>
    </SettingRow>
  </TuffGroupBlock>
</template>
