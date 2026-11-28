import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayManager } from './play-manager'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  playSpy: vi.fn(),
  pauseSpy: vi.fn(),
}))

vi.mock('@modules/axios', () => ({
  axios: {
    get: mocks.get,
  },
}))

vi.mock('@modules/entity/song-resolver', () => {
  class FakePlaySong {
    play = mocks.playSpy
    pause = mocks.pauseSpy
    constructor(public origin: any, public detail: any) {}
  }
  return {
    PlaySong: FakePlaySong,
  }
})

describe('touch-music PlayManager', () => {
  beforeEach(() => {
    mocks.get.mockReset()
    mocks.playSpy.mockReset()
    mocks.pauseSpy.mockReset()
  })

  it('handles empty playlist and null song without crashing or sticking isPause=false', async () => {
    const manager = new PlayManager()
    await expect(manager.play()).resolves.toBeUndefined()
    expect(manager.isPause).toBe(true)
    expect(manager.playIndex).toBe(-1)

    manager.isPause = false
    expect(() => manager.pause()).not.toThrow()
    expect(manager.isPause).toBe(true)
  })

  it('resets isPause to true if fetching song URL fails', async () => {
    const manager = new PlayManager()
    manager.addSong({ id: 42, _originData: { id: 42, name: 'Test' } } as any)
    mocks.get.mockResolvedValueOnce({ code: 500, data: [] })

    await expect(manager.play()).rejects.toThrow(/Failed to get song url/)
    expect(manager.isPause).toBe(true)
    expect(manager.song).toBeNull()
    expect(manager.playIndex).toBe(-1)
  })

  it('mutates playList reactively in addSongs while resetting playback state', async () => {
    const manager = new PlayManager()
    const reactiveListRef = manager.playList
    manager.addSong({ id: 1, _originData: { id: 1, name: 'One' } } as any)
    mocks.get.mockResolvedValueOnce({ code: 200, data: [{ url: 'https://cdn.example/1.mp3' }] })

    await manager.play()
    expect(manager.isPause).toBe(false)
    expect(manager.playIndex).toBe(0)
    expect(mocks.playSpy).toHaveBeenCalledTimes(1)

    manager.addSongs([{ id: 2, _originData: { id: 2, name: 'Two' } } as any])
    expect(manager.playList).toBe(reactiveListRef)
    expect(manager.playList).toHaveLength(1)
    expect(manager.playList[0]?.id).toBe(2)
    expect(manager.song).toBeNull()
    expect(manager.playIndex).toBe(-1)
    expect(manager.isPause).toBe(true)
    expect(mocks.pauseSpy).toHaveBeenCalledTimes(1)
  })
})
