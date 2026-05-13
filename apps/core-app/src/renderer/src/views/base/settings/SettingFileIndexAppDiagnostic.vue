<script setup lang="ts" name="SettingFileIndexAppDiagnostic">
import type {
  AppIndexDiagnoseResult,
  AppIndexDiagnosticStage,
  AppIndexReindexRequest,
  AppIndexReindexResult
} from '@talex-touch/utils/transport/events/types'
import { TxButton, TxInput } from '@talex-touch/tuffex'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TModal from '~/components/base/tuff/TModal.vue'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import { forTouchTip } from '~/modules/mention/dialog-mention'
import { createRendererLogger } from '~/utils/renderer-log'
import {
  APP_INDEX_DIAGNOSTIC_STAGE_KEYS,
  buildAppIndexDiagnosticEvidenceFilename,
  buildAppIndexDiagnosticEvidencePayload,
  formatAppIndexDiagnosticEvidenceJson,
  type AppIndexDiagnosticStageKey
} from './app-index-diagnostic-evidence'
import { resolveIndexRebuildOutcome } from './index-rebuild-flow'

const { t } = useI18n()
const settingsSdk = useSettingsSdk()
const settingFileIndexDiagnosticLog = createRendererLogger('SettingFileIndexAppDiagnostic')

const appDiagnosticTarget = ref('')
const appDiagnosticLoading = ref(false)
const appDiagnosticReindexMode = ref<AppIndexReindexRequest['mode'] | null>(null)
const appDiagnosticResult = ref<AppIndexDiagnoseResult | null>(null)
const appDiagnosticLastReindexResult = ref<AppIndexReindexResult | null>(null)
const appDiagnosticDialogVisible = ref(false)
const selectedAppDiagnosticStage = ref<AppIndexDiagnosticStageKey | null>(null)
const appDiagnosticEvidenceReady = computed(() => Boolean(appDiagnosticResult.value))
const selectedAppDiagnosticStageData = computed(() => {
  if (!selectedAppDiagnosticStage.value) return null

  return {
    key: selectedAppDiagnosticStage.value,
    stage: getAppDiagnosticStage(appDiagnosticResult.value, selectedAppDiagnosticStage.value)
  }
})

function openAppDiagnosticDialog() {
  appDiagnosticDialogVisible.value = true
}

function updateAppDiagnosticTarget(value: string | number) {
  appDiagnosticTarget.value = String(value ?? '')
  appDiagnosticLastReindexResult.value = null
  selectedAppDiagnosticStage.value = null
}

function normalizeAppDiagnosticTarget() {
  return appDiagnosticTarget.value.trim()
}

function formatAppDiagnosticList(values: string[] | undefined, limit = 18) {
  if (!values?.length) return t('settings.settingFileIndex.appDiagnosticEmpty')

  const visible = values.slice(0, limit)
  const suffix =
    values.length > visible.length
      ? t('settings.settingFileIndex.appDiagnosticMore', {
          count: values.length - visible.length
        })
      : ''

  return suffix ? `${visible.join(', ')} ${suffix}` : visible.join(', ')
}

function getAppDiagnosticStageLabel(key: AppIndexDiagnosticStageKey) {
  return t(`settings.settingFileIndex.appDiagnosticStage.${key}`)
}

function getAppDiagnosticStage(
  result: AppIndexDiagnoseResult | null,
  key: AppIndexDiagnosticStageKey
) {
  return result?.query?.stages[key]
}

function getAppDiagnosticStageTone(stage: AppIndexDiagnosticStage | undefined) {
  if (!stage || !stage.ran) return 'skipped'
  return stage.targetHit ? 'hit' : 'miss'
}

function getAppDiagnosticStageStatus(stage: AppIndexDiagnosticStage | undefined) {
  if (!stage || !stage.ran) return t('settings.settingFileIndex.appDiagnosticStageSkipped')
  return stage.targetHit
    ? t('settings.settingFileIndex.appDiagnosticStageHit')
    : t('settings.settingFileIndex.appDiagnosticStageMiss')
}

function getAppDiagnosticStageDetail(stage: AppIndexDiagnosticStage | undefined) {
  if (!stage) return t('settings.settingFileIndex.appDiagnosticStageNotRun')
  if (!stage.ran) {
    return stage.reason || t('settings.settingFileIndex.appDiagnosticStageSkipped')
  }

  return t('settings.settingFileIndex.appDiagnosticStageMatches', {
    count: stage.matches.length
  })
}

