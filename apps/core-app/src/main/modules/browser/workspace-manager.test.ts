import type { BrowserWindow, Rectangle, WebContentsView } from 'electron'
import type { BrowserPersistedWorkspace } from './workspace-manager'
import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import { BrowserWorkspaceManager } from './workspace-manager'

type LoadRequest = {
  url: string
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
}

class GuestContents extends EventEmitter {
  destroyed = false
  url = ''
  title = ''
  loads: LoadRequest[] = []
  popup: (request: { url: string }) => { action: string } = () => {
    throw new Error('window-open policy was not installed')
  }

  navigationHistory = {
    canGoBack: () => false,
    canGoForward: () => false,
    goBack: () => {},
    goForward: () => {}
  }

  isDestroyed() {
    return this.destroyed
  }
  getURL() {
    return this.url
  }
  getTitle() {
    return this.title
  }
  setWindowOpenHandler(handler: typeof this.popup) {
    this.popup = handler
  }

  loadURL(url: string): Promise<void> {
    let resolve!: () => void
    let reject!: (error: unknown) => void
    const promise = new Promise<void>((accept, decline) => {
      resolve = accept
      reject = decline
    })
    this.loads.push({ url, promise, resolve, reject })
    return promise
  }

  finish(index: number, title: string): void {
    const load = this.loads[index]!
    this.url = load.url
    this.title = title
    this.emit('did-navigate', {}, this.url)
    this.emit('did-finish-load')
    load.resolve()
  }

  reload() {
    this.emit('did-start-loading')
  }
  stop() {
    this.emit('did-stop-loading')
  }
  close() {
    this.destroyed = true
    this.emit('destroyed')
  }
}

class GuestView {
  webContents = new GuestContents()
  visible = false
  bounds: Rectangle | null = null
  setVisible(visible: boolean) {
    this.visible = visible
  }
  setBounds(bounds: Rectangle) {
    this.bounds = { ...bounds }
  }
}

class OwnerWindow extends EventEmitter {
  visible = true
  webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    mainFrame: { parent: null, isDestroyed: () => false }
  })

  attached = new Set<GuestView>()
  contentView = {
    addChildView: (view: GuestView) => {
      this.attached.add(view)
    },
    removeChildView: (view: GuestView) => {
      this.attached.delete(view)
    }
  }

  isDestroyed() {
    return false
  }
  isVisible() {
    return this.visible
  }
  getContentSize() {
    return [1000, 700]
  }
}

const visibleViewport = {
  visible: true,
  bounds: { x: 100, y: 90, width: 850, height: 580 }
}

const managers: BrowserWorkspaceManager[] = []

function createWorkspace(
  persistFailure?: () => boolean,
  restored?: unknown,
  persistWrite?: (state: BrowserPersistedWorkspace) => Promise<void>
) {
  const owner = new OwnerWindow()
  const guests: GuestView[] = []
  const saved: BrowserPersistedWorkspace[] = []
  const revisions: number[] = []
  const manager = new BrowserWorkspaceManager(
    {
      owner: owner as unknown as BrowserWindow,
      createView: () => {
        const guest = new GuestView()
        guests.push(guest)
        return guest as unknown as WebContentsView
      },
      persist: async (state) => {
        if (persistFailure?.()) throw new Error('disk write denied')
        await persistWrite?.(state)
        saved.push(structuredClone(state))
      },
      notify: (state) => {
        revisions.push(state.revision)
      },
      now: () => 123456
    },
    restored ?? {
      tabs: [{ id: 'first', url: 'https://one.example/', title: 'One' }],
      activeTabId: 'first',
      recent: [],
      bookmarks: []
    }
  )
  managers.push(manager)
  return { manager, owner, guests, saved, revisions }
}

function tab(manager: BrowserWorkspaceManager, id = 'first') {
  const result = manager.getState().tabs.find((item) => item.id === id)
  if (!result) throw new Error(`missing tab ${id}`)
  return result
}

afterEach(async () => {
  await Promise.all(managers.splice(0).map((manager) => manager.dispose()))
})

