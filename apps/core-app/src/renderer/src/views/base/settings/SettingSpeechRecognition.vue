<script setup lang="ts" name="SettingSpeechRecognition">
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxFilterChips } from '@talex-touch/tuffex/filter-chips'
import { TxTag } from '@talex-touch/tuffex/tag'
import { AssistantEvents } from '@talex-touch/utils/transport/events/assistant'
import { TxSelectItem } from '@talex-touch/tuffex/select'
import { useEventListener } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTuffTransport } from '@talex-touch/utils/transport'
import TuffBlockSlot from '~/components/tuff/TuffBlockSlot.vue'
import TuffGroupBlock from '~/components/tuff/TuffGroupBlock.vue'
import {
  DEFAULT_VOICE_HISTORY_RETENTION,
  ensureVoiceInputSetting,
  isVoiceHistoryRetentionActive,
  normalizeVoiceAsrSource,
  normalizeVoiceDictionaryEntries,
  normalizeVoiceHistoryRetention,
  normalizeVoicePolishStrength,
  VOICE_ASR_SOURCES,
  VOICE_HISTORY_RETENTION_OPTIONS,
  VOICE_POLISH_STRENGTHS,
  type VoiceAsrSource,
  type VoiceDictionaryEntry,
  type VoiceHistoryRetention,
  type VoiceInputSetting,
  type VoicePolishStrength
} from '@talex-touch/utils/common/storage/entity/app-settings'
import { TxFlatRadioItem } from '@talex-touch/tuffex/flat-radio'
import TuffBlockFlatRadio from '~/components/tuff/TuffBlockFlatRadio.vue'
import TuffBlockSelect from '~/components/tuff/TuffBlockSelect.vue'
import TuffBlockSwitch from '~/components/tuff/TuffBlockSwitch.vue'
import { appSetting } from '~/modules/storage/app-storage'
import VoiceProviderCatalogSettings from './VoiceProviderCatalogSettings.vue'
import SpeechModelSettings from './SpeechModelSettings.vue'

const { t } = useI18n()
const transport = useTuffTransport()
// Keep the hint hidden until main confirms an active macOS Globe action.
const globeKeyConflict = ref(false)
/**
 * Raised only by a handover that the system did not actually apply.
 *
 * The preference is the system's to keep, so a write that does not move it leaves the row in
 * place with nothing left to click. This is the signal that the manual route is worth showing.
 */
const globeKeyHandoverFailed = ref(false)

const voiceInputEnabled = computed({
  get: () => appSetting.voiceInput?.enabled === true,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    appSetting.voiceInput.enabled = value
    // Marks the choice as the user's, so a later sign-in leaves an explicit off alone.
    ;(appSetting.voiceInput as VoiceInputSetting).enabledSource = 'user'
  }
})
const voiceSource = computed({
  get: (): VoiceAsrSource =>
    normalizeVoiceAsrSource((appSetting.voiceInput as VoiceInputSetting).source),
  set: (value: string | number) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).source = normalizeVoiceAsrSource(value)
  }
})

/**
 * Says what the chosen state will actually do, because the three labels alone do not: nothing
 * tells the reader that 混合 falls back to the cloud, and that is the one thing they are choosing.
 */
const voiceSourceDescription = computed(() =>
  t(`settingSpeechRecognition.source.options.${voiceSource.value}.description`)
)

const historyEnabled = computed({
  get: () => isVoiceHistoryRetentionActive(appSetting.voiceInput as VoiceInputSetting | undefined),
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    const voiceInput = appSetting.voiceInput as VoiceInputSetting
    voiceInput.historyEnabled = value
    if (value) {
      if (normalizeVoiceHistoryRetention(voiceInput.historyRetention) === 'off') {
        voiceInput.historyRetention = DEFAULT_VOICE_HISTORY_RETENTION
      }
    } else {
      voiceInput.historyRetention = 'off'
    }
  }
})

