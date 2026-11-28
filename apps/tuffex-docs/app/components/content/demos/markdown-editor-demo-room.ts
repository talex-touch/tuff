import type {
  MarkdownEditorCollaboration,
  MarkdownEditorCollaborationHandlers,
  MarkdownEditorPeer,
  MarkdownEditorPresence,
  MarkdownEditorSelection,
  MarkdownEditorUser,
  MarkdownTextChange,
} from '@talex-touch/tuffex/markdown-editor'
import {
  applyMarkdownChanges,
  composeMarkdownChanges,
  mapMarkdownPosition,
  transformMarkdownChanges,
} from '@talex-touch/tuffex/markdown-editor'

/**
 * A collaboration session that runs in the page, so the demo needs no server:
 * one authoritative document and its history, and clients that reach it after
 * a network's delay. Concurrent edits are rebased with the editor's change-set
 * algebra, as operational transformation does it: the server transforms a
 * change over everything it accepted since the change was made; a client keeps
 * one change in flight, buffers the rest, and rebases what arrives over both.
 * A real host puts the server behind a socket and keeps the client as it is.
 */

type Changes = MarkdownTextChange[]

type ToServer =
  /** `presence`, if any, is where the sender is once `changes` apply. */
  | { type: 'changes', revision: number, changes: Changes, presence: MarkdownEditorPresence | null }
  | { type: 'presence', revision: number, presence: MarkdownEditorPresence }

type ToClient =
  | { type: 'ack' }
  | { type: 'changes', changes: Changes }
  | { type: 'peers', peers: MarkdownEditorPeer[] }

/** One way, in milliseconds. */
const LATENCY: readonly [number, number] = [120, 150]

export interface DemoRoomClient {
  /** The `collaboration` of this person's editor. */
  readonly collaboration: MarkdownEditorCollaboration
  /** The document as this client has it, its own edits included: an editor starts from it. */
  text: () => string
}

export interface DemoRoom {
  join: (user: MarkdownEditorUser) => DemoRoomClient
  /** Drops every message still on its way. */
  dispose: () => void
}

function lengthDelta(changes: Changes): number {
  return changes.reduce((sum, change) => sum + change.insert.length - (change.to - change.from), 0)
}

function mapSelection(selection: MarkdownEditorSelection | null | undefined, changes: Changes | null): MarkdownEditorSelection | null {
  if (!selection)
    return null
  if (!changes?.length)
    return selection
  return { anchor: mapMarkdownPosition(selection.anchor, changes, 1), head: mapMarkdownPosition(selection.head, changes, 1) }
}

function mapPresence(presence: MarkdownEditorPresence, changes: Changes | null): MarkdownEditorPresence {
  return { ...presence, selection: mapSelection(presence.selection, changes) }
}