describe('browser guest navigation confinement', () => {
  it.each(['will-navigate', 'will-redirect', 'will-frame-navigate'])(
    'blocks unsafe destinations at the %s boundary without replacing the current page',
    (eventName) => {
      const { manager, guests } = createWorkspace()
      manager.setViewport(visibleViewport)
      const guest = guests[0]!
      for (const url of [
        'file:///Users/example/private',
        'javascript:alert(1)',
        'data:text/html,private',
        'plugin://private/index.html',
        'https://alice@example.com/'
      ]) {
        let prevented = false
        const event = {
          url,
          preventDefault: () => {
            prevented = true
          }
        }
        guest.webContents.emit(eventName, event, url)
        expect(prevented, url).toBe(true)
        expect(tab(manager)).toMatchObject({
          url: 'https://one.example/',
          error: 'BROWSER_URL_BLOCKED'
        })
      }
    }
  )

  it('accepts an HTTP(S) redirect and records the committed destination, not its predecessor', async () => {
    const { manager, guests, saved } = createWorkspace()
    manager.setViewport(visibleViewport)
    const guest = guests[0]!
    let prevented = false
    guest.webContents.emit(
      'will-redirect',
      {
        preventDefault: () => {
          prevented = true
        }
      },
      'https://two.example/article'
    )
    guest.webContents.url = 'https://two.example/article'
    guest.webContents.title = 'Destination article'
    guest.webContents.emit('did-navigate', {}, guest.webContents.url)
    guest.webContents.emit('did-finish-load')
    await manager.activateTab('first')
    expect(prevented).toBe(false)
    expect(tab(manager)).toMatchObject({
      url: 'https://two.example/article',
      title: 'Destination article'
    })
    expect(manager.getState().recent).toEqual([
      {
        url: 'https://two.example/article',
        title: 'Destination article',
        favicon: null,
        visitedAt: 123456
      }
    ])
    expect(saved.at(-1)?.recent).toEqual(manager.getState().recent)
  })

  it('denies unsafe popups without creating a tab or native guest', () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport(visibleViewport)
    const before = manager.getState()
    for (const url of ['javascript:alert(1)', 'file:///private', 'https://alice@example.com/']) {
      expect(guests[0]!.webContents.popup({ url })).toEqual({ action: 'deny' })
      expect(manager.getState()).toEqual(before)
      expect(guests).toHaveLength(1)
      expect([...owner.attached]).toEqual([guests[0]])
    }
  })

  it('routes a safe popup to an isolated workspace tab while denying a native window', async () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport(visibleViewport)
    expect(guests[0]!.webContents.popup({ url: 'https://two.example/article' })).toEqual({
      action: 'deny'
    })
    const newId = manager.getState().activeTabId
    await manager.activateTab(newId)
    expect(newId).not.toBe('first')
    expect(tab(manager, newId).url).toBe('https://two.example/article')
    expect(guests).toHaveLength(2)
    expect([...owner.attached]).toEqual([guests[1]])
    expect(guests[0]!.visible).toBe(false)
    expect(guests[0]!.webContents.destroyed).toBe(false)
  })
})