const historyRetention = computed<VoiceHistoryRetention>({
  get: () => {
    const voiceInput = appSetting.voiceInput as VoiceInputSetting | undefined
    if (!isVoiceHistoryRetentionActive(voiceInput)) return 'off'
    return normalizeVoiceHistoryRetention(voiceInput?.historyRetention)
  },
  set: (value: VoiceHistoryRetention) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    const voiceInput = appSetting.voiceInput as VoiceInputSetting
    const normalized = normalizeVoiceHistoryRetention(value)
    voiceInput.historyRetention = normalized
    voiceInput.historyEnabled = normalized !== 'off'
  }
})

const historyRetentionItems = computed<FilterChipItem[]>(() =>
  VOICE_HISTORY_RETENTION_OPTIONS.map((option) => ({
    value: option,
    label: t(`settingSpeechRecognition.historyRetention.options.${option}`)
  }))
)

function selectHistoryRetention(value: FilterChipValue): void {
  historyRetention.value = normalizeVoiceHistoryRetention(value)
}

const polishEnabled = computed({
  get: () => (appSetting.voiceInput as VoiceInputSetting).polishEnabled !== false,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).polishEnabled = value
  }
})

const polishStrength = computed({
  get: (): VoicePolishStrength =>
    normalizeVoicePolishStrength((appSetting.voiceInput as VoiceInputSetting).polishStrength),
  set: (value: string | number) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).polishStrength =
      normalizeVoicePolishStrength(value)
  }
})

const polishStrengthDescription = computed(() =>
  t(`settingSpeechRecognition.polishStrength.options.${polishStrength.value}.description`)
)

const noiseSuppression = computed({
  get: () => (appSetting.voiceInput as VoiceInputSetting).noiseSuppression === true,
  set: (value: boolean) => {
    ensureVoiceInputSetting(appSetting as Record<string, unknown>)
    ;(appSetting.voiceInput as VoiceInputSetting).noiseSuppression = value
  }
})
const customWordsInput = ref('')
const editingDictionaryTerm = ref<string | null>(null)
const editingDictionaryDraft = ref('')

const dictionaryEntries = computed<VoiceDictionaryEntry[]>(() => {
  const voiceInput = appSetting.voiceInput as VoiceInputSetting | undefined
  return normalizeVoiceDictionaryEntries(voiceInput?.dictionaryEntries, voiceInput?.customWords)
})

function writeDictionaryEntries(entries: VoiceDictionaryEntry[]): void {
  ensureVoiceInputSetting(appSetting as Record<string, unknown>)
  const normalized = normalizeVoiceDictionaryEntries(entries)
  const voiceInput = appSetting.voiceInput as VoiceInputSetting
  voiceInput.dictionaryEntries = normalized
  voiceInput.customWords = normalized.map((entry) => entry.term)
}

function saveCustomWords(): void {
  const raw = customWordsInput.value
  if (!raw.trim()) return
  const now = Date.now()
  const additions: VoiceDictionaryEntry[] = []
  for (const part of raw.split(/[,，\n]/)) {
    const term = part.trim()
    if (term) additions.push({ term, source: 'manual', createdAt: now })
  }
  if (additions.length === 0) return
  writeDictionaryEntries([...dictionaryEntries.value, ...additions])
  customWordsInput.value = ''
}

function startEditDictionaryEntry(entry: VoiceDictionaryEntry): void {
  editingDictionaryTerm.value = entry.term
  editingDictionaryDraft.value = entry.term
}

function cancelEditDictionaryEntry(): void {
  editingDictionaryTerm.value = null
  editingDictionaryDraft.value = ''
}

function saveEditDictionaryEntry(originalTerm: string): void {
  const nextTerm = editingDictionaryDraft.value.trim()
  if (!nextTerm) return
  const nextEntries = dictionaryEntries.value.map((entry) =>
    entry.term === originalTerm ? { ...entry, term: nextTerm, source: 'manual' as const } : entry
  )
  writeDictionaryEntries(nextEntries)
  cancelEditDictionaryEntry()
}

function removeDictionaryEntry(term: string): void {
  if (editingDictionaryTerm.value === term) {
    cancelEditDictionaryEntry()
  }
  writeDictionaryEntries(dictionaryEntries.value.filter((entry) => entry.term !== term))
}

