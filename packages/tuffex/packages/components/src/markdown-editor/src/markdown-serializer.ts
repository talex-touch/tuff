function isElement(node: Node): node is HTMLElement {
  return node.nodeType === Node.ELEMENT_NODE
}

function textOf(node: Node): string {
  return node.textContent?.replace(/\u00a0/g, ' ') ?? ''
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function serializeChildren(element: Element): string {
  return Array.from(element.childNodes)
    .map(node => serializeNode(node))
    .join('')
}

function serializeInlineChildren(element: Element): string {
  return normalizeInline(serializeChildren(element))
}

function normalizeInline(value: string): string {
  return value
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function serializeList(element: HTMLElement, ordered: boolean, depth = 0): string {
  const items = Array.from(element.children).filter(child => child.tagName.toLowerCase() === 'li')
  const indent = '  '.repeat(depth)

  return `${items.map((item, index) => {
    const marker = ordered ? `${index + 1}.` : '-'
    let inline = ''
    let nested = ''

    for (const child of Array.from(item.childNodes)) {
      if (isElement(child) && ['ul', 'ol'].includes(child.tagName.toLowerCase())) {
        nested += `\n${serializeList(child, child.tagName.toLowerCase() === 'ol', depth + 1).trimEnd()}`
        continue
      }

      inline += serializeNode(child)
    }

    return `${indent}${marker} ${normalizeInline(inline)}${nested}`
  }).join('\n')}\n\n`
}

function serializeTable(element: HTMLElement): string {
  const rows = Array.from(element.querySelectorAll('tr'))
    .map(row => Array.from(row.children).map(cell => normalizeInline(serializeChildren(cell))))
    .filter(row => row.length > 0)

  if (!rows.length)
    return ''

  const header = rows[0]
  const separator = header.map(() => '---')
  const body = rows.slice(1)
  const lines = [header, separator, ...body].map(row => `| ${row.join(' | ')} |`)

  return `${lines.join('\n')}\n\n`
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE)
    return textOf(node)

  if (!isElement(node))
    return ''

  const tag = node.tagName.toLowerCase()

  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag.slice(1))
    return `${'#'.repeat(level)} ${serializeInlineChildren(node)}\n\n`
  }

  switch (tag) {
    case 'strong':
    case 'b':
      return `**${serializeInlineChildren(node)}**`
    case 'em':
    case 'i':
      return `*${serializeInlineChildren(node)}*`
    case 's':
    case 'del':
    case 'strike':
      return `~~${serializeInlineChildren(node)}~~`
    case 'code':
      if (node.parentElement?.tagName.toLowerCase() === 'pre')
        return textOf(node)
      return `\`${textOf(node).replace(/`/g, '\\`')}\``
    case 'pre':
      return `\`\`\`\n${textOf(node).replace(/\n+$/g, '')}\n\`\`\`\n\n`
    case 'blockquote':
      return `${normalizeMarkdown(serializeChildren(node)).split('\n').map(line => (line ? `> ${line}` : '>')).join('\n')}\n\n`
    case 'ul':
      return serializeList(node, false)
    case 'ol':
      return serializeList(node, true)
    case 'li':
      return `- ${serializeInlineChildren(node)}\n`
    case 'a': {
      const href = node.getAttribute('href') ?? ''
      return href ? `[${serializeInlineChildren(node)}](${href})` : serializeInlineChildren(node)
    }
    case 'img': {
      const src = node.getAttribute('src') ?? ''
      const alt = node.getAttribute('alt') ?? ''
      return src ? `![${alt}](${src})` : ''
    }
    case 'br':
      return '\n'
    case 'hr':
      return '---\n\n'
    case 'table':
      return serializeTable(node)
    case 'p':
    case 'div':
    case 'section':
      return `${serializeInlineChildren(node)}\n\n`
    default:
      return serializeChildren(node)
  }
}

export function serializeMarkdown(root: HTMLElement): string {
  return normalizeMarkdown(serializeChildren(root))
}
