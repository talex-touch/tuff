import type { ActionPlan, ASTNode, ElementNode, EvaluationContext, Library, ParseResult, Store } from '@openuidev/lang-core'
import type { ShallowRef } from 'vue'
import { evaluate, isReactiveAssign, isReactiveSchema } from '@openuidev/lang-core'
import { shallowRef } from 'vue'

const AST_KINDS = new Set([
  'Comp',
  'Str',
  'Num',
  'Bool',
  'Null',
  'Arr',
  'Obj',
  'Ref',
  'Ph',
  'StateRef',
  'RuntimeRef',
  'BinOp',
  'UnaryOp',
  'Ternary',
  'Member',
  'Index',
  'Assign',
])

export interface ReactiveStoreBridge {
  /** Reads a single state variable with fine-grained Vue reactivity tracking. */
  get: (name: string) => unknown
  /** Writes a state variable through the underlying store and syncs only changed keys. */
  set: (name: string, value: unknown, options?: { pristine?: boolean }) => void
  /** Initializes defaults/persisted state and syncs only changed keys. */
  initialize: (defaults: Record<string, unknown>, persisted: Record<string, unknown>) => void
  /** Synchronizes any external store mutations into per-key signals. */
  sync: () => void
  /** Tears down store subscription and clears signals. */
  dispose: () => void
}

/**
 * Mirrors `@openuidev/lang-core`'s coarse `store.subscribe()` into per-key Vue
 * `shallowRef` signals so mutating `$foo` only invalidates reactive scopes that
 * read `$foo`.
 */
export function createReactiveStoreBridge(store: Store): ReactiveStoreBridge {
  const signals = new Map<string, ShallowRef<unknown>>()

  function ensureSignal(name: string): ShallowRef<unknown> {
    let signal = signals.get(name)
    if (!signal) {
      signal = shallowRef(store.get(name))
      signals.set(name, signal)
    }
    return signal
  }

  function sync() {
    const snapshot = store.getSnapshot()
    for (const [key, next] of Object.entries(snapshot)) {
      const existing = signals.get(key)
      if (!existing) {
        signals.set(key, shallowRef(next))
      }
      else if (!Object.is(existing.value, next)) {
        existing.value = next
      }
    }
    for (const [key, signal] of signals) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, key) && signal.value !== undefined)
        signal.value = undefined
    }
  }

  const unsubscribe = store.subscribe(sync)

  return {
    get(name: string) {
      return ensureSignal(name).value
    },
    set(name: string, value: unknown, options?: { pristine?: boolean }) {
      store.set(name, value, options)
    },
    initialize(defaults: Record<string, unknown>, persisted: Record<string, unknown>) {
      store.initialize(defaults, persisted)
    },
    sync,
    dispose() {
      unsubscribe()
      store.dispose()
      signals.clear()
    },
  }
}

export function isASTNode(value: unknown): value is ASTNode {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { k?: unknown }).k === 'string'
    && AST_KINDS.has((value as { k: string }).k)
}

export function isElementNode(value: unknown): value is ElementNode {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const node = value as Record<string, unknown>
  return node.type === 'element'
    && typeof node.typeName === 'string'
    && typeof node.props === 'object'
    && node.props !== null
    && typeof node.partial === 'boolean'
}

function isActionPlan(value: unknown): value is ActionPlan {
  return typeof value === 'object' && value !== null && Array.isArray((value as ActionPlan).steps)
}

function toLiteralAST(value: unknown): ASTNode {
  if (value === null || value === undefined)
    return { k: 'Null' }
  if (typeof value === 'string')
    return { k: 'Str', v: value }
  if (typeof value === 'number')
    return { k: 'Num', v: value }
  if (typeof value === 'boolean')
    return { k: 'Bool', v: value }
  if (Array.isArray(value))
    return { k: 'Arr', els: value.map(toLiteralAST) }
  if (typeof value === 'object') {
    return {
      k: 'Obj',
      entries: Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toLiteralAST(v)]),
    }
  }
  return { k: 'Null' }
}