describe('browser tab order', () => {
  const restored = () => ({
    tabs: ['first', 'second', 'third', 'fourth'].map((id) => ({
      id,
      url: `https://${id}.example/`,
      title: id
    })),
    activeTabId: 'second',
    recent: [],
    bookmarks: []
  })

  it.each([
    {
      name: 'moves right before a later anchor',
      tabId: 'first',
      beforeTabId: 'fourth',
      expected: ['second', 'third', 'first', 'fourth']
    },
    {
      name: 'moves left before an earlier anchor',
      tabId: 'fourth',
      beforeTabId: 'second',
      expected: ['first', 'fourth', 'second', 'third']
    },
    {
      name: 'moves to the first position',
      tabId: 'third',
      beforeTabId: 'first',
      expected: ['third', 'first', 'second', 'fourth']
    },
    {
      name: 'moves the active tab to the end',
      tabId: 'second',
      beforeTabId: null,
      expected: ['first', 'third', 'fourth', 'second']
    }
  ])('$name and restores the exact committed order', async ({ tabId, beforeTabId, expected }) => {
    const { manager, saved, revisions, guests } = createWorkspace(undefined, restored())
    const before = manager.getState()

    const result = await manager.moveTab(tabId, beforeTabId)

    expect(result).toEqual({
      ...before,
      revision: before.revision + 1,
      tabs: expected.map((id) => before.tabs.find((tab) => tab.id === id))
    })
    expect(manager.getState()).toEqual(result)
    expect(revisions).toEqual([result.revision])
    expect(saved).toEqual([
      {
        ...restored(),
        tabs: expected.map((id) => restored().tabs.find((tab) => tab.id === id))
      }
    ])
    const reopened = createWorkspace(undefined, saved[0])
    expect(reopened.manager.getState()).toEqual({ ...result, revision: 0 })
    expect(guests).toEqual([])
    expect(reopened.guests).toEqual([])
  })

  it.each([
    { name: 'before itself', tabId: 'second', beforeTabId: 'second' },
    { name: 'before its existing successor', tabId: 'second', beforeTabId: 'third' },
    { name: 'from the end to the end', tabId: 'fourth', beforeTabId: null }
  ])('does not publish or persist a move $name', async ({ tabId, beforeTabId }) => {
    const { manager, saved, revisions } = createWorkspace(undefined, restored())
    const before = manager.getState()

    expect(await manager.moveTab(tabId, beforeTabId)).toEqual(before)
    expect(manager.getState()).toEqual(before)
    expect(revisions).toEqual([])
    expect(saved).toEqual([])
  })

  it.each([
    { name: 'missing source', tabId: 'missing', beforeTabId: 'second' },
    { name: 'missing source at the end', tabId: 'missing', beforeTabId: null },
    { name: 'missing anchor', tabId: 'first', beforeTabId: 'missing' },
    { name: 'missing source before itself', tabId: 'missing', beforeTabId: 'missing' },
    { name: 'omitted anchor', tabId: 'first', beforeTabId: undefined },
    { name: 'non-string anchor', tabId: 'first', beforeTabId: 1 }
  ])('rejects $name before changing any state', async ({ tabId, beforeTabId }) => {
    const { manager, saved, revisions, guests, owner } = createWorkspace(undefined, restored())
    manager.setViewport(visibleViewport)
    const before = manager.getState()
    const activeGuest = guests[0]!

    await expect(manager.moveTab(tabId, beforeTabId as string | null)).rejects.toThrow(
      'BROWSER_TAB_NOT_FOUND'
    )

    expect(manager.getState()).toEqual(before)
    expect(revisions).toEqual([])
    expect(saved).toEqual([])
    expect(guests).toHaveLength(1)
    expect([...owner.attached]).toEqual([activeGuest])
    expect(activeGuest.webContents.destroyed).toBe(false)
    expect(activeGuest.webContents.loads.map((load) => load.url)).toEqual([
      'https://second.example/'
    ])
  })

  it('keeps the selected page and every existing guest alive without reloading on reorder', async () => {
    const { manager, guests, owner, saved, revisions } = createWorkspace(undefined, restored())
    manager.setViewport(visibleViewport)
    for (const id of ['first', 'third', 'fourth']) await manager.activateTab(id)
    for (const [index, guest] of guests.entries()) {
      guest.webContents.finish(0, `Committed page ${index}`)
    }
    await manager.activateTab('second')
    const originalGuests = [...guests]
    const originalLoads = guests.map((guest) => guest.webContents.loads[0])
    const before = manager.getState()
    const writesBefore = saved.length
    const notificationsBefore = revisions.length

    const result = await manager.moveTab('second', null)

    expect(result).toEqual({
      ...before,
      revision: before.revision + 1,
      tabs: ['first', 'third', 'fourth', 'second'].map((id) =>
        before.tabs.find((tab) => tab.id === id)
      )
    })
    expect(saved).toHaveLength(writesBefore + 1)
    expect(revisions.slice(notificationsBefore)).toEqual([result.revision])
    expect([...owner.attached]).toEqual([originalGuests[0]])
    expect(guests).toHaveLength(originalGuests.length)
    for (const [index, guest] of guests.entries()) {
      expect(guest).toBe(originalGuests[index])
      expect(guest.webContents.destroyed).toBe(false)
      expect(guest.webContents.loads).toHaveLength(1)
      expect(guest.webContents.loads[0]).toBe(originalLoads[index])
    }

    await manager.activateTab('first')
    expect([...owner.attached]).toEqual([originalGuests[1]])
    expect(guests).toHaveLength(originalGuests.length)
    expect(guests[1]!.webContents.loads).toHaveLength(1)
    expect(tab(manager, 'first').title).toBe('Committed page 1')
  })
})

