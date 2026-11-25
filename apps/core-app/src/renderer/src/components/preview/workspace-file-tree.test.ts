import type { WorkspaceFileEntry } from '@talex-touch/utils/transport/sdk/domains/agent-workspace'
import { describe, expect, it } from 'vitest'
import {
  buildPathBreadcrumbs,
  extractMarkdownHeadings,
  flattenFileTree,
  formatBatchCommentsPrompt,
  formatSingleSelectionPrompt,
  resolveAncestorDirectories
} from './workspace-file-tree'

describe('workspace-file-tree helpers', () => {
  it('builds workspace-relative breadcrumbs preserving full segment paths', () => {
    const crumbs = buildPathBreadcrumbs(
      '/Users/dev/talex-touch/docs/plan-prd/TODO-AI.md',
      '/Users/dev/talex-touch'
    )
    expect(crumbs).toEqual([
      { label: 'talex-touch', path: '/Users/dev/talex-touch', isLast: false },
      { label: 'docs', path: '/Users/dev/talex-touch/docs', isLast: false },
      { label: 'plan-prd', path: '/Users/dev/talex-touch/docs/plan-prd', isLast: false },
      { label: 'TODO-AI.md', path: '/Users/dev/talex-touch/docs/plan-prd/TODO-AI.md', isLast: true }
    ])
  })

  it('builds full POSIX breadcrumbs when outside workspaceRoot', () => {
    const crumbs = buildPathBreadcrumbs(
      '/Users/talexdreamsoul/.answer-me-with-html/pages/demo.html',
      '/Users/talexdreamsoul/Workspace/talex-touch'
    )
    expect(crumbs.map((c) => c.label)).toEqual([
      'Users',
      'talexdreamsoul',
      '.answer-me-with-html',
      'pages',
      'demo.html'
    ])
    expect(crumbs[3]?.path).toBe('/Users/talexdreamsoul/.answer-me-with-html/pages')
    expect(crumbs[4]?.isLast).toBe(true)
  })

  it('resolves ancestor directories for active file auto-reveal', () => {
    expect(resolveAncestorDirectories('/repo/apps/core/src/App.vue', '/repo')).toEqual([
      '/repo',
      '/repo/apps',
      '/repo/apps/core',
      '/repo/apps/core/src'
    ])

    expect(resolveAncestorDirectories('/repo/apps/core', '/repo', true)).toEqual([
      '/repo',
      '/repo/apps',
      '/repo/apps/core'
    ])
  })

  it('flattens tree entries with hidden-file toggle, expansion, and search filter', () => {
    const childrenByDir: Record<string, WorkspaceFileEntry[]> = {
      '/repo': [
        { name: '.git', path: '/repo/.git', isDirectory: true },
        { name: 'node_modules', path: '/repo/node_modules', isDirectory: true },
        { name: 'docs', path: '/repo/docs', isDirectory: true },
        { name: 'README.md', path: '/repo/README.md', isDirectory: false, size: 1024 }
      ],
      '/repo/docs': [
        { name: 'TODO-AI.md', path: '/repo/docs/TODO-AI.md', isDirectory: false, size: 37683 }
      ]
    }

    const base = flattenFileTree({
      rootPath: '/repo',
      childrenByDir,
      expandedDirs: new Set(['/repo/docs']),
      loadingDirs: new Set(),
      activePath: '/repo/docs/TODO-AI.md',
      showHidden: false
    })
    expect(base.map((r) => `${r.depth}:${r.name}:${r.isActive}`)).toEqual([
      '0:docs:false',
      '1:TODO-AI.md:true',
      '0:README.md:false'
    ])

    const withHidden = flattenFileTree({
      rootPath: '/repo',
      childrenByDir,
      expandedDirs: new Set(),
      loadingDirs: new Set(),
      showHidden: true
    })
    expect(withHidden.map((r) => r.name)).toEqual(['.git', 'node_modules', 'docs', 'README.md'])

    const filtered = flattenFileTree({
      rootPath: '/repo',
      childrenByDir,
      expandedDirs: new Set(),
      loadingDirs: new Set(),
      query: 'todo-ai'
    })
    expect(filtered.map((r) => r.name)).toEqual(['docs', 'TODO-AI.md'])
  })

  it('extracts markdown headings while ignoring fenced code blocks', () => {
    const md = [
      '# Tuff AI Stable TODO',
      '',
      '```md',
      '# Not a heading',
      '```',
      '',
      '## 当前口径',
      '### [Nexus](https://example.com) `P1`'
    ].join('\n')

    expect(extractMarkdownHeadings(md)).toEqual([
      { id: 'md-heading-0', level: 1, text: 'Tuff AI Stable TODO', index: 0 },
      { id: 'md-heading-1', level: 2, text: '当前口径', index: 1 },
      { id: 'md-heading-2', level: 3, text: 'Nexus P1', index: 2 }
    ])
  })

  it('formats single selection and batched review comment prompts cleanly', () => {
    const single = formatSingleSelectionPrompt({
      displayPath: 'docs/TODO-AI.md',
      selectedText: 'Line 1\nLine 2',
      instruction: '请解释这段'
    })
    expect(single).toBe('`docs/TODO-AI.md`\n> Line 1\n> Line 2\n\n请解释这段')

    const batch = formatBatchCommentsPrompt({
      displayPath: 'docs/TODO-AI.md',
      intro: '请处理评论',
      comments: [
        { id: '1', quote: 'A', comment: '改一下 A', createdAt: 1 },
        { id: '2', quote: 'B', comment: '补充 B', createdAt: 2 }
      ]
    })
    expect(batch).toBe('请处理评论 `docs/TODO-AI.md`：\n\n1.\n> A\n改一下 A\n\n2.\n> B\n补充 B')
  })
})
