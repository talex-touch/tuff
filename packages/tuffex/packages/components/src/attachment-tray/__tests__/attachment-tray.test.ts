import type { AiAttachment } from '../../ai-elements/src/types'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { formatSize } from '../src/format-size'
import TxAttachmentTray from '../src/TxAttachmentTray.vue'

const mixed: AiAttachment[] = [
  { kind: 'image', id: 'img1', url: '/one.png', name: 'One' },
  { kind: 'image', id: 'img2', url: '/two.png', name: 'Two' },
  { kind: 'file', id: 'file1', name: 'notes.pdf', size: 1024 * 120 },
]

afterEach(() => {
  document.body.innerHTML = ''
})

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
    await nextTick()

    const viewerImg = () =>
      document.body.querySelector<HTMLImageElement>('.tx-attachment-tray__viewer img')
    expect(viewerImg()?.getAttribute('src')).toBe('/two.png')

    const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.tx-attachment-tray__nav'))
    buttons[0]!.click()
    await nextTick()
    expect(viewerImg()?.getAttribute('src')).toBe('/one.png')
  })

  it('emits open for file chips and leaves the viewer closed', async () => {
    const wrapper = mount(TxAttachmentTray, {
      props: { attachments: mixed },
    })

    await wrapper.find('.tx-attachment-chip__body').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect((wrapper.emitted('open')![0]![0] as { id: string }).id).toBe('file1')
    expect(document.body.querySelector('.tx-attachment-tray__viewer')).toBeNull()
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

describe('formatSize', () => {
  it('formats across unit boundaries', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatSize(-1)).toBe('')
  })
})
