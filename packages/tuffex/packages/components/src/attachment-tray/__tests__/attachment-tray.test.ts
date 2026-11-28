import type { AiAttachment } from '../../ai-elements/src/types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { formatSize } from '../src/format-size'
import TxAttachmentTray from '../src/TxAttachmentTray.vue'

// The tray imports the preview the first time it is needed. Loaded here first, that import
// settles within a flush instead of racing the assertions after the first press.
beforeAll(async () => {
  await import('../../image-preview')
})

const mixed: AiAttachment[] = [
  { kind: 'image', id: 'img1', url: '/one.png', name: 'One' },
  { kind: 'image', id: 'img2', url: '/two.png', name: 'Two' },
  { kind: 'file', id: 'file1', name: 'notes.pdf', size: 1024 * 120 },
]

afterEach(() => {
  document.body.innerHTML = ''
})

// TxImagePreview's parts. Its neighbouring slides are drawn too, aria-hidden, so the picture
// shown is the current slide's; a closed preview stays in the DOM while it fades.
const viewerSrc = () =>
  document.body.querySelector<HTMLImageElement>('.tx-image-preview__slide:not([aria-hidden]) .tx-image-preview__image')?.getAttribute('src')
const openViewer = () => document.body.querySelector('.tx-image-preview:not(.is-closing)')
const nav = (label: string) => document.body.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!

describe('txAttachmentTray', () => {
  it('splits images into thumbs and files into chips', () => {
    const wrapper = mount(TxAttachmentTray, {
      props: { attachments: mixed },
    })

    expect(wrapper.findAll('.tx-attachment-tray__thumb')).toHaveLength(2)
    const chip = wrapper.find('.tx-attachment-chip')
    expect(chip.exists()).toBe(true)
    expect(chip.text()).toContain('notes.pdf')
    expect(chip.text()).toContain('120.0 KB')
    const badge = chip.find('.tx-bui-icon-chip')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('PDF')
    expect(badge.classes()).toContain('is-red')
  })

  it('maps file formats onto TxIconChip tones and falls back to a file glyph without an extension', () => {
    const wrapper = mount(TxAttachmentTray, {
      props: {
        attachments: [
          { kind: 'file', id: 'f-csv', name: 'metrics.csv', size: 512 },
          { kind: 'file', id: 'f-zip', name: 'bundle.zip', size: 2048 },
          { kind: 'file', id: 'f-raw', name: 'README', size: 256 },
        ],
      },
    })

    const chips = wrapper.findAll('.tx-attachment-chip')
    expect(chips[0]!.find('.tx-bui-icon-chip').text()).toBe('CSV')
    expect(chips[0]!.find('.tx-bui-icon-chip').classes()).toContain('is-green')
    expect(chips[1]!.find('.tx-bui-icon-chip').text()).toBe('ZIP')
    expect(chips[1]!.find('.tx-bui-icon-chip').classes()).toContain('is-orange')
    expect(chips[2]!.find('.tx-bui-icon-chip').exists()).toBe(false)
    expect(chips[2]!.find('.tx-attachment-chip__icon svg').exists()).toBe(true)
  })

  it('shows remove affordances only in removable mode', async () => {
    const readonly = mount(TxAttachmentTray, { props: { attachments: mixed } })
    expect(readonly.find('.tx-attachment-tray__remove').exists()).toBe(false)
    expect(readonly.find('.tx-attachment-chip__action').exists()).toBe(false)

    const editable = mount(TxAttachmentTray, {
      props: { attachments: mixed, removable: true },
    })
    await editable.find('.tx-attachment-tray__remove').trigger('click')
    expect(editable.emitted('remove')).toEqual([['img1']])
  })

  it('replaces remove with cancel while uploading and renders the progress ring', async () => {
    const wrapper = mount(TxAttachmentTray, {
      props: {
        removable: true,
        attachments: [
          { kind: 'image', id: 'up1', url: '/up.png', uploading: true, progress: 0.5 },
        ],
      },
    })

    const arc = wrapper.find('.tx-attachment-tray__progress-arc')
    expect(arc.exists()).toBe(true)
    // Half progress = half the circumference remaining.
    const dashoffset = Number(arc.attributes('stroke-dashoffset'))
    const dasharray = Number(arc.attributes('stroke-dasharray'))
    expect(dashoffset).toBeCloseTo(dasharray / 2, 5)

    const action = wrapper.find('.tx-attachment-tray__remove')
    expect(action.attributes('aria-label')).toBe('Cancel upload')
    await action.trigger('click')
    expect(wrapper.emitted('cancel')).toEqual([['up1']])
    expect(wrapper.emitted('remove')).toBeUndefined()
  })

  it('opens the viewer at the clicked image and navigates', async () => {
    const wrapper = mount(TxAttachmentTray, {
      props: { attachments: mixed },
    })

    await wrapper.findAll('.tx-attachment-tray__thumb')[1]!.trigger('click')
    await flushPromises()
    expect(viewerSrc()).toBe('/two.png')

    nav('Previous image').click()
    await nextTick()
    expect(viewerSrc()).toBe('/one.png')
    wrapper.unmount()
  })

  it('emits open for file chips and leaves the viewer closed', async () => {
    const wrapper = mount(TxAttachmentTray, {
      props: { attachments: mixed },
    })

    await wrapper.find('.tx-attachment-chip__body').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect((wrapper.emitted('open')![0]![0] as { id: string }).id).toBe('file1')
    expect(document.body.querySelector('.tx-image-preview')).toBeNull()
  })

  it('falls back to a placeholder when a thumbnail fails to load', async () => {
    const wrapper = mount(TxAttachmentTray, {
      props: { attachments: [{ kind: 'image', id: 'bad', url: '/broken.png' }] },
    })

    await wrapper.find('.tx-attachment-tray__thumb img').trigger('error')
    expect(wrapper.find('.tx-attachment-tray__broken').exists()).toBe(true)
    expect(wrapper.find('.tx-attachment-tray__thumb img').exists()).toBe(false)
  })
})