watch(
  () => appSetting.voiceInput,
  () => ensureVoiceInputSetting(appSetting as Record<string, unknown>),
  { immediate: true }
)

async function refreshGlobeKeyStatus(): Promise<void> {
  try {
    const status = await transport.send(AssistantEvents.voice.getGlobeKeyStatus)
    const conflicted = status.applies && status.systemActionActive
    globeKeyConflict.value = conflicted
    // A read knows nothing about a write, so it can only clear the fallback by resolving the row.
    if (!conflicted) globeKeyHandoverFailed.value = false
  } catch {
    // A settings page that cannot reach main has nothing to say about the system keyboard, and
    // a hint that appears on a transport failure would be noise.
    globeKeyConflict.value = false
    globeKeyHandoverFailed.value = false
  }
}

/**
 * Hands the key over on one click.
 *
 * Writing the preference applies immediately — the logout every document about this key insists
 * on turned out to be folklore. The status is re-read from the system rather than assumed, so a
 * write that does not stick leaves the row and its manual escape hatch on screen.
 */
async function disableGlobeKeyAction(): Promise<void> {
  try {
    const status = await transport.send(AssistantEvents.voice.disableGlobeKeyAction)
    const conflicted = status.applies && status.systemActionActive
    globeKeyConflict.value = conflicted
    globeKeyHandoverFailed.value = conflicted
  } catch {
    // The write did not reach the system, so all the row knows is what the read reports. A read
    // that still sees the conflict has to leave the manual route on screen: the key is exactly as
    // taken as it was before the click, and this was the one-click attempt that was meant to fix
    // it. Leaving the flag alone would hide the only way out.
    await refreshGlobeKeyStatus()
    globeKeyHandoverFailed.value = globeKeyConflict.value
  }
}

async function openKeyboardSettings(): Promise<void> {
  await transport.send(AssistantEvents.voice.openKeyboardSettings)
}

onMounted(() => {
  void refreshGlobeKeyStatus()
})

// The user changes this preference in another application, so the row has to be able to retire
// itself when they come back rather than waiting for a remount they have no reason to perform.
useEventListener(window, 'focus', () => {
  void refreshGlobeKeyStatus()
})
</script>

