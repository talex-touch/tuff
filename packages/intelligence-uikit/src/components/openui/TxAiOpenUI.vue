<script setup lang="ts">
import type { ActionPlan, ASTNode, ElementNode, EvaluationContext, ParseResult } from '@openuidev/lang-core'
import type { VNodeChild } from 'vue'
import type { OpenUIAction } from './context'
import { ACTION_STEPS, createStore, createStreamingParser, evaluate } from '@openuidev/lang-core'
import { computed, defineComponent, h, onBeforeUnmount, onErrorCaptured, provide, ref, shallowRef, toRef, watch } from 'vue'
import { OPENUI_CONTEXT } from './context'
import { library } from './library'
import { createReactiveStoreBridge, evaluateElementOwnProps, isElementNode, resolveRootElement } from './reactive-runtime'
import './openui.css'

const props = withDefaults(defineProps<{
  content: string
  streaming?: boolean
  labels?: Record<string, string>
  resolveImage?: (query: string) => Promise<string | null>
}>(), { streaming: false, labels: () => ({}) })

const emit = defineEmits<{ action: [event: OpenUIAction] }>()

const schema = library.toJSONSchema()
const parser = createStreamingParser(schema)
const store = createStore()
const stateBridge = createReactiveStoreBridge(store)
const result = shallowRef<ParseResult | null>(null)
const error = ref('')

const functions: NonNullable<EvaluationContext['functions']> = {}
for (const [name, definition] of Object.entries(library.functions)) {
  functions[name] = { ...schema.functions?.[name], params: schema.functions![name]!.params, fn: definition.fn }
}

/** Reactive context used inside computed/render scopes for per-key dependency tracking. */
const reactiveEvaluationContext: EvaluationContext = {
  getState: name => stateBridge.get(name),
  resolveRef: () => null,
  functions,
  actions: schema.actions,
}

/** Non-reactive context used inside event handlers and action execution. */
const imperativeEvaluationContext: EvaluationContext = {
  getState: name => store.get(name),
  resolveRef: () => null,
  functions,
  actions: schema.actions,
}

function evaluateNode(node: ASTNode, extraScope?: Record<string, unknown>) {
  return evaluate(node, { ...imperativeEvaluationContext, extraScope })
}

function evaluateProps(typeName: string, rawProps: Record<string, unknown>) {
  return evaluateElementOwnProps(typeName, rawProps, reactiveEvaluationContext, library)
}

function notice(message: string) {
  error.value = message
}

const formFields = new Map<string, Set<() => { label: string, value: unknown }>>()
function registerField(form: string, read: () => { label: string, value: unknown }) {
  const fields = formFields.get(form) ?? new Set()
  fields.add(read)
  formFields.set(form, fields)
  return () => {
    fields.delete(read)
    if (!fields.size)
      formFields.delete(form)
  }
}

function trigger(plan: unknown, label = '', form = '') {
  if (props.streaming)
    return
  try {
    const formState = form
      ? Object.fromEntries([...(formFields.get(form) ?? [])].map((read) => {
          const field = read()
          return [field.label, field.value]
        }))
      : undefined
    const params = formState ? { formState } : undefined
    if (!plan) {
      emit('action', { type: 'continue_conversation', context: label, params })
      return
    }
    if (typeof plan !== 'object')
      return
    if ('steps' in plan && Array.isArray(plan.steps)) {
      for (const step of (plan as ActionPlan).steps) {
        switch (step.type) {
          case ACTION_STEPS.Set:
            if (step.valueAST)
              stateBridge.set(step.target, evaluateNode(step.valueAST))
            break
          case ACTION_STEPS.Reset:
            for (const target of step.targets)
              stateBridge.set(target, result.value?.stateDeclarations[target] ?? null, { pristine: true })
            break
          case ACTION_STEPS.ToAssistant:
            emit('action', {
              type: 'continue_conversation',
              context: step.message,
              params: { ...params, ...(step.context === undefined ? {} : { context: step.context }) },
            })
            break
          case ACTION_STEPS.OpenUrl:
            if (/^https?:\/\//i.test(step.url))
              emit('action', { type: 'open_url', params: { url: step.url } })
            break
          case ACTION_STEPS.Run:
            emit('action', { type: 'run', params: { statementId: step.statementId, refType: step.refType } })
            break
          case 'custom_action':
            emit('action', {
              type: step.name === 'CopyToClipboard' ? 'copy_to_clipboard' : step.name,
              params: step.params,
            })
            break
        }
      }
    }
    else if ('type' in plan && typeof plan.type === 'string') {
      const action = plan as OpenUIAction
      if (action.type !== 'open_url' || /^https?:\/\//i.test(String(action.params?.url)))
        emit('action', action)
    }
  }
  catch {
    notice(props.labels.actionError ?? 'This action could not be completed.')
  }
}

function renderNode(node: unknown, path = 'root'): VNodeChild {
  if (node == null || typeof node === 'boolean')
    return null
  if (Array.isArray(node))
    return node.map((child, i) => renderNode(child, `${path}.${i}`))
  if (typeof node === 'string' || typeof node === 'number')
    return String(node)
  if (!isElementNode(node))
    return null
  const element = node as ElementNode
  const definition = library.components[element.typeName]
  if (!definition)
    return null
  const key = element.statementId ? `${path}:${element.statementId}` : `${path}:${element.typeName}`
  return h(definition.component, {
    key,
    typeName: element.typeName,
    props: element.props,
    nodePath: path,
    statementId: element.statementId ?? path,
    'data-openui-node': element.statementId ?? path,
  })
}

provide(OPENUI_CONTEXT, {
  store,
  readState: name => stateBridge.get(name),
  writeState: (name, value, options) => stateBridge.set(name, value, options),
  evaluateProps,
  renderNode,
  streaming: toRef(props, 'streaming'),
  labels: toRef(props, 'labels'),
  resolveImage: query => props.resolveImage?.(query) ?? Promise.resolve(null),
  trigger,
  registerField,
  evaluate: evaluateNode,
  notice,
})

watch(() => [props.content, props.streaming] as const, ([content, streaming]) => {
  error.value = ''
  try {
    const parsed = parser.set(content, !streaming)
    stateBridge.initialize(parsed.stateDeclarations, {})
    result.value = parsed
    if (!streaming && (parsed.meta.errors.length || parsed.meta.incomplete || parsed.meta.unresolved.length))
      notice(props.labels.parseError ?? 'Some parts of this answer could not be rendered.')
  }
  catch {
    result.value = null
    if (!streaming)
      notice(props.labels.parseError ?? 'This answer could not be rendered.')
  }
}, { immediate: true })

const root = computed(() => resolveRootElement(result.value, reactiveEvaluationContext, library))

const Tree = defineComponent({
  name: 'OpenUITree',
  setup: () => () => renderNode(root.value),
})

onErrorCaptured(() => {
  notice(props.labels.renderError ?? 'Some parts of this answer could not be rendered.')
  return false
})

onBeforeUnmount(() => {
  stateBridge.dispose()
})
</script>

<template>
  <div class="tx-ai-openui" :aria-busy="streaming">
    <Tree />
    <p v-if="error" class="tx-ai-openui__notice" role="status" aria-live="polite">
      {{ error }}
    </p>
  </div>
</template>
