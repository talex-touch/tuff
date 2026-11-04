<script setup lang="ts">
import type { FormEmits, FormProps } from './types'
import { computed, provide } from 'vue'
import { TX_FORM_CONTEXT_KEY, TX_FORM_FIELD_KEY, TX_FORM_SHELL_KEY } from './context'
import { useFormStore } from './use-form'

defineOptions({ name: 'TxForm' })

const props = withDefaults(defineProps<FormProps>(), {
  requiredMark: 'asterisk',
  validateOn: 'blur',
  size: 'medium',
  disabled: false,
  readonly: false,
  // Its type includes `false`, so without a default Vue reads a form that leaves it out as
  // `false`: never ask.
  leaveConfirm: undefined,
})

const emit = defineEmits<FormEmits>()

const store = useFormStore(props, emit)
const { formId, layout, labelAlign, announcement, summaryAttached, rootError, draft, notice } = store
const messages = store.context.messages

provide(TX_FORM_CONTEXT_KEY, store.context)
// The shell around this form is not one around a form further down.
provide(TX_FORM_SHELL_KEY, null)
// A control placed in the form but outside every item is not a field, yet it
// still takes the form's `disabled`, `readonly` and `size`.
provide(TX_FORM_FIELD_KEY, {
  controlId: undefined,
  labelId: undefined,
  messageId: undefined,
  hintId: undefined,
  label: '',
  labelledBy: 'for',
  invalid: false,
  required: false,
  get disabled() {
    return store.context.disabled.value
  },
  get readonly() {
    return store.context.readonly.value
  },
  get size() {
    return store.context.size.value
  },
  claim: () => false,
  adopt: () => {},
  release: () => {},
  protect: () => () => {},
})

const formStyle = computed(() => {
  const width = props.labelWidth
  if (width === undefined || width === '')
    return undefined
  return { '--tx-form-label-max': typeof width === 'number' ? `${width}px` : width }
})

const slotProps = computed(() => ({
  dirty: store.dirty.value,
  valid: store.valid.value,
  submitting: store.submitting.value,
  submitted: store.submitted.value,
  errors: store.errors.value,
  rootError: store.rootError.value,
}))

function onSubmit(event: Event) {
  void store.submit(event)
}

// The notice goes away with its buttons, so focus moves to the fields they changed.
function restoreFromNotice() {
  void store.restoreDraft(true)
}

function discardFromNotice() {
  void store.discardDraft(true)
}

defineExpose({
  dirty: store.dirty,
  valid: store.valid,
  submitting: store.submitting,
  submitted: store.submitted,
  errors: store.errors,
  rootError: store.rootError,
  validate: store.validate,
  validateField: store.validateField,
  submit: store.submit,
  reset: store.reset,
  /** Older name of `reset()`. */
  resetFields: store.reset,
  setBaseline: store.setBaseline,
  setErrors: store.setErrors,
  setRootError: store.setRootError,
  clearValidate: store.clearValidate,
  /** What the draft holds: the fields it filled in or still offers, when it was written, whether writing fails. */
  draft: store.draft,
  /** Writes the draft now; resolves once the store has it. */
  flush: store.flush,
  /** Call before leaving inside the app — a route change, a closing dialog. Resolves `true` to go. */
  confirmLeave: store.confirmLeave,
  /** Fills in the fields the draft still offers. Resolves whether any were. */
  restoreDraft: () => store.restoreDraft(),
  /** Puts the saved values back where the draft filled them in, and deletes the draft. */
  discardDraft: () => store.discardDraft(),
})
</script>

<template>
  <form
    :id="formId"
    class="tx-form"
    :class="[`tx-form--${layout}`, `tx-form--label-${labelAlign}`]"
    :style="formStyle"
    novalidate
    @submit.prevent="onSubmit"
    @reset.prevent="store.reset()"
  >
    <slot v-if="notice" name="draft" :draft="draft" :notice="notice" :restore="restoreFromNotice" :discard="discardFromNotice">
      <div class="tx-form__draft">
        <span>{{ notice }}</span>
        <button v-if="draft.pending.length" type="button" class="tx-form__draft-action" @click="restoreFromNotice">
          {{ messages.draftRestore }}
        </button>
        <button type="button" class="tx-form__draft-action" @click="discardFromNotice">
          {{ messages.draftDiscard }}
        </button>
      </div>
    </slot>
    <div class="tx-form__body">
      <slot v-bind="slotProps" />
    </div>
    <p v-if="rootError && !summaryAttached" class="tx-form__root-error" role="alert">
      {{ rootError }}
    </p>
    <div class="tx-form__status" role="status" aria-live="polite">
      {{ announcement }}
    </div>
  </form>
</template>

<style scoped lang="scss">
.tx-form {
  // The label column is as wide as the longest label, up to `labelWidth`.
  --tx-form-side-cols: [label] fit-content(min(40%, var(--tx-form-label-max, 16em))) [field] minmax(0, 1fr);

  min-width: 0;
}

// Only `auto` measures itself: a size container no longer takes its width
// from its content, so a form in a shrink-to-fit popover would collapse.
.tx-form--auto {
  container: tx-form / inline-size;
}

.tx-form__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  row-gap: var(--tx-form-gap, 20px);
}

.tx-form__body > :deep(*) {
  grid-column: 1 / -1;
}

.tx-form--side .tx-form__body {
  grid-template-columns: var(--tx-form-side-cols);
  column-gap: 12px;
}

// 520px: a 16em label column, the gap, and about 280px for the field. A
// container query cannot read a custom property, so the number lives here.
@container tx-form (inline-size >= 520px) {
  .tx-form--auto .tx-form__body {
    grid-template-columns: var(--tx-form-side-cols);
    column-gap: 12px;
  }
}

.tx-form--inline .tx-form__body {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px 16px;
}

.tx-form__draft {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 20px;
  color: var(--tx-text-color-regular, #606266);
}

.tx-form__draft-action {
  padding: 0;
  font: inherit;
  color: var(--tx-text-color-primary, #303133);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  background: none;
  border: 0;
  border-radius: 2px;

  &:focus-visible {
    outline: 2px solid var(--tx-color-primary, #409eff);
    outline-offset: 2px;
  }
}

.tx-form__root-error {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 20px;
  color: var(--tx-color-danger, #f56c6c);
}

.tx-form__status {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