function selectAppDiagnosticStage(key: AppIndexDiagnosticStageKey) {
  selectedAppDiagnosticStage.value = selectedAppDiagnosticStage.value === key ? null : key
}

function formatAppDiagnosticStageMatch(match: AppIndexDiagnosticStage['matches'][number]) {
  const details = [
    match.keyword ? `keyword=${match.keyword}` : '',
    typeof match.priority === 'number' ? `priority=${match.priority}` : '',
    typeof match.score === 'number' ? `score=${match.score}` : '',
    typeof match.overlapCount === 'number' ? `overlap=${match.overlapCount}` : ''
  ].filter(Boolean)

  return details.length > 0 ? details.join(' · ') : '-'
}

function buildCurrentAppDiagnosticEvidence() {
  if (!appDiagnosticResult.value) return null

  return buildAppIndexDiagnosticEvidencePayload({
    target: normalizeAppDiagnosticTarget(),
    query: normalizeAppDiagnosticTarget(),
    diagnosis: appDiagnosticResult.value,
    reindex: appDiagnosticLastReindexResult.value
  })
}

async function copyAppDiagnosticEvidence() {
  const payload = buildCurrentAppDiagnosticEvidence()
  if (!payload) {
    toast.error(t('settings.settingFileIndex.appDiagnosticEvidenceMissing'))
    return
  }

  try {
    await navigator.clipboard.writeText(formatAppIndexDiagnosticEvidenceJson(payload))
    toast.success(t('settings.settingFileIndex.appDiagnosticEvidenceCopied'))
  } catch (error) {
    settingFileIndexDiagnosticLog.error('Failed to copy app diagnostic evidence', error)
    toast.error(t('settings.settingFileIndex.appDiagnosticEvidenceCopyFailed'))
  }
}

