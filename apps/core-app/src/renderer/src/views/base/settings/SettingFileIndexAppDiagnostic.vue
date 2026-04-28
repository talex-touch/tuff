<script setup lang="ts" name="SettingFileIndexAppDiagnostic">
import type {
  AppIndexDiagnoseResult,
  AppIndexDiagnosticStage,
  AppIndexReindexRequest
} from '@talex-touch/utils/transport/events/types'
import { TxButton, TxInput } from '@talex-touch/tuffex'
import { useSettingsSdk } from '@talex-touch/utils/renderer'
import { h, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import { popperMention } from '~/modules/mention/dialog-mention'
import RebuildConfirmDialog from './components/RebuildConfirmDialog.vue'
import { resolveIndexRebuildOutcome } from './index-rebuild-flow'

const { t } = useI18n()
const settingsSdk = useSettingsSdk()

const appDiagnosticTarget = ref('')
const appDiagnosticQuery = ref('')
const appDiagnosticLoading = ref(false)
const appDiagnosticReindexMode = ref<AppIndexReindexRequest['mode'] | null>(null)
const appDiagnosticResult = ref<AppIndexDiagnoseResult | null>(null)

const APP_DIAGNOSTIC_STAGE_KEYS = [
  'precise',
  'phrase',
  'prefix',
  'fts',
  'ngram',
  'subsequence'
] as const
type AppDiagnosticStageKey = (typeof APP_DIAGNOSTIC_STAGE_KEYS)[number]

function updateAppDiagnosticTarget(value: string | number) {
  appDiagnosticTarget.value = String(value ?? '')
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

function getAppDiagnosticStageLabel(key: AppDiagnosticStageKey) {
  return t(`settings.settingFileIndex.appDiagnosticStage.${key}`)
}

function getAppDiagnosticStage(result: AppIndexDiagnoseResult | null, key: AppDiagnosticStageKey) {
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

async function openAppReindexConfirm() {
  await new Promise<void>((resolve, reject) => {
    popperMention(t('settings.settingFileIndex.rebuildTitle'), () =>
      h(RebuildConfirmDialog, {
        battery: null,
        onConfirm: () => resolve(),
        onCancel: () => reject(new Error('Cancelled'))
      })
    )
  })
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
    console.error('[SettingFileIndex] Failed to diagnose app search:', error)
    appDiagnosticResult.value = null
    if (!options.silent) toast.error(t('settings.settingFileIndex.appDiagnosticFailed'))
  } finally {
    appDiagnosticLoading.value = false
  }
}

async function reindexAppDiagnosticTarget(mode: AppIndexReindexRequest['mode']) {
  const target = normalizeAppDiagnosticTarget()
  if (!target) {
    toast.error(t('settings.settingFileIndex.appDiagnosticTargetRequired'))
    return
  }

  appDiagnosticReindexMode.value = mode
  try {
    const preflight = await settingsSdk.appIndex.reindex({ target, mode })
    const preflightOutcome = resolveIndexRebuildOutcome(preflight, {
      success: t('settings.settingFileIndex.appDiagnosticReindexSuccess'),
      failure: t('settings.settingFileIndex.appDiagnosticReindexFailed')
    })

    if (preflightOutcome.type === 'failure') {
      toast.error(preflightOutcome.message)
      return
    }

    if (preflightOutcome.type === 'success') {
      toast.success(preflightOutcome.message)
      await runAppSearchDiagnostic({ silent: true })
      return
    }

    if (preflightOutcome.type === 'confirm') {
      try {
        await openAppReindexConfirm()
      } catch {
        return
      }

      const forced = await settingsSdk.appIndex.reindex({ target, mode, force: true })
      const forcedOutcome = resolveIndexRebuildOutcome(forced, {
        success: t('settings.settingFileIndex.appDiagnosticReindexSuccess'),
        failure: t('settings.settingFileIndex.appDiagnosticReindexFailed')
      })
      if (forcedOutcome.type !== 'success') {
        toast.error(
          forcedOutcome.type === 'failure'
            ? forcedOutcome.message
            : t('settings.settingFileIndex.appDiagnosticReindexFailed')
        )
        return
      }

      toast.success(forcedOutcome.message)
      await runAppSearchDiagnostic({ silent: true })
    }
  } catch (error) {
    console.error('[SettingFileIndex] Failed to reindex app target:', error)
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
                v-for="stageKey in APP_DIAGNOSTIC_STAGE_KEYS"
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