describe('txAttachmentTray viewer keyboard and focus', () => {
  function press(key: string, init: KeyboardEventInit = {}): void {
    const target = document.activeElement ?? document.body
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }))
  }

  async function openAt(index: number) {
    const wrapper = mount(TxAttachmentTray, { props: { attachments: mixed } })
    await wrapper.findAll('.tx-attachment-tray__thumb')[index]!.trigger('click')
    await flushPromises()
    return wrapper
  }

  it('pages with the arrow keys and stops at both ends', async () => {
    const wrapper = await openAt(0)
    expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull()

    press('ArrowLeft')
    await flushPromises()
    expect(viewerSrc()).toBe('/one.png')

    press('ArrowRight')
    await flushPromises()
    expect(viewerSrc()).toBe('/two.png')

    press('ArrowRight')
    await flushPromises()
    expect(viewerSrc()).toBe('/two.png')

    press('ArrowLeft')
    await flushPromises()
    expect(viewerSrc()).toBe('/one.png')
    wrapper.unmount()
  })

  it('leaves arrow keys with modifiers alone', async () => {
    const wrapper = await openAt(0)

    press('ArrowRight', { altKey: true })
    press('ArrowRight', { metaKey: true })
    press('ArrowRight', { shiftKey: true })
    await flushPromises()
    expect(viewerSrc()).toBe('/one.png')
    wrapper.unmount()
  })

  it('keeps focus on a page button that paging makes unavailable', async () => {
    const wrapper = await openAt(0)
    const next = nav('Next image')

    next.focus()
    next.click()
    await flushPromises()
    expect(viewerSrc()).toBe('/two.png')
    // aria-disabled, not disabled: the button stays focusable, so focus stays in the dialog.
    expect(next.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(next)

    press('ArrowLeft')
    await flushPromises()
    expect(viewerSrc()).toBe('/one.png')
    expect(next.hasAttribute('aria-disabled')).toBe(false)
    expect(document.activeElement).toBe(next)
    wrapper.unmount()
  })

  it('keeps the index on a real image when the list shrinks, and closes when none is left', async () => {
    const wrapper = await openAt(1)
    expect(viewerSrc()).toBe('/two.png')

    await wrapper.setProps({ attachments: [mixed[0]!, mixed[2]!] })
    expect(viewerSrc()).toBe('/one.png')
    // A single image has no counter.
    expect(document.body.querySelector('.tx-image-preview__counter')).toBeNull()

    await wrapper.setProps({ attachments: [mixed[2]!] })
    expect(openViewer()).toBeNull()
    wrapper.unmount()
  })
})

describe('txAttachmentTray failure and upload states', () => {
  it('shows the placeholder in the viewer too, and retries when the URL changes', async () => {
    const wrapper = mount(TxAttachmentTray, {
      props: { attachments: [{ kind: 'image', id: 'bad', url: '/broken.png', name: 'Bad' }] },
    })

    await wrapper.find('.tx-attachment-tray__thumb img').trigger('error')
    await wrapper.find('.tx-attachment-tray__thumb').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.tx-image-preview .tx-image-preview__failed')).not.toBeNull()
    expect(document.body.querySelector('.tx-image-preview img')).toBeNull()

    await wrapper.setProps({ attachments: [{ kind: 'image', id: 'bad', url: '/fixed.png', name: 'Bad' }] })
    expect(wrapper.find('.tx-attachment-tray__thumb img').attributes('src')).toBe('/fixed.png')
    expect(viewerSrc()).toBe('/fixed.png')
    wrapper.unmount()
  })

  it('keeps one action button when an upload finishes, relabelling it from cancel to remove', async () => {
    const uploading: AiAttachment = { kind: 'image', id: 'up1', url: '/up.png', uploading: true, progress: 0.9 }
    const wrapper = mount(TxAttachmentTray, {
      props: { removable: true, attachments: [uploading] },
    })

    const before = wrapper.find('.tx-attachment-tray__remove')
    expect(before.attributes('aria-label')).toBe('Cancel upload')

    await wrapper.setProps({ attachments: [{ ...uploading, uploading: false, progress: undefined }] })
    const after = wrapper.find('.tx-attachment-tray__remove')
    expect(after.element).toBe(before.element)
    expect(after.attributes('aria-label')).toBe('Remove attachment')
    expect(wrapper.find('.tx-attachment-tray__progress').exists()).toBe(false)
  })

  it('draws a progress bar on an uploading file chip', async () => {
    const wrapper = mount(TxAttachmentTray, {
      props: {
        attachments: [
          { kind: 'file', id: 'f1', name: 'archive.zip', size: 2048, uploading: true, progress: 0.4 },
        ],
      },
    })

    const chip = wrapper.find('.tx-attachment-chip')
    expect(chip.text()).toContain('40%')
    expect(wrapper.find('.tx-attachment-chip__progress').attributes('style')).toContain('background-size: 40% 100%')

    const action = wrapper.find('.tx-attachment-chip__action')
    expect(action.attributes('aria-label')).toBe('Cancel upload')
    await action.trigger('click')
    expect(wrapper.emitted('cancel')).toEqual([['f1']])
  })
})

describe('formatSize', () => {
  it('formats across unit boundaries', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatSize(-1)).toBe('')
  })
})
