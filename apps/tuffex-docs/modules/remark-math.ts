/**
 * Renders TeX written between dollar signs with KaTeX at build/parse time.
 * Pages ship zero KaTeX JS; `LazyDocsKatexStyles` loads `katex.min.css` only when `hasMath` is true.
 */
import { math } from 'micromark-extension-math'

interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
}

interface MathNode extends MdNode {
  type: 'math' | 'inlineMath'
  value: string
  raw: string
  display: boolean
}

type Token = object

interface CompileContext {
  stack: MdNode[]
  data: Record<string, unknown>
  config: {
    enter: { data: (this: CompileContext, token: Token) => void }
    exit: { data: (this: CompileContext, token: Token) => void }
  }
  enter: (node: MdNode, token: Token) => void
  exit: (token: Token) => void
  buffer: () => void
  resume: () => string
  sliceSerialize: (token: Token) => string
}

interface Processor {
  data: () => Record<string, unknown[] | undefined>
}

function exitMathData(this: CompileContext, token: Token) {
  this.config.enter.data.call(this, token)
  this.config.exit.data.call(this, token)
}

function closeMathNode(context: CompileContext, token: Token, value: string) {
  const node = context.stack[context.stack.length - 1] as MathNode
  context.exit(token)
  node.value = value
  node.raw = context.sliceSerialize(token)
  return node
}

const mathFromMarkdown = {
  enter: {
    mathFlow(this: CompileContext, token: Token) {
      this.enter({ type: 'math', value: '', raw: '', display: true } as MathNode, token)
    },
    mathFlowFenceMeta(this: CompileContext) {
      this.buffer()
    },
    mathText(this: CompileContext, token: Token) {
      this.enter({ type: 'inlineMath', value: '', raw: '', display: false } as MathNode, token)
      this.buffer()
    },
  },
  exit: {
    mathFlow(this: CompileContext, token: Token) {
      closeMathNode(this, token, this.resume().replace(/^\r?\n|\r?\n$/g, ''))
      this.data.mathFlowInside = undefined
    },
    mathFlowFence(this: CompileContext) {
      if (this.data.mathFlowInside)
        return
      this.buffer()
      this.data.mathFlowInside = true
    },
    mathFlowFenceMeta(this: CompileContext) {
      this.resume()
    },
    mathFlowValue: exitMathData,
    mathText(this: CompileContext, token: Token) {
      const node = closeMathNode(this, token, this.resume())
      node.display = node.raw.startsWith('$$')
    },
    mathTextData: exitMathData,
  },
}

function isMathNode(node: MdNode): node is MathNode {
  return node.type === 'math' || node.type === 'inlineMath'
}

function isFormula(node: MathNode, next: MdNode | undefined) {
  if (!node.value.trim())
    return false
  if (node.display)
    return true
  if (/^\$\s|\s\$$/.test(node.raw))
    return false
  return !(next?.type === 'text' && /^\w/.test(next.value ?? ''))
}

function writtenText(node: MathNode): MdNode {
  const text: MdNode = { type: 'text', value: node.raw.replace(/\\([!-/:-@[-`{-~])/g, '$1') }
  return node.type === 'math' ? { type: 'paragraph', children: [text] } : text
}

function collectMathNodes(parent: MdNode, found: Array<{ parent: MdNode, index: number }>) {
  parent.children?.forEach((child, index) => {
    if (isMathNode(child))
      found.push({ parent, index })
    else
      collectMathNodes(child, found)
  })
}

export function remarkMath(this: Processor, _options?: { revision?: string }) {
  const data = this.data()
  ;(data.micromarkExtensions ??= []).push(math())
  ;(data.fromMarkdownExtensions ??= []).push(mathFromMarkdown)

  return async (tree: MdNode) => {
    const found: Array<{ parent: MdNode, index: number }> = []
    collectMathNodes(tree, found)
    if (!found.length)
      return

    const { default: katex } = await import('katex')
    const render = (node: MathNode): MdNode => {
      try {
        return {
          type: 'html',
          value: katex.renderToString(node.value, { displayMode: node.display, strict: 'ignore' }),
        }
      }
      catch {
        return writtenText(node)
      }
    }

    for (const { parent, index } of found) {
      const siblings = parent.children!
      const node = siblings[index] as MathNode
      siblings[index] = isFormula(node, siblings[index + 1]) ? render(node) : writtenText(node)
    }
  }
}

export default remarkMath