/**
 * Mirrors `@openuidev/lang-core`'s loop-variable substitution so deferred
 * expressions (like `@Set` inside `@Each`) keep concrete item values without
 * eagerly evaluating child components.
 */
function substituteRef(node: ASTNode, varName: string, value: unknown): ASTNode {
  switch (node.k) {
    case 'Ref':
      return node.n === varName ? toLiteralAST(value) : node
    case 'Member': {
      if (isASTNode(node.obj)) {
        const subObj = substituteRef(node.obj, varName, value)
        if (subObj.k === 'Obj') {
          const entry = subObj.entries.find(([k]) => k === node.field)
          if (entry)
            return entry[1]
        }
        return { ...node, obj: subObj }
      }
      return node
    }
    case 'Index':
      return {
        ...node,
        obj: isASTNode(node.obj) ? substituteRef(node.obj, varName, value) : node.obj,
        index: isASTNode(node.index) ? substituteRef(node.index, varName, value) : node.index,
      }
    case 'BinOp':
      return {
        ...node,
        left: substituteRef(node.left, varName, value),
        right: substituteRef(node.right, varName, value),
      }
    case 'UnaryOp':
      return { ...node, operand: substituteRef(node.operand, varName, value) }
    case 'Ternary':
      return {
        ...node,
        cond: substituteRef(node.cond, varName, value),
        then: substituteRef(node.then, varName, value),
        else: substituteRef(node.else, varName, value),
      }
    case 'Arr':
      return { ...node, els: node.els.map(el => substituteRef(el, varName, value)) }
    case 'Obj':
      return { ...node, entries: node.entries.map(([k, v]) => [k, substituteRef(v, varName, value)]) }
    case 'Comp': {
      const sub = (arg: ASTNode) => substituteRef(arg, varName, value)
      const mappedProps = node.mappedProps
        ? Object.fromEntries(Object.entries(node.mappedProps).map(([k, v]) => [k, sub(v)]))
        : undefined
      return {
        ...node,
        args: node.args.map(sub),
        ...(mappedProps ? { mappedProps } : {}),
      }
    }
    case 'Assign':
      return { ...node, value: substituteRef(node.value, varName, value) }
    default:
      return node
  }
}

function isComponentComp(
  node: Extract<ASTNode, { k: 'Comp' }>,
  context: EvaluationContext,
  library: Library,
): boolean {
  if (node.fn || !node.mappedProps)
    return false
  if (context.functions && Object.prototype.hasOwnProperty.call(context.functions, node.name))
    return false
  if (context.actions && Object.prototype.hasOwnProperty.call(context.actions, node.name))
    return false
  return Object.prototype.hasOwnProperty.call(library.components, node.name)
}

function toUnevaluatedElement(node: Extract<ASTNode, { k: 'Comp' }>): ElementNode {
  return {
    type: 'element',
    typeName: node.name,
    props: node.mappedProps ? { ...node.mappedProps } : {},
    partial: false,
    hasDynamicProps: true,
  }
}

/**
 * Evaluates a single AST expression without recursing into component calls
 * (`Comp` with `mappedProps`). Returned child components remain unevaluated
 * `ElementNode`s so each Vue primitive evaluates its own props inside its own
 * fine-grained reactive scope.
 */
