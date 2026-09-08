import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ClipboardMoreInfo from './ClipboardMoreInfo.vue'

/**
 * `useDisclosureState` falls back to in-memory state outside a plugin context, so the block starts
 * collapsed here. Every test opens it first — a chip that renders only when expanded is not a chip
 * anyone can click.
 */
async function mountExpanded(item: Partial<PluginClipboardItem> = {}) {
  const wrapper = mount(ClipboardMoreInfo, {
    props: {
      item: {
        id: 7,
        type: 'text',
        content: 'sk-d7d53xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        timestamp: Date.parse('2026-09-08T02:09:32'),
        ...item,
      } as PluginClipboardItem,
    },
  })

  await wrapper.get('.more-toggle').trigger('click')
  return wrapper
}

describe('clipboardMoreInfo annotation', () => {
  it('adds a tag on Enter and clears the input', async () => {
    const wrapper = await mountExpanded()

    const input = wrapper.get('.tag-input')
    await input.setValue('  prod  ')
    await input.trigger('keydown.enter')

    expect(wrapper.emitted('annotate')?.[0]).toEqual([{ tags: ['prod'] }])
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('sends the whole list when removing a tag, not just the removed one', async () => {
    // 事件带的是新的完整列表，主进程按整份覆盖；只发被删的那个会变成"再加一次"。
    const wrapper = await mountExpanded({ userTags: ['prod', 'staging'] })

    await wrapper.findAll('.tag-chip')[0]!.trigger('click')

    expect(wrapper.emitted('annotate')?.[0]).toEqual([{ tags: ['staging'] }])
  })

  it('refuses a duplicate tag instead of emitting a no-op write', async () => {
    const wrapper = await mountExpanded({ userTags: ['Prod'] })

    const input = wrapper.get('.tag-input')
    await input.setValue('prod')
    await input.trigger('keydown.enter')

    expect(wrapper.emitted('annotate')).toBeUndefined()
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('commits the note on blur, and stays quiet when nothing changed', async () => {
    const wrapper = await mountExpanded({ note: 'ego lite' })

    const note = wrapper.get('.note-input')
    // 每次失焦都发一次写请求会让 change 流空转，还会把列表刷一遍。
    await note.trigger('blur')
    expect(wrapper.emitted('annotate')).toBeUndefined()

    await note.setValue('ego lite pro')
    await note.trigger('blur')
    expect(wrapper.emitted('annotate')?.[0]).toEqual([{ note: 'ego lite pro' }])
  })

  it('clears the note with an empty value rather than storing whitespace', async () => {
    const wrapper = await mountExpanded({ note: 'ego lite' })

    const note = wrapper.get('.note-input')
    await note.setValue('   ')
    await note.trigger('blur')

    expect(wrapper.emitted('annotate')?.[0]).toEqual([{ note: null }])
  })

  it('drops the draft when the selected record changes', async () => {
    // 留着上一条的半句备注，下一次失焦就会把它写到别的记录上。
    //
    // 两条记录都没有备注是故意的：备注不同的话，跟随 `savedNote` 的那个 watch 会顺手把
    // 草稿冲掉，于是这条用例即使在没有按 id 重置的实现上也是绿的。
    const wrapper = await mountExpanded({ id: 7 })

    await wrapper.get('.note-input').setValue('half-typed')
    await wrapper.setProps({
      item: { id: 8, type: 'text', content: 'other' } as PluginClipboardItem,
    })

    expect((wrapper.get('.note-input').element as HTMLInputElement).value).toBe('')
  })

  it('puts the annotation above the read-only rows', async () => {
    // 标注是这里唯一由人写的东西，排在 MIME / 记录时间 / 记录 ID 前面。
    const wrapper = await mountExpanded()

    const firstChild = wrapper.get('.more-body').element.firstElementChild
    expect(firstChild?.classList.contains('annotate-block')).toBe(true)
  })

  it('says so in the collapsed summary when the record carries an annotation', async () => {
    const wrapper = await mountExpanded({ note: 'ego lite', userTags: ['prod', 'staging'] })

    expect(wrapper.get('.more-summary').text()).toContain('标注 · 2 标签')
  })
})

describe('clipboardMoreInfo OCR', () => {
  const imageWithOcr = {
    id: 3,
    type: 'image',
    content: 'data:image/png;base64,thumb',
    thumbnail: 'data:image/png;base64,thumb',
    meta: {
      ocr_status: 'done',
      ocr_text: 'Invoice total',
      ocr_language: 'zh-Hans',
      ocr_confidence: 0.66,
      ocr_keywords: ['invoice', 'total'],
    },
  } as unknown as PluginClipboardItem

  it('renders the recognised text and its keywords, both copyable', async () => {
    const wrapper = await mountExpanded(imageWithOcr)

    const block = wrapper.findAll('.more-block').find(node => node.find('.ocr-text').exists())
    expect(block).toBeDefined()
    expect(block!.get('.more-block-title').text()).toContain('zh-Hans')

    await block!.get('.ocr-text').trigger('click')
    await block!.get('.more-char').trigger('click')

    expect(wrapper.emitted('copyText')).toEqual([['Invoice total'], ['invoice']])
  })

  it('announces OCR in the collapsed summary', async () => {
    // 收在折叠区里就必须在摘要里报到，否则识别结果等于藏起来了。
    const wrapper = await mountExpanded(imageWithOcr)

    expect(wrapper.get('.more-summary').text()).toContain('OCR')
  })

  it('renders no OCR block for a record that has none', async () => {
    const wrapper = await mountExpanded()

    expect(wrapper.find('.ocr-text').exists()).toBe(false)
    expect(wrapper.get('.more-summary').text()).not.toContain('OCR')
  })
})