<template>
  <TuffGroupBlock
    class="VoiceInputSettings"
    :description="t('settingSpeechRecognition.description')"
    default-icon="i-carbon-microphone"
    active-icon="i-carbon-microphone-filled"
  >
    <TuffBlockFlatRadio
      v-model="voiceSource"
      data-testid="voice-source-selector"
      :title="t('settingSpeechRecognition.source.title')"
      :description="voiceSourceDescription"
      default-icon="i-carbon-connect-source"
      active-icon="i-carbon-connect"
    >
      <TxFlatRadioItem
        v-for="source in VOICE_ASR_SOURCES"
        :key="source"
        :value="source"
        :label="t(`settingSpeechRecognition.source.options.${source}.label`)"
      />
    </TuffBlockFlatRadio>
    <TuffBlockSwitch
      v-model="voiceInputEnabled"
      data-testid="voice-input-enabled-toggle"
      :title="t('settingSpeechRecognition.input.title')"
      :description="t('settingSpeechRecognition.input.description')"
      default-icon="i-carbon-microphone"
      active-icon="i-carbon-microphone-filled"
    />

    <!--
      Only while voice input is on: a machine that is not using Fn for dictation has no conflict
      to report, and this is a request to change a system preference, not a warning. The row
      offers one action — take the key. Opening System Settings is not a peer of it but the way
      out when that write does not stick, so it stays hidden until the handover has failed.
    -->
    <TuffBlockSlot
      v-if="voiceInputEnabled && globeKeyConflict"
      :title="t('settingSpeechRecognition.globeKey.title')"
      :description="t('settingSpeechRecognition.globeKey.description')"
      default-icon="i-carbon-keyboard"
      data-testid="voice-globe-key-hint"
    >
      <TxButton size="sm" data-testid="voice-disable-globe-key" @click.stop="disableGlobeKeyAction">
        {{ t('settingSpeechRecognition.globeKey.action') }}
      </TxButton>
      <TxButton
        v-if="globeKeyHandoverFailed"
        size="sm"
        variant="ghost"
        data-testid="voice-open-keyboard-settings"
        @click.stop="openKeyboardSettings"
      >
        {{ t('settingSpeechRecognition.globeKey.manual') }}
      </TxButton>
    </TuffBlockSlot>
    <TuffBlockSwitch
      v-model="polishEnabled"
      :title="t('settingSpeechRecognition.polish.title')"
      :description="t('settingSpeechRecognition.polish.description')"
      default-icon="i-carbon-magic-wand"
      active-icon="i-carbon-magic-wand-filled"
    />
    <TuffBlockSelect
      v-if="polishEnabled"
      v-model="polishStrength"
      :title="t('settingSpeechRecognition.polishStrength.title')"
      :description="polishStrengthDescription"
      default-icon="i-carbon-text-align-left"
    >
      <TxSelectItem v-for="strength in VOICE_POLISH_STRENGTHS" :key="strength" :value="strength">
        {{ t(`settingSpeechRecognition.polishStrength.options.${strength}.label`) }}
      </TxSelectItem>
    </TuffBlockSelect>
    <TuffBlockSwitch
      v-model="historyEnabled"
      :title="t('settingSpeechRecognition.history.title')"
      :description="t('settingSpeechRecognition.history.description')"
      default-icon="i-carbon-document-view"
      active-icon="i-carbon-document-view"
    />
    <TuffBlockSlot
      data-testid="voice-history-retention"
      default-icon="i-carbon-time"
      active-icon="i-carbon-time"
      :title="t('settingSpeechRecognition.historyRetention.title')"
      :description="t('settingSpeechRecognition.historyRetention.description')"
    >
      <TxFilterChips
        role="toolbar"
        :aria-label="t('settingSpeechRecognition.historyRetention.title')"
        :items="historyRetentionItems"
        :model-value="historyRetention"
        data-testid="voice-history-retention-chips"
        @update:model-value="selectHistoryRetention"
      />
    </TuffBlockSlot>
    <TuffBlockSwitch
      v-model="noiseSuppression"
      data-testid="voice-noise-suppression"
      :title="t('settingSpeechRecognition.noiseSuppression.title')"
      :description="t('settingSpeechRecognition.noiseSuppression.description')"
      default-icon="i-carbon-waveform"
      active-icon="i-carbon-waveform"
    />
    <TuffBlockSlot
      data-testid="voice-custom-words"
      default-icon="i-carbon-character-patterns"
      active-icon="i-carbon-character-patterns"
      :title="t('settingSpeechRecognition.customWords.title', '热词与专有词库')"
      :description="
        t(
          'settingSpeechRecognition.customWords.description',
          '输入专用术语、人名或英文缩写（逗号分隔），提高语音识别与AI润色准确率'
        )
      "
    >
      <div class="VoiceDictionary">
        <div class="VoiceDictionary-InputRow">
          <input
            v-model="customWordsInput"
            class="custom-words-input"
            type="text"
            :placeholder="
              t(
                'settingSpeechRecognition.customWords.placeholder',
                '例如: SGLang, vLLM, DeepSeek, Qwen'
              )
            "
            @change="saveCustomWords"
            @keydown.enter.prevent="saveCustomWords"
          />
          <TxButton
            size="sm"
            variant="flat"
            :disabled="!customWordsInput.trim()"
            data-testid="voice-dictionary-add"
            @click.stop="saveCustomWords"
          >
            {{ t('settingSpeechRecognition.customWords.add') }}
          </TxButton>
        </div>

        <ul
          v-if="dictionaryEntries.length > 0"
          class="VoiceDictionary-List"
          data-testid="voice-dictionary-list"
          :aria-label="t('settingSpeechRecognition.customWords.ariaList')"
        >
          <li
            v-for="entry in dictionaryEntries"
            :key="entry.term"
            class="VoiceDictionary-Item"
            data-testid="voice-dictionary-item"
          >
            <template v-if="editingDictionaryTerm === entry.term">
              <input
                v-model="editingDictionaryDraft"
                class="VoiceDictionary-EditInput"
                type="text"
                data-testid="voice-dictionary-edit-input"
                @keydown.enter.prevent="saveEditDictionaryEntry(entry.term)"
                @keydown.esc.prevent="cancelEditDictionaryEntry"
              />
              <div class="VoiceDictionary-ItemActions">
                <TxButton
                  size="sm"
                  :disabled="!editingDictionaryDraft.trim()"
                  data-testid="voice-dictionary-save"
                  @click.stop="saveEditDictionaryEntry(entry.term)"
                >
                  {{ t('settingSpeechRecognition.customWords.save') }}
                </TxButton>
                <TxButton
                  size="sm"
                  variant="ghost"
                  data-testid="voice-dictionary-cancel"
                  @click.stop="cancelEditDictionaryEntry"
                >
                  {{ t('settingSpeechRecognition.customWords.cancel') }}
                </TxButton>
              </div>
            </template>
            <template v-else>
              <span class="VoiceDictionary-Term">{{ entry.term }}</span>
              <TxTag
                size="sm"
                :variant="entry.source === 'auto' ? 'soft' : 'plain'"
                data-testid="voice-dictionary-source"
                :data-source="entry.source"
              >
                {{ t(`settingSpeechRecognition.customWords.source.${entry.source}`) }}
              </TxTag>
              <div class="VoiceDictionary-ItemActions">
                <TxButton
                  size="sm"
                  variant="bare"
                  :aria-label="
                    t('settingSpeechRecognition.customWords.editAria', { term: entry.term })
                  "
                  data-testid="voice-dictionary-edit"
                  @click.stop="startEditDictionaryEntry(entry)"
                >
                  {{ t('settingSpeechRecognition.customWords.edit') }}
                </TxButton>
                <TxButton
                  size="sm"
                  variant="bare"
                  type="danger"
                  :aria-label="
                    t('settingSpeechRecognition.customWords.removeAria', { term: entry.term })
                  "
                  data-testid="voice-dictionary-remove"
                  @click.stop="removeDictionaryEntry(entry.term)"
                >
                  {{ t('settingSpeechRecognition.customWords.remove') }}
                </TxButton>
              </div>
            </template>
          </li>
        </ul>
        <p v-else class="VoiceDictionary-Empty" data-testid="voice-dictionary-empty">
          {{ t('settingSpeechRecognition.customWords.empty') }}
        </p>
      </div>
    </TuffBlockSlot>
  </TuffGroupBlock>
  <VoiceProviderCatalogSettings />
  <SpeechModelSettings :source="voiceSource" />