export function evaluateAstShallow(
  node: ASTNode,
  context: EvaluationContext,
  library: Library,
  reactiveSchema?: unknown,
): unknown {
  if (node.k === 'StateRef' && reactiveSchema && isReactiveSchema(reactiveSchema)) {
    return {
      __reactive: 'assign',
      target: node.n,
      expr: { k: 'StateRef', n: '$value' },
    }
  }

  if (node.k === 'Ternary') {
    const branch = evaluate(node.cond, context) ? node.then : node.else
    return evaluateAstShallow(branch, context, library, reactiveSchema)
  }

  if (node.k === 'BinOp' && (node.op === '&&' || node.op === '||')) {
    const left = evaluateAstShallow(node.left, context, library, reactiveSchema)
    if (node.op === '&&')
      return left ? evaluateAstShallow(node.right, context, library, reactiveSchema) : left
    return left || evaluateAstShallow(node.right, context, library, reactiveSchema)
  }

  if (node.k === 'Arr')
    return node.els.map(el => evaluateAstShallow(el, context, library, reactiveSchema))

  if (node.k === 'Obj') {
    return Object.fromEntries(
      node.entries.map(([k, v]) => [k, evaluateAstShallow(v, context, library, reactiveSchema)]),
    )
  }

  if (node.k === 'Comp') {
    if (node.name === 'Each') {
      if (node.args.length < 3)
        return []
      const arr = evaluate(node.args[0]!, context)
      if (!Array.isArray(arr))
        return []
      const varArg = node.args[1]!
      const varName = varArg.k === 'Ref' ? varArg.n : varArg.k === 'Str' ? varArg.v : null
      if (!varName)
        return []
      const template = node.args[2]!
      return arr.map((item) => {
        const substituted = substituteRef(template, varName, item)
        const childCtx: EvaluationContext = {
          ...context,
          resolveRef: refName => (refName === varName ? item : context.resolveRef(refName)),
        }
        return evaluateAstShallow(substituted, childCtx, library, reactiveSchema)
      })
    }

    if (isComponentComp(node, context, library))
      return toUnevaluatedElement(node)
  }

  const result = evaluate(node, context, { library })
  if (isReactiveAssign(result) && !(reactiveSchema && isReactiveSchema(reactiveSchema)))
    return context.getState(result.target) ?? null
  return result
}

function evaluatePropShallow(
  value: unknown,
  context: EvaluationContext,
  library: Library,
  reactiveSchema?: unknown,
): unknown {
  if (value == null || typeof value !== 'object')
    return value
  if (isElementNode(value))
    return value
  if (isActionPlan(value))
    return value
  if (isASTNode(value))
    return evaluateAstShallow(value, context, library, reactiveSchema)

  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const evaluated = evaluatePropShallow(item, context, library, reactiveSchema)
      if (!Object.is(evaluated, item))
        changed = true
      return evaluated
    })
    return changed ? next : value
  }

  const entries = Object.entries(value as Record<string, unknown>)
  let changed = false
  const next: Record<string, unknown> = {}
  for (const [k, v] of entries) {
    const evaluated = typeof v === 'object' && v !== null
      ? evaluatePropShallow(v, context, library, reactiveSchema)
      : v
    if (!Object.is(evaluated, v))
      changed = true
    next[k] = evaluated
  }
  return changed ? next : value
}

/**
 * Evaluates only the immediate props of one OpenUI element without descending
 * into nested `ElementNode`s. Static props keep referential identity.
 */
export function evaluateElementOwnProps(
  typeName: string,
  rawProps: Record<string, unknown>,
  context: EvaluationContext,
  library: Library,
): Record<string, unknown> {
  const def = library.components[typeName]
  const shape = def?.props?.shape as Record<string, unknown> | undefined
  let changed = false
  const evaluated: Record<string, unknown> = {}

  for (const [key, rawValue] of Object.entries(rawProps)) {
    const propSchema = shape?.[key]
    try {
      const next = evaluatePropShallow(rawValue, context, library, propSchema)
      evaluated[key] = next
      if (!Object.is(next, rawValue))
        changed = true
    }
    catch {
      evaluated[key] = rawValue
    }
  }

  return changed ? evaluated : rawProps
}

/**
 * Resolves the root `ElementNode` from a `ParseResult` without eagerly
 * evaluating descendant props.
 */
export function resolveRootElement(
  parsed: ParseResult | null,
  context: EvaluationContext,
  library: Library,
): ElementNode | null {
  if (!parsed)
    return null
  if (parsed.root)
    return parsed.root
  if (!parsed.rootExpression)
    return null
  try {
    const value = evaluateAstShallow(parsed.rootExpression, context, library)
    return isElementNode(value) ? value : null
  }
  catch {
    return null
  }
}