describe('browser workspace guest ownership', () => {
  it('activation detaches the old guest; closing each tab destroys it and leaves a usable local page', async () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport(visibleViewport)
    const second = await manager.createTab('https://two.example/')
    const secondId = second.activeTabId
    expect([...owner.attached]).toEqual([guests[1]])
    await manager.activateTab('first')
    expect([...owner.attached]).toEqual([guests[0]])
    expect(guests[1]!.visible).toBe(false)
    await manager.closeTab(secondId)
    expect(guests[1]!.webContents.destroyed).toBe(true)
    const state = await manager.closeTab('first')
    expect(guests[0]!.webContents.destroyed).toBe(true)
    expect(owner.attached.size).toBe(0)
    expect(state.tabs).toHaveLength(1)
    expect(state.activeTabId).toBe(state.tabs[0]!.id)
    expect(state.tabs[0]).toMatchObject({
      url: '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      error: null
    })
    const reopened = await manager.navigate(state.activeTabId, 'https://three.example/')
    expect(reopened.tabs[0]!.url).toBe('https://three.example/')
    expect(guests[2]!.visible).toBe(true)
  })

  it('returning a remote tab to the local start page closes its guest and clears remote metadata', async () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport(visibleViewport)
    guests[0]!.webContents.finish(0, 'A remote title')
    guests[0]!.webContents.emit('page-favicon-updated', {}, ['https://one.example/icon.png'])
    await manager.navigate('first', '')
    expect(tab(manager)).toMatchObject({
      url: '',
      title: '',
      favicon: null,
      loading: false,
      error: null
    })
    expect(guests[0]!.webContents.destroyed).toBe(true)
    expect(owner.attached.size).toBe(0)
  })

  it('a hidden viewport stays detached through navigation and only resumes on explicit visibility', async () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport(visibleViewport)
    manager.setViewport({ ...visibleViewport, visible: false })
    await manager.navigate('first', 'https://two.example/')
    guests[0]!.webContents.finish(1, 'Hidden page')
    owner.emit('resize')
    expect(owner.attached.size).toBe(0)
    expect(guests[0]!.visible).toBe(false)
    const state = await manager.createTab('https://three.example/')
    expect(guests).toHaveLength(1)
    manager.setViewport(visibleViewport)
    expect(guests).toHaveLength(2)
    expect([...owner.attached]).toEqual([guests[1]])
    expect(tab(manager, state.activeTabId).url).toBe('https://three.example/')
  })

  it('clips a guest to content bounds and detaches a viewport outside the window', () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport({ visible: true, bounds: { x: -20.5, y: 600.2, width: 1100, height: 200 } })
    expect([...owner.attached]).toEqual([guests[0]])
    expect(guests[0]!.bounds).toEqual({ x: 0, y: 601, width: 1000, height: 99 })
    manager.setViewport({ visible: true, bounds: { x: 1001, y: 0, width: 100, height: 100 } })
    expect(owner.attached.size).toBe(0)
    expect(guests[0]!.visible).toBe(false)
  })

  it('rejects a non-finite viewport without detaching or moving the valid guest', () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport(visibleViewport)
    expect(() =>
      manager.setViewport({
        visible: true,
        bounds: { x: Number.NaN, y: 0, width: 100, height: 100 }
      })
    ).toThrow('BROWSER_VIEWPORT_INVALID')
    owner.emit('resize')
    expect([...owner.attached]).toEqual([guests[0]])
    expect(guests[0]!.bounds).toEqual(visibleViewport.bounds)
  })

  it('restores the desired visible viewport when the window is shown without recreating its guest', () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport(visibleViewport)
    owner.visible = false
    owner.emit('hide')
    expect(owner.attached.size).toBe(0)
    expect(guests[0]!.visible).toBe(false)
    expect(guests[0]!.webContents.destroyed).toBe(false)
    owner.visible = true
    owner.emit('show')
    expect(guests).toHaveLength(1)
    expect([...owner.attached]).toEqual([guests[0]])
    expect(guests[0]!.visible).toBe(true)
  })

  it('does not restore a renderer-hidden route when the owner is shown again', () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport(visibleViewport)
    owner.visible = false
    owner.emit('hide')
    manager.setViewport({ ...visibleViewport, visible: false })
    owner.visible = true
    owner.emit('show')
    owner.emit('resize')
    expect(owner.attached.size).toBe(0)
    expect(guests[0]!.visible).toBe(false)
    expect(guests[0]!.webContents.destroyed).toBe(false)
  })

  it('preserves the guest, committed page and recent history across owner same-document navigation', () => {
    const { manager, guests, owner } = createWorkspace()
    manager.setViewport(visibleViewport)
    guests[0]!.webContents.finish(0, 'Committed article')
    const before = manager.getState()
    expect(before.recent).toEqual([
      { url: 'https://one.example/', title: 'Committed article', favicon: null, visitedAt: 123456 }
    ])
    owner.webContents.emit('did-start-navigation', {}, 'https://app.example/#/browser', true, true)
    expect(manager.getState()).toEqual(before)
    expect(guests[0]!.webContents.destroyed).toBe(false)
    expect([...owner.attached]).toEqual([guests[0]])
  })

  it.each(['render-process-gone', 'did-start-navigation'])(
    'destroys guests on owner %s and refuses resize-based reattachment until a new viewport',
    async (eventName) => {
      const { manager, guests, owner } = createWorkspace()
      manager.setViewport(visibleViewport)
      owner.webContents.emit(eventName, {}, 'https://app.example/', false, true)
      expect(guests[0]!.webContents.destroyed).toBe(true)
      expect(owner.attached.size).toBe(0)
      owner.emit('resize')
      await manager.navigate('first', 'https://two.example/')
      expect(guests).toHaveLength(1)
      manager.setViewport(visibleViewport)
      expect(guests).toHaveLength(2)
      expect([...owner.attached]).toEqual([guests[1]])
    }
  )
})

