interface MdNode {
  type: string
  lang?: string | null
  value?: string
  children?: MdNode[]
}

interface MdParent extends MdNode {
  children: MdNode[]
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function transformMermaidBlocks(parent: MdParent) {
  parent.children.forEach((node, index) => {
    if (node.type === 'code' && typeof node.lang === 'string' && node.lang.toLowerCase() === 'mermaid') {
      const content = escapeHtml(node.value ?? '')
      parent.children[index] = {
        type: 'html',
        value: `<div class="docs-mermaid mermaid">${content}</div>`,
      }
      return
    }

    if (node.children?.length)
      transformMermaidBlocks(node as MdParent)
  })
}

export function remarkMermaid() {
  return (tree: MdParent) => {
    if (!tree?.children?.length)
      return
    transformMermaidBlocks(tree)
  }
}

export default remarkMermaid