function saveAppDiagnosticEvidence() {
  const payload = buildCurrentAppDiagnosticEvidence()
  if (!payload) {
    toast.error(t('settings.settingFileIndex.appDiagnosticEvidenceMissing'))
    return
  }

  const blob = new Blob([formatAppIndexDiagnosticEvidenceJson(payload)], {
    type: 'application/json;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = buildAppIndexDiagnosticEvidenceFilename(payload)
  link.click()
  URL.revokeObjectURL(url)
  toast.success(t('settings.settingFileIndex.appDiagnosticEvidenceSaved'))
}

async function runAppSearchDiagnostic(options: { silent?: boolean } = {}) {
  const target = normalizeAppDiagnosticTarget()
  if (!target) {
    if (!options.silent) toast.error(t('settings.settingFileIndex.appDiagnosticTargetRequired'))
    return
  }

  appDiagnosticLoading.value = true
  try {
    appDiagnosticResult.value = await settingsSdk.appIndex.diagnose({
      target,
      query: target
    })
    selectedAppDiagnosticStage.value = null

    if (!appDiagnosticResult.value.success && !options.silent) {
      toast.error(
        appDiagnosticResult.value.reason || t('settings.settingFileIndex.appDiagnosticFailed')
      )
    }
  } catch (error) {
    settingFileIndexDiagnosticLog.error('Failed to diagnose app search', error)
    appDiagnosticResult.value = null
    if (!options.silent) toast.error(t('settings.settingFileIndex.appDiagnosticFailed'))
  } finally {
    appDiagnosticLoading.value = false
  }
}

function getAppReindexOutcomeMessages() {
  return {
    success: t('settings.settingFileIndex.appDiagnosticReindexSuccess'),
    failure: t('settings.settingFileIndex.appDiagnosticReindexFailed')
  }
}

async function openAppReindexConfirm(): Promise<boolean> {
  let confirmed = false

  await forTouchTip(
    t('settings.settingFileIndex.appDiagnosticReindexConfirmTitle'),
    t('settings.settingFileIndex.appDiagnosticReindexConfirmMessage'),
    [
      {
        content: t('common.cancel'),
        type: 'default',
        onClick: async () => true
      },
      {
        content: t('common.confirm'),
        type: 'warning',
        onClick: async () => {
          confirmed = true
          return true
        }
      }
    ]
  )

  return confirmed
}

async function reindexAppDiagnosticTarget(mode: AppIndexReindexRequest['mode']) {
  const target = normalizeAppDiagnosticTarget()
  if (!target) {
    toast.error(t('settings.settingFileIndex.appDiagnosticTargetRequired'))
    return
  }

  appDiagnosticReindexMode.value = mode
  try {
    const result = await settingsSdk.appIndex.reindex({ target, mode })
    appDiagnosticLastReindexResult.value = result
    let outcome = resolveIndexRebuildOutcome(result, getAppReindexOutcomeMessages())

    if (outcome.type === 'confirm') {
      const confirmed = await openAppReindexConfirm()
      if (!confirmed) return

      const forced = await settingsSdk.appIndex.reindex({ target, mode, force: true })
      appDiagnosticLastReindexResult.value = forced
      outcome = resolveIndexRebuildOutcome(forced, getAppReindexOutcomeMessages())
    }

    if (outcome.type === 'confirm') {
      toast.error(
        outcome.result.error ||
          outcome.result.reason ||
          t('settings.settingFileIndex.appDiagnosticReindexFailed')
      )
      return
    }

    if (outcome.type === 'failure') {
      toast.error(outcome.message)
      return
    }

    toast.success(outcome.message)
    await runAppSearchDiagnostic({ silent: true })
  } catch (error) {
    settingFileIndexDiagnosticLog.error('Failed to reindex app target', error)
    toast.error(t('settings.settingFileIndex.appDiagnosticReindexFailed'))
  } finally {
    appDiagnosticReindexMode.value = null
  }
}
</script>

<template>
  <TuffBlockSlot
    :title="t('settings.settingFileIndex.appDiagnosticTitle')"
    :description="t('settings.settingFileIndex.appDiagnosticDesc')"
    default-icon="i-carbon-debug"
    active-icon="i-carbon-debug"
    @click="openAppDiagnosticDialog"
  >
    <TxButton variant="flat" size="sm" @click.stop="openAppDiagnosticDialog">
      <div class="i-carbon-launch text-12px" />
      <span>{{ t('common.open') }}</span>
    </TxButton>
  </TuffBlockSlot>

  <TModal
    v-model="appDiagnosticDialogVisible"
    :title="t('settings.settingFileIndex.appDiagnosticTitle')"
    width="min(92vw, 860px)"
  >
    <div class="app-diagnostic">
      <p class="app-diagnostic-desc">
        {{ t('settings.settingFileIndex.appDiagnosticDesc') }}
      </p>
      <div class="app-diagnostic-form">
        <TxInput
          :model-value="appDiagnosticTarget"
          :placeholder="t('settings.settingFileIndex.appDiagnosticTargetPlaceholder')"
          class="app-diagnostic-input"
          @update:model-value="updateAppDiagnosticTarget"
        />
      </div>

      <div class="app-diagnostic-actions">
        <TxButton
          variant="flat"
          size="sm"
          :disabled="appDiagnosticLoading || !normalizeAppDiagnosticTarget()"
          @click="runAppSearchDiagnostic()"
        >
          <div class="i-carbon-search text-12px" />
          <span>{{ t('settings.settingFileIndex.appDiagnosticRun') }}</span>
        </TxButton>
        <TxButton
          variant="flat"
          size="sm"
          :disabled="
            appDiagnosticLoading ||
            Boolean(appDiagnosticReindexMode) ||
            !normalizeAppDiagnosticTarget()
          "
          @click="reindexAppDiagnosticTarget('keywords')"
        >
          <div class="i-carbon-renew text-12px" />
          <span>{{ t('settings.settingFileIndex.appDiagnosticReindexKeywords') }}</span>
        </TxButton>
        <TxButton
          variant="flat"
          size="sm"
          :disabled="
            appDiagnosticLoading ||
            Boolean(appDiagnosticReindexMode) ||
            !normalizeAppDiagnosticTarget()
          "
          @click="reindexAppDiagnosticTarget('scan')"
        >
          <div class="i-carbon-update-now text-12px" />
          <span>{{ t('settings.settingFileIndex.appDiagnosticRescan') }}</span>
        </TxButton>
        <TxButton
          variant="flat"
          size="sm"
          :disabled="!appDiagnosticEvidenceReady"
          @click="copyAppDiagnosticEvidence"
        >
          <div class="i-carbon-copy text-12px" />
          <span>{{ t('settings.settingFileIndex.appDiagnosticCopyEvidence') }}</span>
        </TxButton>
        <TxButton
          variant="flat"
          size="sm"
          :disabled="!appDiagnosticEvidenceReady"
          @click="saveAppDiagnosticEvidence"
        >
          <div class="i-carbon-document-download text-12px" />
          <span>{{ t('settings.settingFileIndex.appDiagnosticSaveEvidence') }}</span>
        </TxButton>
      </div>

      <div v-if="appDiagnosticResult" class="app-diagnostic-result">
        <template
          v-if="appDiagnosticResult.success && appDiagnosticResult.app && appDiagnosticResult.index"
        >
          <div class="app-diagnostic-header">
            <div>
              <strong>
                {{
                  appDiagnosticResult.app.displayName ||
                  appDiagnosticResult.app.name ||
                  appDiagnosticResult.app.fileName
                }}
              </strong>
              <span>{{ appDiagnosticResult.app.path }}</span>
            </div>
            <span class="app-diagnostic-status">
              {{ t('settings.settingFileIndex.appDiagnosticFound') }}
            </span>
          </div>

          <div class="app-diagnostic-grid">
            <div>
              <span>{{ t('settings.settingFileIndex.appDiagnosticDisplayName') }}</span>
              <strong>{{
                appDiagnosticResult.app.displayName || appDiagnosticResult.app.name
              }}</strong>
            </div>
            <div>
              <span>{{ t('settings.settingFileIndex.appDiagnosticBundleId') }}</span>
              <strong>
                {{
                  appDiagnosticResult.app.bundleId ||
                  appDiagnosticResult.app.appIdentity ||
                  t('settings.settingFileIndex.appDiagnosticEmpty')
                }}
              </strong>
            </div>
            <div>
              <span>{{ t('settings.settingFileIndex.appDiagnosticAlternateNames') }}</span>
              <p>{{ formatAppDiagnosticList(appDiagnosticResult.app.alternateNames, 10) }}</p>
            </div>
            <div>
              <span>{{ t('settings.settingFileIndex.appDiagnosticItemIds') }}</span>
              <p>{{ formatAppDiagnosticList(appDiagnosticResult.index.itemIds, 4) }}</p>
            </div>
            <div>
              <span>{{ t('settings.settingFileIndex.appDiagnosticGeneratedKeywords') }}</span>
              <p>{{ formatAppDiagnosticList(appDiagnosticResult.index.generatedKeywords) }}</p>
            </div>
            <div>
              <span>{{ t('settings.settingFileIndex.appDiagnosticStoredKeywords') }}</span>
              <p>{{ formatAppDiagnosticList(appDiagnosticResult.index.storedKeywords) }}</p>
            </div>
          </div>

          <div v-if="appDiagnosticResult.query" class="app-diagnostic-stages">
            <div class="app-diagnostic-query">
              {{
                t('settings.settingFileIndex.appDiagnosticQueryMeta', {
                  query: appDiagnosticResult.query.normalized,
                  fts: appDiagnosticResult.query.ftsQuery || '-'
                })
              }}
            </div>
            <div class="app-diagnostic-stage-list">
              <button
                v-for="stageKey in APP_INDEX_DIAGNOSTIC_STAGE_KEYS"
                :key="stageKey"
                type="button"
                class="app-diagnostic-stage"
                :class="[
                  `is-${getAppDiagnosticStageTone(getAppDiagnosticStage(appDiagnosticResult, stageKey))}`,
                  { 'is-selected': selectedAppDiagnosticStage === stageKey }
                ]"
                @click="selectAppDiagnosticStage(stageKey)"
              >
                <strong>{{ getAppDiagnosticStageLabel(stageKey) }}</strong>
                <span>
                  {{
                    getAppDiagnosticStageStatus(
                      getAppDiagnosticStage(appDiagnosticResult, stageKey)
                    )
                  }}
                </span>
                <small>
                  {{
                    getAppDiagnosticStageDetail(
                      getAppDiagnosticStage(appDiagnosticResult, stageKey)
                    )
                  }}
                </small>
              </button>
            </div>

            <div v-if="selectedAppDiagnosticStageData" class="app-diagnostic-stage-detail">
              <div class="app-diagnostic-stage-detail-header">
                <strong>
                  {{
                    t('settings.settingFileIndex.appDiagnosticStageDetailTitle', {
                      stage: getAppDiagnosticStageLabel(selectedAppDiagnosticStageData.key)
                    })
                  }}
                </strong>
                <span>
                  {{
                    t('settings.settingFileIndex.appDiagnosticStageMatches', {
                      count: selectedAppDiagnosticStageData.stage?.matches.length ?? 0
                    })
                  }}
                </span>
              </div>
              <div
                v-if="selectedAppDiagnosticStageData.stage?.matches.length"
                class="app-diagnostic-stage-match-list"
              >
                <div
                  v-for="(match, matchIndex) in selectedAppDiagnosticStageData.stage.matches"
                  :key="`${match.itemId}-${matchIndex}`"
                  class="app-diagnostic-stage-match"
                >
                  <strong>{{ match.itemId }}</strong>
                  <span>{{ formatAppDiagnosticStageMatch(match) }}</span>
                </div>
              </div>
              <div v-else class="app-diagnostic-stage-empty">
                {{
                  selectedAppDiagnosticStageData.stage?.reason ||
                  t('settings.settingFileIndex.appDiagnosticEmpty')
                }}
              </div>
            </div>
          </div>
        </template>

        <div v-else class="app-diagnostic-error">
          {{
            t('settings.settingFileIndex.appDiagnosticNotFound', {
              status: appDiagnosticResult.status,
              reason: appDiagnosticResult.reason || '-'
            })
          }}
        </div>
      </div>
    </div>
  </TModal>
</template>

<style scoped>
.app-diagnostic {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-height: min(72vh, 680px);
  overflow: auto;
  padding-right: 2px;
}

.app-diagnostic-desc {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.app-diagnostic-form {
  display: flex;
}

.app-diagnostic-input {
  min-width: 0;
  width: 100%;
}

.app-diagnostic-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.app-diagnostic-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--tx-border-color-light);
  border-radius: 8px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 68%, transparent);
}