</template>

<style scoped lang="scss">
.VoiceInputSettings {
  :deep(.TBlockSlot-Container) {
    height: auto;
    min-height: 56px;
    padding-block: 12px;
  }

  :deep(.TBlockSlot-Content) {
    height: auto;
  }

  :deep(.TBlockSlot-TitleRow h5) {
    margin: 0;
  }

  :deep(.TBlockSlot-Label > p) {
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .VoiceDictionary {
    display: grid;
    gap: 8px;
    width: min(100%, 420px);
  }

  .VoiceDictionary-InputRow {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .custom-words-input,
  .VoiceDictionary-EditInput {
    flex: 1 1 auto;
    min-width: 0;
    padding: 6px 10px;
    font-size: 13px;
    border-radius: 6px;
    border: 1px solid var(--border-color, rgba(128, 128, 128, 0.2));
    background: var(--surface-color, rgba(255, 255, 255, 0.05));
    color: inherit;
    outline: none;
    transition: border-color 0.15s ease;

    &:focus {
      border-color: var(--primary-color, #409eff);
    }
  }

  .VoiceDictionary-List {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .VoiceDictionary-Item {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 4px 8px;
    border-radius: 6px;
    border: 1px solid var(--border-color, rgba(128, 128, 128, 0.16));
    background: var(--surface-color, rgba(255, 255, 255, 0.03));
  }

  .VoiceDictionary-Term {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .VoiceDictionary-ItemActions {
    display: flex;
    gap: 4px;
    align-items: center;
    flex: none;
  }

  .VoiceDictionary-Empty {
    margin: 0;
    font-size: 12px;
    opacity: 0.65;
  }
}
</style>
