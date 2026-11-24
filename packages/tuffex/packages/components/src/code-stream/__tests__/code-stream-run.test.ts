import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxStreamElement from '../../stream-element/src/TxStreamElement.vue'
import TxCodeBlock from '../../stream-markdown/src/TxCodeBlock.vue'
import TxStreamMarkdown from '../../stream-markdown/src/TxStreamMarkdown.vue'
import TxCodeStream from '../src/TxCodeStream.vue'

vi.mock('../../stream-markdown/src/shiki-runtime', () => ({
  highlightToHtml: vi.fn(async () => null),
}))

async function settle(): Promise<void> {
  await flushPromises()
  await nextTick()
}

describe('shell code block run action', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('places the run button immediately left of the copy button and emits run with feedback', async () => {
    vi.useFakeTimers()
    const wrapper = mount(TxCodeStream, {
      props: {
        code: 'open login.html',
        lang: 'BASH',
        langLabel: 'bash',
        runnable: true,
        runLabel: '执行',
        ranLabel: '已执行',
        runTitle: '在底部终端执行',
      },
    })
    await settle()

    const actions = wrapper.find('.tx-bui-code-stream__actions')
    const buttons = actions.findAll('button')
    expect(buttons.length).toBeGreaterThanOrEqual(2)
    expect(buttons[0]!.classes()).toContain('tx-bui-code-stream__run')
    expect(buttons[1]!.classes()).toContain('tx-bui-code-stream__copy')

    const runBtn = wrapper.find('.tx-bui-code-stream__run')
    expect(runBtn.text()).toBe('执行')
    expect(runBtn.attributes('title')).toBe('在底部终端执行')
    expect(runBtn.attributes('aria-label')).toBe('在底部终端执行')

    await runBtn.trigger('click')
    expect(wrapper.emitted('run')).toEqual([[{ lang: 'bash', code: 'open login.html' }]])
    expect(runBtn.classes()).toContain('is-ran')
    expect(runBtn.text()).toBe('已执行')

    vi.advanceTimersByTime(1500)
    await nextTick()
    expect(runBtn.classes()).not.toContain('is-ran')
    expect(runBtn.text()).toBe('执行')
  })

  it.each([
    ['runnable off by default', { lang: 'bash', code: 'ls -la' }],
    ['non-shell language', { lang: 'ts', code: 'const x = 1', runnable: true }],
    ['html preview language', { lang: 'html', code: '<p>hi</p>', runnable: true }],
    ['live stream', { lang: 'bash', code: 'ls -la', runnable: true, streaming: true }],
    ['diff mode', { lang: 'bash', code: 'ls -la', runnable: true, diff: [{ kind: 'added' as const, content: 'ls -la', number: 1 }] }],
    ['blank code', { lang: 'bash', code: '  \n\t', runnable: true }],
  ])('hides the run button for %s', async (_, props) => {
    const wrapper = mount(TxCodeStream, { props })
    await settle()
    expect(wrapper.find('.tx-bui-code-stream__run').exists()).toBe(false)
  })

  it('forwards runnable props and emits code-run through TxStreamElement (including v-bind onCodeRun)', async () => {
    const onCodeRun = vi.fn()
    const wrapper = mount(TxStreamElement, {
      props: {
        content: '```zsh\nopen login.html\n```',
        runnable: true,
        runLabel: '执行',
        ranLabel: '已执行',
        runTitle: '在底部终端执行',
        onCodeRun,
      } as Record<string, unknown>,
    })
    await settle()

    const runBtn = wrapper.find('.tx-bui-code-stream__run')
    expect(runBtn.exists()).toBe(true)
    expect(runBtn.text()).toBe('执行')

    await runBtn.trigger('click')
    expect(onCodeRun).toHaveBeenCalledTimes(1)
    expect(onCodeRun).toHaveBeenCalledWith({ lang: 'zsh', code: 'open login.html' })
  })

  it('supports runnable shell fences in TxCodeBlock and TxStreamMarkdown', async () => {
    const block = mount(TxCodeBlock, {
      props: {
        lang: 'sh',
        code: 'echo hello',
        closed: true,
        runnable: true,
        runLabel: '执行',
      },
    })
    await settle()

    const buttons = block.find('.tx-code-block__actions').findAll('button')
    expect(buttons[0]!.classes()).toContain('tx-code-block__run')
    expect(buttons[1]!.classes()).toContain('tx-code-block__copy')

    await buttons[0]!.trigger('click')
    expect(block.emitted('run')).toEqual([[{ lang: 'sh', code: 'echo hello' }]])

    const openBlock = mount(TxCodeBlock, {
      props: { lang: 'bash', code: 'echo hi', closed: false, runnable: true },
    })
    expect(openBlock.find('.tx-code-block__run').exists()).toBe(false)
    openBlock.unmount()

    const md = mount(TxStreamMarkdown, {
      props: {
        content: '```bash\npwd\n```',
        sanitize: false,
        runnableCode: true,
        runCodeText: '执行',
      },
    })
    await settle()

    const mdRunBtn = md.find('.tx-code-block__run')
    expect(mdRunBtn.exists()).toBe(true)
    await mdRunBtn.trigger('click')
    expect(md.emitted('code-run')).toEqual([[{ lang: 'bash', code: 'pwd' }]])
  })
})