.app-diagnostic-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.app-diagnostic-header > div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.app-diagnostic-header strong,
.app-diagnostic-grid strong {
  color: var(--tx-text-color-primary);
  font-size: 12px;
  word-break: break-word;
}

.app-diagnostic-header span {
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  word-break: break-all;
}

.app-diagnostic-status {
  flex: none;
  padding: 3px 8px;
  border-radius: 8px;
  color: #34c759;
  background: rgba(52, 199, 89, 0.12);
  font-size: 11px;
  font-weight: 600;
}

.app-diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.app-diagnostic-grid > div {
  min-width: 0;
}

.app-diagnostic-grid span,
.app-diagnostic-query {
  display: block;
  color: var(--tx-text-color-secondary);
  font-size: 11px;
}

.app-diagnostic-grid p {
  margin: 3px 0 0;
  color: var(--tx-text-color-primary);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.app-diagnostic-stages {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.app-diagnostic-stage-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}

.app-diagnostic-stage {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  gap: 2px;
  min-width: 0;
  padding: 7px 8px;
  border-radius: 8px;
  border: 1px solid var(--stage-color);
  background: color-mix(in srgb, var(--stage-color) 10%, transparent);
  cursor: pointer;
  font: inherit;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.app-diagnostic-stage:hover,
.app-diagnostic-stage.is-selected {
  background: color-mix(in srgb, var(--stage-color) 18%, transparent);
}

.app-diagnostic-stage.is-selected {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--stage-color) 22%, transparent);
}