describe('browser asynchronous state authority', () => {
  it('acknowledges commands before network completion and ignores an obsolete load rejection', async () => {
    const { manager, guests, revisions } = createWorkspace()
    manager.setViewport(visibleViewport)
    const contents = guests[0]!.webContents
    const state = await manager.navigate('first', 'https://two.example/')
    expect(state.tabs[0]).toMatchObject({ url: 'https://two.example/', loading: true, error: null })
    contents.loads[0]!.reject(new Error('the superseded first navigation failed'))
    await contents.loads[0]!.promise.catch(() => {})
    expect(tab(manager)).toMatchObject({ url: 'https://two.example/', loading: true, error: null })
    contents.finish(1, 'Second page')
    expect(tab(manager)).toMatchObject({
      url: 'https://two.example/',
      title: 'Second page',
      loading: false,
      error: null
    })
    expect(revisions).toContain(state.revision)
    expect(revisions.at(-1)).toBe(manager.getState().revision)
    expect(
      revisions.every((revision, index) => index === 0 || revision > revisions[index - 1]!)
    ).toBe(true)
  })

  it('reports a current load failure without discarding the tab or its requested URL', async () => {
    const { manager, guests } = createWorkspace()
    manager.setViewport(visibleViewport)
    guests[0]!.webContents.loads[0]!.reject(new Error('connection refused'))
    await guests[0]!.webContents.loads[0]!.promise.catch(() => {})
    expect(tab(manager)).toMatchObject({
      id: 'first',
      url: 'https://one.example/',
      loading: false,
      error: 'BROWSER_LOAD_FAILED'
    })
    await manager.navigate('first', 'https://two.example/')
    guests[0]!.webContents.finish(1, 'Recovered')
    expect(tab(manager)).toMatchObject({
      url: 'https://two.example/',
      title: 'Recovered',
      error: null
    })
  })

  it('ignores closed guest completions rather than resurrecting tabs or recent history', async () => {
    const { manager, guests } = createWorkspace()
    manager.setViewport(visibleViewport)
    const contents = guests[0]!.webContents
    await manager.closeTab('first')
    const state = manager.getState()
    contents.finish(0, 'Late title')
    contents.emit('did-fail-load', {}, -105, 'late failure', 'https://one.example/', true)
    expect(manager.getState()).toEqual(state)
  })

  it('rejects invalid navigation without mutating active tab, history, persistence or revision', async () => {
    const { manager, saved, guests } = createWorkspace()
    manager.setViewport(visibleViewport)
    const state = manager.getState()
    await expect(manager.navigate('first', 'file:///private')).rejects.toThrow(
      'BROWSER_URL_BLOCKED'
    )
    expect(manager.getState()).toEqual(state)
    expect(saved).toEqual([])
    expect(guests[0]!.webContents.loads.map((load) => load.url)).toEqual(['https://one.example/'])
  })

  it('surfaces persistence failure while preserving a valid active tab and resumes later writes', async () => {
    let fail = true
    const { manager, saved } = createWorkspace(() => fail)
    await expect(manager.createTab('https://two.example/')).rejects.toThrow(
      'BROWSER_PERSIST_FAILED'
    )
    const failed = manager.getState()
    expect(failed.tabs.map((item) => item.url)).toEqual([
      'https://one.example/',
      'https://two.example/'
    ])
    expect(tab(manager, failed.activeTabId)).toMatchObject({
      url: 'https://two.example/',
      error: 'BROWSER_PERSIST_FAILED'
    })
    fail = false
    const recovered = await manager.navigate(failed.activeTabId, 'https://three.example/')
    expect(tab(manager, recovered.activeTabId)).toMatchObject({
      url: 'https://three.example/',
      error: null
    })
    expect(saved.at(-1)?.tabs.map((item) => item.url)).toEqual([
      'https://one.example/',
      'https://three.example/'
    ])
    expect(saved.at(-1)?.activeTabId).toBe(recovered.activeTabId)
  })
})

