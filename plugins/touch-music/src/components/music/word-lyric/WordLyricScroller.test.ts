// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, inject, nextTick, ref } from 'vue'

const mountedWrappers: Array<{ unmount: () => void }> = []

const audioState = vi.hoisted(() => ({
  analyserSample: 200,
  cancelFrame: vi.fn(),
  contexts: [] as any[],
  createContext: vi.fn(),
  frames: new Map<number, FrameRequestCallback>(),
  makeRef: undefined as any,
  nextFrameId: 0,
  requestFrame: vi.fn(),
  song: undefined as any,
}))

vi.mock('@modules/music', () => ({
  musicManager: {
    playManager: {
      get song() {
        return audioState.song
      },
    },
  },
}))

vi.mock('@modules/utils', () => ({
  throttleRef: (value: unknown) => audioState.makeRef(value),
}))

const WordLyricItemStub = defineComponent({
  name: 'WordLyricItem',
  props: ['index', 'lyric', 'tlyric'],
  emits: ['index'],
  setup(props, { emit }) {
    const translatedLyric = inject<(time: number) => string>('trans-lyric', undefined)

    return () => {
      const startTime = Number(String(props.lyric).match(/^\[(\d+)/)?.[1])
      const translation = translatedLyric ? translatedLyric(startTime) : props.tlyric

      return h('button', {
        'class': 'lyric-item',
        'data-lyric': props.lyric,
        'data-translation': translation ?? '',
        'onClick': () => emit('index', props.index),
      }, props.lyric)
    }
  },
})
// The root runner does not load this plugin's Vite aliases, so register the imported child locally before loading either SFC.
vi.doMock('@comp/music/word-lyric/WordLyricItem.vue', () => ({
  default: WordLyricItemStub,
}))

const { default: LyricScroller } = await import('./leaf/LyricScroller.vue')
const { default: WordLyricScroller } = await import('./WordLyricScroller.vue')

const TxScrollStub = defineComponent({
  name: 'TxScroll',
  setup(_, { expose, slots }) {
    const scrollTo = vi.fn()
    expose({ scrollTo })

    return () => h('div', { class: 'tx-scroll' }, [
      h('div', { class: 'tx-scroll__content' }, slots.default?.()),
    ])
  },
})

function makeSong({ wordLyric, tlyric }: { wordLyric: string, tlyric: string }) {
  return {
    _songManager: {
      lyric: {
        tlyric: { lyric: tlyric },
      },
      wordLyric: { wordLyric },
    },
    audio: {
      _sounds: [{ _node: {} }],
    },
    colors: [{ color: '#ffffff' }],
  }
}

function mountScroller(component: typeof WordLyricScroller | typeof LyricScroller) {
  const wrapper = mount(component, {
    global: {
      stubs: {
        TxScroll: TxScrollStub,
        WordLyricItem: WordLyricItemStub,
      },
    },
  })
  mountedWrappers.push(wrapper)
  return wrapper
}

function unmountScroller(wrapper: { unmount: () => void }) {
  wrapper.unmount()
  const index = mountedWrappers.indexOf(wrapper)
  if (index !== -1)
    mountedWrappers.splice(index, 1)
}

function setOffsetTop(element: Element, offsetTop: number) {
  Object.defineProperty(element, 'offsetTop', {
    configurable: true,
    value: offsetTop,
  })
}

function runNextAnimationFrame() {
  const next = audioState.frames.entries().next().value as [number, FrameRequestCallback] | undefined
  if (!next)
    throw new Error('Expected a queued animation frame')

  const [frameId, callback] = next
  audioState.frames.delete(frameId)
  callback(0)
  return frameId
}

describe('word lyric scrollers', () => {
  beforeEach(() => {
    audioState.analyserSample = 200
    audioState.cancelFrame.mockReset()
    audioState.contexts = []
    audioState.frames.clear()
    audioState.makeRef = ref
    audioState.nextFrameId = 0
    audioState.song = ref(null)
    audioState.requestFrame.mockImplementation((callback: FrameRequestCallback) => {
      const frameId = ++audioState.nextFrameId
      audioState.frames.set(frameId, callback)
      return frameId
    })
    audioState.createContext.mockImplementation(() => {
      const source = {
        connect: vi.fn(),
        disconnect: vi.fn(),
      }
      const analyser = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        frequencyBinCount: 2,
        getByteFrequencyData: vi.fn((data: Uint8Array) => {
          data.fill(audioState.analyserSample)
        }),
      }
      const context = {
        close: vi.fn(),
        createAnalyser: vi.fn(() => analyser),
        createMediaElementSource: vi.fn(() => source),
        destination: {},
      }
      audioState.contexts.push({ analyser, context, source })
      return context
    })

    vi.stubGlobal('AudioContext', audioState.createContext)
    vi.stubGlobal('cancelAnimationFrame', audioState.cancelFrame)
    vi.stubGlobal('requestAnimationFrame', audioState.requestFrame)
  })

  afterEach(() => {
    mountedWrappers.splice(0).forEach(wrapper => wrapper.unmount())
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('replaces rendered word lyric rows when the active song changes', async () => {
    audioState.song.value = makeSong({
      tlyric: '[00:00.000]First translation\n[00:01.000]Second translation',
      wordLyric: '[0,400](0,400)first\n[1000,400](0,400)second',
    })

    const wrapper = mountScroller(WordLyricScroller)
    await nextTick()

    expect(wrapper.findAll('.lyric-item').map(item => item.attributes('data-lyric'))).toEqual([
      '[0,400](0,400)first',
      '[1000,400](0,400)second',
    ])

    audioState.song.value = makeSong({
      tlyric: '[00:02.000]Replacement translation',
      wordLyric: '[2000,400](0,400)replacement',
    })
    await nextTick()

    expect(wrapper.findAll('.lyric-item').map(item => item.attributes('data-lyric'))).toEqual([
      '[2000,400](0,400)replacement',
    ])

    unmountScroller(wrapper)
  })

  it('defers inline lyric scrolling to its lyric offset', async () => {
    vi.useFakeTimers()
    audioState.song.value = makeSong({
      tlyric: '[00:00.000]First\n[00:01.000]Second',
      wordLyric: '[0,400](0,400)first\n[1000,400](0,400)second',
    })

    const wrapper = mountScroller(WordLyricScroller)
    await nextTick()
    setOffsetTop(wrapper.findAll('.lyric-item')[1].element, 350)

    await wrapper.findAll('.lyric-item')[1].trigger('click')
    await vi.runOnlyPendingTimersAsync()

    expect(wrapper.findComponent(TxScrollStub).vm.$.exposed.scrollTo).toHaveBeenCalledWith(0, 250)

    unmountScroller(wrapper)
  })

  it('keeps the full-screen scroller translation time-aligned and discards translations from the previous song', async () => {
    audioState.song.value = makeSong({
      tlyric: '[00:01.000]Later translation',
      wordLyric: '[750,100](0,100)before\n[1500,100](0,100)after',
    })

    const wrapper = mountScroller(LyricScroller)
    await nextTick()

    expect(wrapper.findAll('.lyric-item').map(item => item.attributes('data-translation'))).toEqual([
      '',
      'Later translation',
    ])

    audioState.song.value = makeSong({
      tlyric: '[00:02.000]Future translation',
      wordLyric: '[1500,100](0,100)current song',
    })
    await nextTick()

    expect(wrapper.find('.lyric-item').attributes('data-translation')).toBe('')

    unmountScroller(wrapper)
  })

  it('scrolls the active full-screen lyric row immediately to its lyric offset', async () => {
    audioState.song.value = makeSong({
      tlyric: '[00:00.000]First\n[00:01.000]Second',
      wordLyric: '[0,400](0,400)first\n[1000,400](0,400)second',
    })

    const wrapper = mountScroller(LyricScroller)
    await nextTick()
    setOffsetTop(wrapper.findAll('.lyric-item')[1].element, 350)

    await wrapper.findAll('.lyric-item')[1].trigger('click')

    expect(wrapper.findComponent(TxScrollStub).vm.$.exposed.scrollTo).toHaveBeenCalledWith(0, 200)

    unmountScroller(wrapper)
  })

  it.each([
    ['inline lyric scroller', WordLyricScroller],
    ['full-screen lyric scroller', LyricScroller],
  ])('releases animation and audio resources for the %s on unmount', async (_, component) => {
    audioState.song.value = makeSong({
      tlyric: '[00:00.000]First',
      wordLyric: '[0,400](0,400)first',
    })

    const wrapper = mountScroller(component)
    await nextTick()

    expect(wrapper.classes()).toContain('shine')
    runNextAnimationFrame()
    const pendingFrameId = audioState.frames.keys().next().value as number
    const [{ analyser, context, source }] = audioState.contexts

    unmountScroller(wrapper)

    expect(audioState.cancelFrame).toHaveBeenCalledWith(pendingFrameId)
    expect(source.disconnect).toHaveBeenCalledTimes(1)
    expect(analyser.disconnect).toHaveBeenCalledTimes(1)
    expect(context.close).toHaveBeenCalledTimes(1)
  })
})