export function createDemoRoom(initial: string): DemoRoom {
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let disposed = false

  /**
   * Messages one way, each after the network's delay and in the order sent.
   * One timer per direction: timers count whole milliseconds, so one each
   * could overtake the message before it, and the session would diverge; for
   * the same reason, what is due within the millisecond goes now.
   */
  function channel<T>(deliver: (message: T) => void): (message: T) => void {
    const queue: { at: number, message: T }[] = []
    let timer: ReturnType<typeof setTimeout> | null = null

    function arm(): void {
      const head = queue[0]
      if (!head || timer || disposed)
        return
      const current = setTimeout(() => {
        timers.delete(current)
        timer = null
        try {
          while (queue[0] && queue[0].at <= performance.now() + 1) {
            if (disposed)
              break
            deliver(queue.shift()!.message)
          }
        }
        finally {
          arm()
        }
      }, Math.max(0, head.at - performance.now()))
      timer = current
      timers.add(current)
    }

    return (message) => {
      if (disposed)
        return
      const sent = performance.now() + LATENCY[0] + Math.random() * (LATENCY[1] - LATENCY[0])
      queue.push({ at: Math.max(queue.at(-1)?.at ?? 0, sent), message })
      arm()
    }
  }

  // ---- The server ----------------------------------------------------------

  let doc = initial
  /** Every accepted change, with the length of the document it applied to. */
  const history: { changes: Changes, length: number }[] = []
  /** Presence is kept against the server's document. */
  const members = new Map<string, { user: MarkdownEditorUser, presence: MarkdownEditorPresence | null, post: (message: ToClient) => void }>()

  function announce(except?: string): void {
    for (const [id, member] of members) {
      if (id === except)
        continue
      const peers = [...members]
        .filter(([other]) => other !== id)
        .map(([, other]) => ({ ...other.user, selection: other.presence?.selection ?? null, mode: other.presence?.mode }))
      member.post({ type: 'peers', peers })
    }
  }

  function receive(id: string, message: ToServer): void {
    const member = members.get(id)
    if (!member)
      return
    if (message.type === 'presence') {
      // Sent against the server's document at `revision`; moved over what came since.
      member.presence = history.slice(message.revision).reduce((presence, past) => mapPresence(presence, past.changes), message.presence)
      announce(id)
      return
    }
    let { changes, presence } = message
    for (const past of history.slice(message.revision)) {
      const [mine, theirs] = transformMarkdownChanges(changes, past.changes, past.length)
      changes = mine
      if (presence)
        presence = mapPresence(presence, theirs)
    }
    history.push({ changes, length: doc.length })
    doc = applyMarkdownChanges(doc, changes)
    for (const other of members.values()) {
      if (other.presence)
        other.presence = mapPresence(other.presence, changes)
    }
    if (presence)
      member.presence = presence
    for (const [other, { post }] of members)
      post(other === id ? { type: 'ack' } : { type: 'changes', changes })
    if (presence)
      announce(id)
  }

  // ---- A client ------------------------------------------------------------

  function join(user: MarkdownEditorUser): DemoRoomClient {
    const id = user.id
    let revision = history.length
    /** The server's document at `revision`. */
    let confirmed = doc
    let local = doc
    let inflight: Changes | null = null
    let buffer: Changes | null = null
    /** The latest presence not yet sent, against `local`: it goes with the next change, or alone. */
    let presence: MarkdownEditorPresence | null = null
    let peers: MarkdownEditorPeer[] = []
    let handlers: MarkdownEditorCollaborationHandlers | null = null
    /** Remote changes that came before the editor listened. */
    let backlog: Changes[] = []
    let left = false

    const post = channel<ToServer>(message => receive(id, message))

    function sendChanges(changes: Changes): void {
      inflight = changes
      post({ type: 'changes', revision, changes, presence })
      presence = null
    }

    function sendPresence(): void {
      if (presence && !inflight) {
        post({ type: 'presence', revision, presence })
        presence = null
      }
    }

    function onMessage(message: ToClient): void {
      if (message.type === 'ack') {
        confirmed = applyMarkdownChanges(confirmed, inflight ?? [])
        revision++
        inflight = null
        if (buffer)
          sendChanges(buffer)
        buffer = null
        sendPresence()
      }
      else if (message.type === 'changes') {
        let remote = message.changes
        if (inflight) {
          const afterInflight = confirmed.length + lengthDelta(inflight)
          ;[inflight, remote] = transformMarkdownChanges(inflight, remote, confirmed.length)
          if (buffer)
            [buffer, remote] = transformMarkdownChanges(buffer, remote, afterInflight)
        }
        confirmed = applyMarkdownChanges(confirmed, message.changes)
        revision++
        local = applyMarkdownChanges(local, remote)
        if (presence)
          presence = mapPresence(presence, remote)
        // The editor may answer with an edit of its own: everything above is settled first.
        if (handlers)
          handlers.onChanges(remote)
        else
          backlog.push(remote)
      }
      else {
        // Against `confirmed`; this client's unconfirmed changes move them on.
        peers = message.peers.map(peer => ({ ...peer, selection: mapSelection(mapSelection(peer.selection, inflight), buffer) }))
        handlers?.onPeers?.(peers)
      }
    }

    function leave(): void {
      if (left)
        return
      left = true
      handlers = null
      if (members.delete(id))
        announce()
    }

    members.set(id, { user, presence: null, post: channel<ToClient>(message => !left && onMessage(message)) })
    announce()

    const collaboration: MarkdownEditorCollaboration = {
      send(changes) {
        if (left || !changes.length)
          return
        local = applyMarkdownChanges(local, changes)
        if (presence)
          presence = mapPresence(presence, changes)
        if (!inflight)
          sendChanges(changes)
        else
          buffer = buffer ? composeMarkdownChanges(buffer, changes, confirmed.length + lengthDelta(inflight)) : changes
      },
      sendPresence(next) {
        if (left)
          return
        presence = next
        sendPresence()
      },
      subscribe(next) {
        handlers = next
        for (const changes of backlog)
          next.onChanges(changes)
        backlog = []
        next.onPeers?.(peers)
        return leave
      },
    }

    return { collaboration, text: () => local }
  }

  return {
    join,
    dispose() {
      disposed = true
      timers.forEach(clearTimeout)
      timers.clear()
      members.clear()
    },
  }
}

export interface DemoBotScript {
  /** The bot types at the end of the line holding this. */
  after: string
  /** What it types, a character at a time. */
  text: string
  /** Then selects this much of it for a moment. */
  select?: string
}

/** A peer without an editor that types `script` once, then stays; returns the function that sends it away. */
export function startDemoBot(room: DemoRoom, user: MarkdownEditorUser, script: DemoBotScript): () => void {
  const client = room.join(user)
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let stopped = false
  /** The bot's caret, kept on its own text while others type next to it. */
  let caret = -1

  const unsubscribe = client.collaboration.subscribe({
    onChanges: (changes) => {
      if (caret >= 0)
        caret = mapMarkdownPosition(caret, changes, -1)
    },
  })

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer)
        resolve()
      }, ms)
      timers.add(timer)
    })
  }

  function show(anchor: number, head = anchor): void {
    client.collaboration.sendPresence?.({ selection: { anchor, head }, mode: 'wysiwyg' })
  }

  async function run(): Promise<void> {
    await wait(900)
    const text = client.text()
    const at = text.indexOf(script.after)
    if (stopped || at < 0)
      return
    const end = text.indexOf('\n', at)
    caret = end < 0 ? text.length : end
    show(caret)
    await wait(700)
    for (const char of script.text) {
      if (stopped)
        return
      client.collaboration.send([{ from: caret, to: caret, insert: char }])
      caret += char.length
      show(caret)
      await wait(70 + Math.random() * 110)
    }
    if (!script.select)
      return
    await wait(900)
    const from = client.text().lastIndexOf(script.select, caret)
    if (stopped || from < 0)
      return
    show(from, from + script.select.length)
    await wait(2200)
    if (!stopped)
      show(caret)
  }

  void run()
  return () => {
    stopped = true
    timers.forEach(clearTimeout)
    timers.clear()
    unsubscribe()
  }
}
