import type { ConversationMessage } from '~/modules/conversation/useHomeConversation'
import { describe, expect, it } from 'vitest'
import {
  applyCanvasRevisionToSource,
  computeCanvasLineDiff,
  computeChangedBlockIndices,
  extractCanvasRevisionFromReply,
  findTargetAssistantMessage,
  inspectMessageFileWrites,
  isClaimedDiskUpdateReply,
  isMessageStreamingCanvasEdit,
  isStreamingTurnTargetingFile,
  locateSelectionInSource
} from './workspace-canvas-edit'

const NAMELESS_STORY_SOURCE = [
  '# 无名',
  '',
  '醒来时，名字丢了。',
  '',
  '不是遗忘——是删除。像被橡皮擦过的纸页，平整，干净，连痕迹都不留。',
  '',
  '"她是谁？"他问。',
  '',
  '系统沉默了三秒。',
  '',
  '"没有这个人。"',
  '',
  '他重新启动飞船。航线不变。',
  '',
  '继续向无。',
  ''
].join('\n')

describe('workspace-canvas-edit', () => {
  it('locates multi-paragraph rendered selections inside raw Markdown even with curly quotes', () => {
    const renderedSelection = [
      '醒来时，名字丢了。',
      '不是遗忘——是删除。像被橡皮擦过的纸页，平整，干净，连痕迹都不留。',
      '“她是谁？”他问。',
      '系统沉默了三秒。',
      '“没有这个人。”',
      '他重新启动飞船。航线不变。',
      '继续向无。'
    ].join('\n')

    const match = locateSelectionInSource(NAMELESS_STORY_SOURCE, renderedSelection)
    expect(match).not.toBeNull()
    expect(NAMELESS_STORY_SOURCE.slice(match!.start, match!.end)).toContain('醒来时，名字丢了。')
    expect(NAMELESS_STORY_SOURCE.slice(match!.start, match!.end)).toContain('继续向无。')
    expect(NAMELESS_STORY_SOURCE.slice(0, match!.start)).toBe('# 无名\n\n')
  })

  it('extracts fenced revision and strips accidental blockquote prefixes echoed by LLMs', () => {
    const aiReply = [
      '- "他重新启动飞船。航线不变。继续向无。" -> "他重启飞船。航向未改。继续，向无。"',
      '',
      '### 润色后完整文本',
      '',
      '```markdown',
      '> 醒来时，名字丢了。',
      '>',
      '> 不是遗忘——是抹除。如被橡皮擦净的纸页，平整，留白。',
      '>',
      '> “她是谁？”他问。',
      '>',
      '> 系统沉默三秒。',
      '>',
      '> “查无此人。”',
      '>',
      '> 他重启飞船。航向未改。',
      '>',
      '> 继续，向无。',
      '```',
      '',
      '### 修改效果总结',
      '- 留白感更克制。'
    ].join('\n')

    const selected = [
      '醒来时，名字丢了。',
      '不是遗忘——是删除。像被橡皮擦过的纸页，平整，干净，连痕迹都不留。',
      '"她是谁？"他问。',
      '系统沉默了三秒。',
      '"没有这个人。"',
      '他重新启动飞船。航线不变。',
      '继续向无。'
    ].join('\n')

    const extracted = extractCanvasRevisionFromReply(aiReply, {
      originalSource: NAMELESS_STORY_SOURCE,
      selectedText: selected,
      fileExt: 'md'
    })
    expect(extracted).not.toBeNull()
    expect(extracted).not.toContain('> ')
    expect(extracted).toContain('“查无此人。”')
    expect(extracted).toContain('继续，向无。')

    const applied = applyCanvasRevisionToSource(NAMELESS_STORY_SOURCE, selected, extracted!)
    expect(applied).not.toBeNull()
    expect(applied!.changed).toBe(true)
    expect(applied!.nextContent.startsWith('# 无名\n\n醒来时，名字丢了。')).toBe(true)
    expect(applied!.nextContent).toContain('“查无此人。”')
    expect(applied!.nextContent).toContain('继续，向无。')
    expect(applied!.nextContent.endsWith('\n')).toBe(true)
  })

  it('avoids duplicating leading document heading when AI returns full text including H1', () => {
    const selected =
      '醒来时，名字丢了。\n\n不是遗忘——是删除。像被橡皮擦过的纸页，平整，干净，连痕迹都不留。'
    const revision = '# 无名\n\n醒来时，名字丢了。\n\n不是遗忘——是抹除。'
    const applied = applyCanvasRevisionToSource(NAMELESS_STORY_SOURCE, selected, revision)
    expect(applied).not.toBeNull()
    expect(applied!.nextContent.match(/# 无名/g)).toHaveLength(1)
    expect(applied!.nextContent).toContain('不是遗忘——是抹除。')
    expect(applied!.nextContent).toContain('"她是谁？"他问。')
  })

  it('splices single-sentence partial edits without touching surrounding text', () => {
    const selected = '像被橡皮擦过的纸页，平整，干净，连痕迹都不留。'
    const applied = applyCanvasRevisionToSource(
      NAMELESS_STORY_SOURCE,
      selected,
      '如被橡皮擦拭过的纸页，平整、干净，不留半分痕迹。'
    )
    expect(applied).not.toBeNull()
    expect(applied!.mode).toBe('selection')
    expect(applied!.nextContent).toContain(
      '不是遗忘——是删除。如被橡皮擦拭过的纸页，平整、干净，不留半分痕迹。'
    )
    expect(applied!.nextContent).toContain('"没有这个人。"')
  })

  it('refuses to overwrite file when reply contains only commentary suggestions without fenced rewrite', () => {
    const commentaryOnly = [
      '### 修改建议',
      '- "系统沉默了三秒。" -> "系统沉默三秒。"（更克制）',
      '- "没有这个人。" -> "查无此人。"（更有冷感）'
    ].join('\n')

    const extracted = extractCanvasRevisionFromReply(commentaryOnly, {
      originalSource: NAMELESS_STORY_SOURCE,
      selectedText: '系统沉默了三秒。',
      fileExt: 'md'
    })
    expect(extracted).toBeNull()

    const fabricatedStatus =
      '已直接更新文件 `无名.md`（工具返回 `success: true`）。\n\n文件已落盘，可直接查看。'
    expect(isClaimedDiskUpdateReply(fabricatedStatus)).toBe(true)
    expect(
      extractCanvasRevisionFromReply(fabricatedStatus, {
        originalSource: NAMELESS_STORY_SOURCE,
        selectedText: '系统沉默了三秒。',
        fileExt: 'md'
      })
    ).toBeNull()
  })

  it('computes accurate line diffs and changed rendered block indices', () => {
    const diff = computeCanvasLineDiff(
      '# 无名\n\n系统沉默了三秒。\n\n继续向无。',
      '# 无名\n\n系统沉默三秒。\n\n继续，向无。'
    )
    expect(diff.additions).toBe(2)
    expect(diff.deletions).toBe(2)
    expect(diff.changedNewLines.has(3)).toBe(true)
    expect(diff.changedNewLines.has(5)).toBe(true)
    expect(diff.changedNewLines.has(1)).toBe(false)

    const blocks = computeChangedBlockIndices(
      ['无名', '系统沉默了三秒。', '继续向无。'],
      ['无名', '系统沉默三秒。', '继续，向无。']
    )
    expect(Array.from(blocks)).toEqual([1, 2])
  })

  it('tracks newly spawned assistant messages, file write tool calls, and streaming fences', () => {
    const prior: ConversationMessage[] = [
      { id: 'u1', role: 'user', content: 'write story', status: 'complete' },
      { id: 'a1', role: 'assistant', content: 'done', status: 'complete' }
    ]
    const baseline = {
      knownMessageIds: new Set(prior.map((m) => m.id)),
      initialCount: prior.length
    }

    expect(findTargetAssistantMessage(prior, baseline)).toBeNull()

    const nextMessages: ConversationMessage[] = [
      ...prior,
      { id: 'u2', role: 'user', content: 'optimize', status: 'complete' },
      {
        id: 'a2',
        role: 'assistant',
        content: '```markdown\n新文本',
        status: 'streaming',
        parts: [
          {
            type: 'tool-call',
            id: 'tc-1',
            name: 'file.write',
            status: 'running',
            input: '{"path":"无名.md"}'
          }
        ]
      }
    ]
    const target = findTargetAssistantMessage(nextMessages, baseline)
    expect(target?.id).toBe('a2')
    expect(inspectMessageFileWrites(target!, '无名.md')).toEqual({
      running: true,
      completedCount: 0,
      unknownRunning: false,
      unknownCompletedCount: 0
    })
    expect(isMessageStreamingCanvasEdit(target!)).toBe(true)
  })

  it('detects ambient streaming turns targeting the open file while ignoring unrelated chat prompts', () => {
    const fileIdentity = {
      fileName: '无名.md',
      displayPath: 'docs/无名.md',
      filePath: '/tmp/space/docs/无名.md'
    }

    // 1. User mentions the open file directly while AI is streaming.
    expect(
      isStreamingTurnTargetingFile(
        [
          {
            id: 'u1',
            role: 'user',
            content: '帮我把 无名.md 的结尾改得更克制一点',
            status: 'complete'
          },
          { id: 'a1', role: 'assistant', content: '', status: 'streaming' }
        ],
        fileIdentity,
        true
      )
    ).toBe(true)

    // 2. User implicitly asks to edit the current document without repeating the filename.
    expect(
      isStreamingTurnTargetingFile(
        [
          { id: 'u1', role: 'user', content: '帮我再润色一下这篇文章', status: 'complete' },
          { id: 'a1', role: 'assistant', content: '', status: 'streaming' }
        ],
        fileIdentity,
        true
      )
    ).toBe(true)

    // 3. Tool call reads/writes the open file during streaming.
    expect(
      isStreamingTurnTargetingFile(
        [
          { id: 'u1', role: 'user', content: '继续处理刚才的任务', status: 'complete' },
          {
            id: 'a1',
            role: 'assistant',
            content: '',
            status: 'streaming',
            parts: [
              {
                type: 'tool-call',
                id: 'tc-read',
                name: 'file.read',
                status: 'running',
                input: '{"path":"/tmp/space/docs/无名.md"}'
              }
            ]
          }
        ],
        fileIdentity,
        true
      )
    ).toBe(true)

    // 4. Unrelated chat question does NOT lock the open file.
    expect(
      isStreamingTurnTargetingFile(
        [
          { id: 'u1', role: 'user', content: '今天东京天气怎么样？', status: 'complete' },
          { id: 'a1', role: 'assistant', content: '今天东京多云。', status: 'streaming' }
        ],
        fileIdentity,
        true
      )
    ).toBe(false)

    // 5. Idle conversation never reports active streaming target.
    expect(
      isStreamingTurnTargetingFile(
        [
          { id: 'u1', role: 'user', content: '帮我把 无名.md 润色一下', status: 'complete' },
          { id: 'a1', role: 'assistant', content: '已完成。', status: 'complete' }
        ],
        fileIdentity,
        false
      )
    ).toBe(false)
  })

  it('rejects ambiguous duplicate selections without sourceRange and targets exact occurrence when sourceRange is supplied', () => {
    const duplicateDoc = '# Notes\n\nRepeat me.\n\nMiddle paragraph.\n\nRepeat me.\n'
    expect(locateSelectionInSource(duplicateDoc, 'Repeat me.')).toBeNull()
    expect(applyCanvasRevisionToSource(duplicateDoc, 'Repeat me.', 'Updated second.')).toBeNull()

    const crlfDoc = duplicateDoc.replace(/\n/g, '\r\n')
    expect(locateSelectionInSource(crlfDoc, 'Repeat me.')).toBeNull()

    const secondStart = duplicateDoc.lastIndexOf('Repeat me.')
    const secondEnd = secondStart + 'Repeat me.'.length
    const targeted = applyCanvasRevisionToSource(duplicateDoc, 'Repeat me.', 'Updated second.', {
      sourceRange: { start: secondStart, end: secondEnd }
    })
    expect(targeted).not.toBeNull()
    expect(targeted!.nextContent).toBe(
      '# Notes\n\nRepeat me.\n\nMiddle paragraph.\n\nUpdated second.\n'
    )
  })

  it('splices partial formatted selections cleanly without replacing the whole line or corrupting link/formatting syntax', () => {
    const formattedLine = 'Keep **this** phrase intact.'
    const partial = applyCanvasRevisionToSource(formattedLine, 'this phrase', 'that wording')
    expect(partial).not.toBeNull()
    expect(partial!.nextContent).toBe('Keep that wording intact.')

    const multiline = 'Prefix *alpha*\n\n**beta** suffix'
    const multiPartial = applyCanvasRevisionToSource(multiline, 'alpha\nbeta', 'gamma\n\ndelta')
    expect(multiPartial).not.toBeNull()
    expect(multiPartial!.nextContent).toBe('Prefix gamma\n\ndelta suffix')

    // Absorb a complete Markdown link cleanly without touching trailing text.
    const wholeLink = applyCanvasRevisionToSource(
      'Keep [link](https://example.com) here',
      'Keep link',
      'Use reference'
    )
    expect(wholeLink).not.toBeNull()
    expect(wholeLink!.nextContent).toBe('Use reference here')

    // Reject selections that straddle half a Markdown link or formatting pair.
    expect(
      locateSelectionInSource('Keep [link text](https://example.com) here', 'Keep link')
    ).toBeNull()
    expect(locateSelectionInSource('Keep **bold text** here', 'Keep bold')).toBeNull()
  })

  it('does not fall back to unstructured prose replies when no revision tag or fenced block is present', () => {
    const refusal = "I can't revise that passage without more context."
    expect(
      extractCanvasRevisionFromReply(refusal, {
        originalSource: 'Keep this paragraph.',
        selectedText: 'Keep this paragraph.',
        fileExt: 'md'
      })
    ).toBeNull()

    const tagged = '<tuff-canvas-edit>\nTighter paragraph.\n</tuff-canvas-edit>'
    expect(
      extractCanvasRevisionFromReply(tagged, {
        originalSource: 'Keep this paragraph.',
        selectedText: 'Keep this paragraph.',
        fileExt: 'md'
      })
    ).toBe('Tighter paragraph.')
  })

  it('refuses full-document replacement on unmatched selection scope unless scope is explicitly document', () => {
    const source = '# Notes\n\nKeep this.'
    expect(
      applyCanvasRevisionToSource(source, 'This is a different paragraph.', 'Replacement.')
    ).toBeNull()

    const explicitFull = applyCanvasRevisionToSource(source, source, '# Notes\n\nRewritten.', {
      scope: 'document'
    })
    expect(explicitFull).not.toBeNull()
    expect(explicitFull!.mode).toBe('document')
    expect(explicitFull!.nextContent).toBe('# Notes\n\nRewritten.')
  })

  it('matches file-write tool calls by target path and ignores unrelated files or same-basename folders', () => {
    const identity = {
      fileName: 'notes.md',
      displayPath: 'dirB/notes.md',
      filePath: '/repo/dirB/notes.md'
    }

    const otherFileMsg: ConversationMessage = {
      id: 'a-other',
      role: 'assistant',
      content: '',
      status: 'complete',
      parts: [
        {
          type: 'tool-call',
          id: 'tc-other',
          name: 'file.write',
          status: 'done',
          input: '{"path":"other.md"}'
        },
        {
          type: 'tool-call',
          id: 'tc-dir-a',
          name: 'file.write',
          status: 'done',
          input: '{"path":"dirA/notes.md"}'
        }
      ]
    }
    expect(inspectMessageFileWrites(otherFileMsg, identity)).toEqual({
      running: false,
      completedCount: 0,
      unknownRunning: false,
      unknownCompletedCount: 0
    })

    const matchingMsg: ConversationMessage = {
      id: 'a-match',
      role: 'assistant',
      content: '',
      status: 'complete',
      parts: [
        {
          type: 'tool-call',
          id: 'tc-match',
          name: 'file.write',
          status: 'done',
          input: '{"path":"dirB/notes.md"}'
        },
        {
          type: 'tool-call',
          id: 'tc-unknown',
          name: 'file.write',
          status: 'done',
          input: '{}'
        }
      ]
    }
    expect(inspectMessageFileWrites(matchingMsg, identity)).toEqual({
      running: false,
      completedCount: 1,
      unknownRunning: false,
      unknownCompletedCount: 1
    })

    // Running file.write targeting another file must not lock the open file.
    expect(
      isStreamingTurnTargetingFile(
        [
          { id: 'u1', role: 'user', content: '继续处理刚才的任务', status: 'complete' },
          {
            id: 'a1',
            role: 'assistant',
            content: '',
            status: 'streaming',
            parts: [
              {
                type: 'tool-call',
                id: 'tc-run-other',
                name: 'file.write',
                status: 'running',
                input: '{"path":"other.md"}'
              }
            ]
          }
        ],
        identity,
        true
      )
    ).toBe(false)
  })

  it('binds findTargetAssistantMessage strictly to the matching Canvas user turn', () => {
    const prior: ConversationMessage[] = [
      { id: 'u1', role: 'user', content: 'write story', status: 'complete' }
    ]
    const canvasPrompt = '[Canvas prompt for 无名.md]\n> 原文'
    const baseline = {
      knownMessageIds: new Set(prior.map((m) => m.id)),
      initialCount: prior.length,
      requestPrompt: canvasPrompt
    }

    // Assistant reply to a prior turn (no new user message) must be ignored.
    const priorTurnReply: ConversationMessage[] = [
      ...prior,
      { id: 'a1', role: 'assistant', content: '```markdown\nwrong\n```', status: 'complete' }
    ]
    expect(findTargetAssistantMessage(priorTurnReply, baseline)).toBeNull()

    // Unrelated newer user/assistant turn must be ignored when requestPrompt does not match.
    const unrelatedTurn: ConversationMessage[] = [
      ...priorTurnReply,
      { id: 'u-other', role: 'user', content: 'unrelated chat', status: 'complete' },
      { id: 'a-other', role: 'assistant', content: '```markdown\nother\n```', status: 'complete' }
    ]
    expect(findTargetAssistantMessage(unrelatedTurn, baseline)).toBeNull()

    // Once the matching Canvas user turn and its assistant reply arrive, bind to it.
    const withCanvasTurn: ConversationMessage[] = [
      ...unrelatedTurn,
      { id: 'u-canvas', role: 'user', content: canvasPrompt, status: 'complete' },
      { id: 'a-canvas', role: 'assistant', content: '```markdown\nright\n```', status: 'complete' }
    ]
    expect(findTargetAssistantMessage(withCanvasTurn, baseline)?.id).toBe('a-canvas')
  })
})