describe('browser restored-state sanitization', () => {
  it('drops unsafe and duplicate persisted pages before creating any guest', async () => {
    const page = { title: 'Saved page', favicon: null, visitedAt: 123 }
    const { manager, guests } = createWorkspace(undefined, {
      tabs: [
        { id: 'unsafe', url: 'file:///private', title: 'Private' },
        { id: 'credential', url: 'https://alice@example.com/', title: 'Credentials' },
        { id: 'safe', url: 'https://safe.example/', title: 'Safe' },
        { id: 'safe', url: 'https://duplicate.example/', title: 'Duplicate ID' },
        { id: 'local', url: '', title: '' }
      ],
      activeTabId: 'unsafe',
      recent: [
        { ...page, url: 'javascript:alert(1)' },
        { ...page, url: 'https://safe.example/', favicon: 'file:///private/icon' },
        { ...page, url: 'https://safe.example/' }
      ],
      bookmarks: [
        { ...page, url: 'https://alice@example.com/' },
        { ...page, url: 'https://saved.example/' }
      ]
    })
    const state = manager.getState()
    expect(state.tabs.map(({ id, url }) => ({ id, url }))).toEqual([
      { id: 'safe', url: 'https://safe.example/' },
      { id: 'local', url: '' }
    ])
    expect(state.tabs.some((item) => item.id === state.activeTabId)).toBe(true)
    expect(state.recent).toEqual([{ ...page, url: 'https://safe.example/' }])
    expect(state.bookmarks).toEqual([{ ...page, url: 'https://saved.example/' }])
    await manager.activateTab('safe')
    manager.setViewport(visibleViewport)
    expect(guests.map((guest) => guest.webContents.loads.map((load) => load.url))).toEqual([
      ['https://safe.example/']
    ])
  })
})

