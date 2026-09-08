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

  it('says so in the collapsed summary when the record carries an annotation', async () => {
    const wrapper = await mountExpanded({ note: 'ego lite', userTags: ['prod', 'staging'] })

    expect(wrapper.get('.more-summary').text()).toContain('标注 · 2 标签')
  })
})