.app-diagnostic-stage.is-hit {
  --stage-color: rgba(52, 199, 89, 0.5);
}

.app-diagnostic-stage.is-miss {
  --stage-color: rgba(255, 59, 48, 0.46);
}

.app-diagnostic-stage.is-skipped {
  --stage-color: rgba(142, 142, 147, 0.35);
}

.app-diagnostic-stage strong {
  color: var(--tx-text-color-primary);
  font-size: 12px;
}

.app-diagnostic-stage span {
  color: var(--tx-text-color-primary);
  font-size: 11px;
  font-weight: 600;
}

.app-diagnostic-stage small {
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  word-break: break-word;
}

.app-diagnostic-stage-detail {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--tx-border-color-light);
  background: color-mix(in srgb, var(--tx-fill-color) 70%, transparent);
}

.app-diagnostic-stage-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.app-diagnostic-stage-detail-header strong {
  color: var(--tx-text-color-primary);
  font-size: 12px;
}

.app-diagnostic-stage-detail-header span,
.app-diagnostic-stage-empty {
  color: var(--tx-text-color-secondary);
  font-size: 11px;
}

.app-diagnostic-stage-match-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow: auto;
}

.app-diagnostic-stage-match {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 7px 8px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--tx-fill-color-light) 70%, transparent);
}

.app-diagnostic-stage-match strong {
  color: var(--tx-text-color-primary);
  font-size: 11px;
  word-break: break-all;
}

.app-diagnostic-stage-match span {
  color: var(--tx-text-color-secondary);
  font-size: 11px;
  word-break: break-word;
}

.app-diagnostic-error {
  color: #ff3b30;
  font-size: 12px;
  word-break: break-word;
}

@media (max-width: 720px) {
  .app-diagnostic-grid,
  .app-diagnostic-stage-list {
    grid-template-columns: 1fr;
  }
}
</style>