describe('browser durable bookmark authority', () => {
  it('does not expose or announce a bookmark before its durable write commits', async () => {
    const entered = Promise.withResolvers<void>()
    const commit = Promise.withResolvers<void>()
    const { manager, saved, revisions } = createWorkspace(undefined, undefined, async () => {
      entered.resolve()
      await commit.promise
    })
    const before = manager.getState()
    const pending = manager.toggleBookmark('first')
    await entered.promise
    try {
      expect(manager.getState()).toEqual(before)
      expect(revisions).toEqual([])
      expect(saved).toEqual([])
    } finally {
      commit.resolve()
    }
    const committed = await pending
    const expected = [
      { url: 'https://one.example/', title: 'One', favicon: null, visitedAt: 123456 }
    ]
    expect(committed.bookmarks).toEqual(expected)
    expect(saved.at(-1)?.bookmarks).toEqual(expected)
    expect(revisions.at(-1)).toBe(committed.revision)
  })

  it('a failed first toggle cannot invert or roll back a second queued toggle', async () => {
    const firstEntered = Promise.withResolvers<void>()
    const firstResult = Promise.withResolvers<void>()
    const secondEntered = Promise.withResolvers<void>()
    const secondCommit = Promise.withResolvers<void>()
    let writes = 0
    const { manager, saved } = createWorkspace(undefined, undefined, async () => {
      writes += 1
      if (writes === 1) {
        firstEntered.resolve()
        await firstResult.promise
      } else {
        secondEntered.resolve()
        await secondCommit.promise
      }
    })
    const first = manager.toggleBookmark('first')
    const rejectedFirst = expect(first).rejects.toThrow('BROWSER_PERSIST_FAILED')
    await firstEntered.promise
    const second = manager.toggleBookmark('first')
    firstResult.reject(new Error('bookmark write denied'))
    try {
      await rejectedFirst
      await secondEntered.promise
      expect(manager.getState().bookmarks).toEqual([])
      expect(saved).toEqual([])
    } finally {
      secondCommit.resolve()
    }
    const state = await second
    expect(state.bookmarks).toEqual([
      { url: 'https://one.example/', title: 'One', favicon: null, visitedAt: 123456 }
    ])
    expect(saved.at(-1)?.bookmarks).toEqual(state.bookmarks)
  })

  it('a visit queued during bookmark persistence cannot overwrite the bookmark or lose the new recent page', async () => {
    const entered = Promise.withResolvers<void>()
    const commit = Promise.withResolvers<void>()
    let writes = 0
    const { manager, guests, saved } = createWorkspace(undefined, undefined, async () => {
      writes += 1
      if (writes === 1) {
        entered.resolve()
        await commit.promise
      }
    })
    manager.setViewport(visibleViewport)
    const bookmark = manager.toggleBookmark('first')
    await entered.promise
    const navigation = manager.navigate('first', 'https://two.example/article')
    try {
      guests[0]!.webContents.finish(1, 'New article')
      expect(manager.getState().recent).toEqual([
        {
          url: 'https://two.example/article',
          title: 'New article',
          favicon: null,
          visitedAt: 123456
        }
      ])
      expect(manager.getState().bookmarks).toEqual([])
    } finally {
      commit.resolve()
    }
    await Promise.all([bookmark, navigation])
    await manager.dispose()
    const state = manager.getState()
    expect(state.bookmarks).toEqual([
      { url: 'https://one.example/', title: 'One', favicon: null, visitedAt: 123456 }
    ])
    expect(state.recent).toEqual([
      { url: 'https://two.example/article', title: 'New article', favicon: null, visitedAt: 123456 }
    ])
    expect(saved.at(-1)?.bookmarks).toEqual(state.bookmarks)
    expect(saved.at(-1)?.recent).toEqual(state.recent)
    expect(saved.at(-1)?.tabs).toEqual([
      { id: 'first', url: 'https://two.example/article', title: 'New article' }
    ])
  })
})

describe('internal workspace tabs (tuff://)', () => {
  it('allows tuff://store and tuff://settings as internal tabs without attaching guest views', async () => {
    const guests: GuestView[] = []
    const owner = new OwnerWindow()
    const manager = new BrowserWorkspaceManager({
      owner: owner as never,
      createView: () => {
        const guest = new GuestView()
        guests.push(guest)
        return guest as never
      },
      persist: async () => {},
      notify: () => {}
    })

    manager.setViewport({
      visible: true,
      bounds: { x: 0, y: 0, width: 800, height: 600 }
    })

    await manager.createTab('tuff://store')
    expect(manager.getState().tabs).toHaveLength(2)
    const storeTab = manager.getState().tabs[1]!
    expect(storeTab.url).toBe('tuff://store')
    expect(storeTab.title).toBe('')
    expect(owner.attached.size).toBe(0)
    expect(guests.length).toBe(0)

    await manager.createTab('tuff://settings')
    expect(manager.getState().tabs).toHaveLength(3)
    const settingsTab = manager.getState().tabs[2]!
    expect(settingsTab.url).toBe('tuff://settings')
    expect(settingsTab.title).toBe('')
    expect(owner.attached.size).toBe(0)
    expect(guests.length).toBe(0)

    await manager.dispose()
  })
})
