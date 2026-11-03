<script setup lang="ts">
import type {
  FormField,
  FormFieldValue,
  FormSpec
} from '@talex-touch/utils/transport/sdk/domains/agent-tools'
import type { TxSelectModelValue, TxSelectOption } from '@talex-touch/tuffex/select'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxCheckbox } from '@talex-touch/tuffex/checkbox'
import { TxInput } from '@talex-touch/tuffex/input'
import { TxSelect } from '@talex-touch/tuffex/select'
import { computed, ref, watch } from 'vue'

defineOptions({ name: 'TxAiToolForm' })

/**
 * Renders a validated form spec produced by the `tuff_render_form` tool.
 *
 * The spec is declarative and was checked in the main process, so nothing the
 * model wrote is executed here — this maps fixed fields onto tuffex inputs.
 * Captions default to English and are overridable, so the host passes its own
 * translations without this component reaching for the locale itself.
 */
const props = withDefaults(
  defineProps<{
    spec: FormSpec
    /** Locks the card as already answered, for a conversation re-rendered from history. */
    submitted?: boolean
    /**
     * A previously typed draft, laid over the spec defaults at mount. The host
     * keeps drafts because a virtualized transcript unmounts this card — and
     * its half-typed state — the moment it scrolls far enough away.
     */
    initialValues?: Record<string, FormFieldValue>
    /** Fallback when the spec carries no `submitLabel`. */
    submitLabel?: string
    resetLabel?: string
    requiredHint?: string
    submittedLabel?: string
    selectPlaceholder?: string
  }>(),
  {
    submitted: false,
    initialValues: undefined,
    submitLabel: 'Submit',
    resetLabel: 'Reset',
    requiredHint: 'This field is required',
    submittedLabel: 'Submitted',
    selectPlaceholder: 'Select an option'
  }
)

const emit = defineEmits<{
  submit: [values: Record<string, FormFieldValue>]
  /** Fires on every edit so the host's draft never trails what is on screen. */
  change: [values: Record<string, FormFieldValue>]
}>()

const values = ref<Record<string, FormFieldValue>>(seedValues())
const missingKeys = ref<string[]>([])
const sent = ref(false)

const isSubmitted = computed(() => props.submitted || sent.value)
const submitText = computed(() => props.spec.submitLabel?.trim() || props.submitLabel)

function defaultValues(): Record<string, FormFieldValue> {
  const initial: Record<string, FormFieldValue> = {}
  for (const field of props.spec.fields) {
    if (field.type === 'checkbox') initial[field.key] = field.default === true
    else initial[field.key] = field.default ?? ''
  }
  return initial
}

/** Defaults overlaid with the host's draft — but only keys the spec knows. */
function seedValues(): Record<string, FormFieldValue> {
  const seed = defaultValues()
  for (const field of props.spec.fields) {
    const draft = props.initialValues?.[field.key]
    if (draft === undefined) continue
    if (field.type === 'checkbox') {
      if (typeof draft === 'boolean') seed[field.key] = draft
    } else if (typeof draft !== 'boolean') {
      seed[field.key] = draft
    }
  }
  return seed
}

function publish(): void {
  emit('change', { ...values.value })
}

// Keyed by content rather than identity: the host recomputes the spec object
// while parsing the tool result, and resetting on every parent render would
// wipe what the user is halfway through typing. A real spec change invalidates
// any draft, so the reset is published too.
watch(
  () => JSON.stringify(props.spec),
  () => {
    values.value = defaultValues()
    missingKeys.value = []
    sent.value = false
    publish()
  }
)

function labelId(key: string): string {
  return `tool-form-${key}`
}

/** Text-shaped fields; a boolean can only land here through a bad default. */
function textValue(field: FormField): string | number {
  const value = values.value[field.key]
  return typeof value === 'boolean' ? '' : (value ?? '')
}

function selectValue(field: FormField): string | number {
  const value = values.value[field.key]
  return typeof value === 'boolean' ? '' : (value ?? '')
}

function checkedValue(field: FormField): boolean {
  return values.value[field.key] === true
}

/** `select` and `checkbox` have their own controls and never reach this. */
function inputType(field: FormField): 'text' | 'textarea' | 'number' {
  return field.type === 'textarea' || field.type === 'number' ? field.type : 'text'
}

function selectOptions(field: FormField): TxSelectOption[] {
  return (field.options ?? []).map((option) => ({ value: option, label: option }))
}

function setValue(field: FormField, value: FormFieldValue | TxSelectModelValue): void {
  // Only the multi-select mode emits an array, and no field asks for it.
  values.value[field.key] = Array.isArray(value) ? (value[0] ?? '') : value
  missingKeys.value = missingKeys.value.filter((key) => key !== field.key)
  publish()
}

function isBlank(field: FormField): boolean {
  const value = values.value[field.key]
  // A required checkbox is a consent box: unticked is unanswered.
  if (field.type === 'checkbox') return value !== true
  return value === undefined || value === null || value === ''
}

