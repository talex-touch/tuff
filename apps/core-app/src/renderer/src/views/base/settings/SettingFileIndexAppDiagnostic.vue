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
const appDiagnosticQuery = ref('')
const appDiagnosticLoading = ref(false)
const appDiagnosticReindexMode = ref<AppIndexReindexRequest['mode'] | null>(null)
const appDiagnosticResult = ref<AppIndexDiagnoseResult | null>(null)
const appDiagnosticLastReindexResult = ref<AppIndexReindexResult | null>(null)
const appDiagnosticEvidenceReady = computed(() => Boolean(appDiagnosticResult.value))

function updateAppDiagnosticTarget(value: string | number) {
  appDiagnosticTarget.value = String(value ?? '')
  appDiagnosticLastReindexResult.value = null
}

function updateAppDiagnosticQuery(value: string | number) {
  appDiagnosticQuery.value = String(value ?? '')
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

function buildCurrentAppDiagnosticEvidence() {
  if (!appDiagnosticResult.value) return null

  return buildAppIndexDiagnosticEvidencePayload({
    target: normalizeAppDiagnosticTarget(),
    query: appDiagnosticQuery.value.trim(),
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
      query: appDiagnosticQuery.value.trim() || undefined
    })

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
  >
    <div class="app-diagnostic">
      <div class="app-diagnostic-form">
        <TxInput
          :model-value="appDiagnosticTarget"
          :placeholder="t('settings.settingFileIndex.appDiagnosticTargetPlaceholder')"
          class="app-diagnostic-input"
          @update:model-value="updateAppDiagnosticTarget"
        />
        <TxInput
          :model-value="appDiagnosticQuery"
          :placeholder="t('settings.settingFileIndex.appDiagnosticQueryPlaceholder')"
          class="app-diagnostic-input"
          @update:model-value="updateAppDiagnosticQuery"
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
              <div
                v-for="stageKey in APP_INDEX_DIAGNOSTIC_STAGE_KEYS"
                :key="stageKey"
                class="app-diagnostic-stage"
                :class="`is-${getAppDiagnosticStageTone(getAppDiagnosticStage(appDiagnosticResult, stageKey))}`"
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
  </TuffBlockSlot>
</template>