function collect(): Record<string, FormFieldValue> {
  const answers: Record<string, FormFieldValue> = {}
  for (const field of props.spec.fields) {
    const value = values.value[field.key] ?? ''
    if (field.type !== 'number' || value === '') {
      answers[field.key] = value
      continue
    }
    // The input hands back text; unparseable text stays text so the reader sees
    // what was typed rather than a NaN.
    const numeric = Number(value)
    answers[field.key] = Number.isFinite(numeric) ? numeric : String(value)
  }
  return answers
}

function submit(): void {
  if (isSubmitted.value) return

  const blank = props.spec.fields.filter((field) => field.required && isBlank(field))
  missingKeys.value = blank.map((field) => field.key)
  if (blank.length > 0) return

  sent.value = true
  emit('submit', collect())
}

function reset(): void {
  if (isSubmitted.value) return
  // Back to spec defaults, not to the seed: reset is "discard my draft".
  values.value = defaultValues()
  missingKeys.value = []
  publish()
}
</script>

<template>
  <form class="tx-ai-tool-form" novalidate @submit.prevent="submit">
    <header v-if="spec.title || spec.description" class="tx-ai-tool-form-Header">
      <h4 v-if="spec.title" class="tx-ai-tool-form-Title">
        {{ spec.title }}
      </h4>
      <p v-if="spec.description" class="tx-ai-tool-form-Desc">
        {{ spec.description }}
      </p>
    </header>

    <div
      v-for="field in spec.fields"
      :key="field.key"
      class="tx-ai-tool-form-Field"
      :class="{ 'is-inline': field.type === 'checkbox' }"
    >
      <span :id="labelId(field.key)" class="tx-ai-tool-form-Label">
        {{ field.label }}
        <span v-if="field.required" class="tx-ai-tool-form-Required" aria-hidden="true">*</span>
      </span>

      <TxCheckbox
        v-if="field.type === 'checkbox'"
        :model-value="checkedValue(field)"
        :disabled="isSubmitted"
        :aria-labelledby="labelId(field.key)"
        @update:model-value="(value: boolean) => setValue(field, value)"
      />
      <TxSelect
        v-else-if="field.type === 'select'"
        :model-value="selectValue(field)"
        :options="selectOptions(field)"
        :placeholder="field.placeholder || selectPlaceholder"
        :disabled="isSubmitted"
        :status="missingKeys.includes(field.key) ? 'error' : 'default'"
        :aria-labelledby="labelId(field.key)"
        @update:model-value="(value: TxSelectModelValue) => setValue(field, value)"
      />
      <TxInput
        v-else
        :model-value="textValue(field)"
        :type="inputType(field)"
        :placeholder="field.placeholder || ''"
        :rows="3"
        :disabled="isSubmitted"
        :aria-labelledby="labelId(field.key)"
        @update:model-value="(value: string | number) => setValue(field, value)"
      />

      <p v-if="missingKeys.includes(field.key)" class="tx-ai-tool-form-Error" role="alert">
        {{ requiredHint }}
      </p>
    </div>

    <footer class="tx-ai-tool-form-Actions">
      <TxButton native-type="submit" variant="primary" size="sm" :disabled="isSubmitted">
        {{ submitText }}
      </TxButton>
      <TxButton v-if="!isSubmitted" native-type="button" variant="ghost" size="sm" @click="reset">
        {{ resetLabel }}
      </TxButton>
      <span v-else class="tx-ai-tool-form-Sent" role="status">{{ submittedLabel }}</span>
    </footer>
  </form>
</template>

<style lang="scss" scoped>
.tx-ai-tool-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
}

.tx-ai-tool-form-Header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tx-ai-tool-form-Title {
  margin: 0;
  color: var(--shell-text-primary, var(--tx-text-color-primary));
  font-size: var(--shell-fs-md, 14px);
  font-weight: 600;
}

.tx-ai-tool-form-Desc {
  margin: 0;
  color: var(--shell-text-muted, var(--tx-text-color-secondary));
  font-size: var(--shell-fs-sm, 13px);
}

.tx-ai-tool-form-Field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;

  &.is-inline {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }
}

.tx-ai-tool-form-Label {
  color: var(--shell-text-secondary, var(--tx-text-color-regular));
  font-size: var(--shell-fs-sm, 13px);
}

.tx-ai-tool-form-Required {
  color: var(--shell-danger, var(--tx-color-danger));
}

.tx-ai-tool-form-Error {
  margin: 0;
  color: var(--shell-danger, var(--tx-color-danger));
  font-size: var(--shell-fs-sm, 13px);
}

.tx-ai-tool-form-Actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tx-ai-tool-form-Sent {
  color: var(--shell-text-muted, var(--tx-text-color-secondary));
  font-size: var(--shell-fs-sm, 13px);
}
</style>
