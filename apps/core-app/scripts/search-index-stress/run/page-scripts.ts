/**
 * Everything that runs inside the app's renderer lives here, as source text for `Runtime.evaluate`.
 * It speaks the raw `@main-process-message` envelope that the renderer's own channel uses and
 * drives the `core-box:search:session` stream exactly as the CoreBox renderer does. A rename of
 * an event, a field or the envelope is a one-file fix.
 */

export const BRIDGE_VERSION = 1
export const MAIN_CHANNEL = '@main-process-message'
export const SEARCH_STREAM_EVENT = 'core-box:search:session'

/** Plain ES2019 on purpose: it is never transpiled, so what is reviewed is what runs. */
export const BRIDGE_SOURCE = `(function () {
  var VERSION = ${BRIDGE_VERSION};
  var previous = window.__tuffStress;
  if (previous && previous.version === VERSION) return { installed: false, version: VERSION };
  if (previous && typeof previous.dispose === 'function') {
    try { previous.dispose(); } catch (error) { void error; }
  }
  var ipc = window.electron && window.electron.ipcRenderer;
  if (!ipc || typeof ipc.send !== 'function' || typeof ipc.on !== 'function') {
    throw new Error('window.electron.ipcRenderer is not available in this page');
  }
  var CHANNEL = '${MAIN_CHANNEL}';
  var STREAM_PREFIX = '${SEARCH_STREAM_EVENT}:stream:';
  var sequence = 0;
  var replies = new Map();
  var ops = new Map();
  var streams = new Map();

  function nowMs() { return performance.now(); }
  function round(value) { return Math.round(value * 10) / 10; }
  function failure(error) { return error && error.message ? String(error.message) : String(error); }
  function describe(value) {
    if (value && typeof value === 'object' && typeof value.message === 'string') return value.message;
    try { return JSON.stringify(value).slice(0, 300); } catch (error) { return String(value); }
  }

  function post(name, data, timeoutMs, onReply) {
    var id = Date.now() + '#' + name + '@' + (++sequence) + '.' + Math.random().toString(36).slice(2, 8);
    if (onReply) {
      replies.set(id, onReply);
      setTimeout(function () { replies.delete(id); }, timeoutMs + 1000);
    }
    ipc.send(CHANNEL, {
      code: 200,
      data: data,
      sync: { timeStamp: Date.now(), timeout: timeoutMs, id: id },
      name: name,
      header: { status: 'request', type: 'main' }
    });
    return id;
  }

  function wake(op) {
    var waiter = op.waiter;
    if (waiter) { op.waiter = null; waiter(); }
  }
  function addEvent(op, event) {
    event.t = round(nowMs() - op.startedAt);
    op.events.push(event);
    wake(op);
  }
  function finish(op) {
    if (op.done) return;
    op.done = true;
    op.doneAt = nowMs();
    clearTimeout(op.timer);
    if (op.streamId) streams.delete(op.streamId);
    wake(op);
  }
  function fail(op, kind, message, code) {
    if (op.done) return;
    op.error = { kind: kind, message: message, code: code === undefined ? null : code };
    finish(op);
  }

  function project(item) {
    var render = item && item.render && item.render.basic;
    var meta = item && item.meta;
    var scoring = item && item.scoring;
    var details = scoring && scoring.match_details;
    return {
      id: String(item.id),
      kind: String(item.kind === undefined || item.kind === null ? '' : item.kind),
      title: String(render && render.title !== undefined && render.title !== null ? render.title : ''),
      sourceId: String(item.source && item.source.id !== undefined ? item.source.id : ''),
      sourceType: String(item.source && item.source.type !== undefined ? item.source.type : ''),
      appPath: meta && meta.app && typeof meta.app.path === 'string' ? meta.app.path : null,
      filePath: meta && meta.file && typeof meta.file.path === 'string' ? meta.file.path : null,
      score: scoring && typeof scoring.final === 'number' ? scoring.final : null,
      pinned: !!(scoring && scoring.pinned === true),
      matchType: details && typeof details.type === 'string' ? details.type : null
    };
  }
  function projectAll(items) {
    var out = [];
    if (!Array.isArray(items)) return out;
    for (var i = 0; i < items.length; i += 1) out.push(project(items[i]));
    return out;
  }

  function onChunk(op, chunk) {
    if (!chunk || typeof chunk !== 'object') return;
    try {
      switch (chunk.type) {
        case 'session':
          op.sessionId = chunk.sessionId;
          addEvent(op, { k: 'session' });
          break;
        case 'snapshot':
          addEvent(op, { k: 'snapshot', items: projectAll(chunk.result && chunk.result.items) });
          break;
        case 'update':
          addEvent(op, { k: 'update', items: projectAll(chunk.items) });
          break;
        case 'no-results':
          addEvent(op, { k: 'no-results' });
          break;
        case 'complete':
          op.endSignal = true;
          op.cancelled = chunk.cancelled === true;
          addEvent(op, { k: 'complete' });
          finish(op);
          break;
        default:
          break;
      }
    } catch (error) {
      fail(op, 'protocol', failure(error));
    }
  }

  function onMessage(_event, message) {
    if (!message || typeof message !== 'object') return;
    var header = message.header;
    if (header && header.status === 'reply' && message.sync) {
      var handler = replies.get(message.sync.id);
      if (handler) { replies.delete(message.sync.id); handler(message); }
      return;
    }
    var name = message.name;
    if (typeof name !== 'string' || name.indexOf(STREAM_PREFIX) !== 0) return;
    var rest = name.slice(STREAM_PREFIX.length);
    var colon = rest.indexOf(':');
    if (colon < 0) return;
    var op = streams.get(rest.slice(colon + 1));
    if (!op) return;
    var kind = rest.slice(0, colon);
    var payload = message.data;
    if (kind === 'data') {
      onChunk(op, payload && payload.chunk);
    } else if (kind === 'end') {
      op.endSignal = true;
      finish(op);
    } else if (kind === 'error') {
      fail(op, 'stream', String(payload && payload.error ? payload.error : 'stream error'), payload && payload.code);
    }
  }
  var unsubscribe = ipc.on(CHANNEL, onMessage);

  function newOp(id, kind, timeoutMs) {
    if (ops.has(id)) throw new Error('duplicate operation ' + id);
    var op = {
      id: id, kind: kind, streamId: null, sessionId: null, startedAt: nowMs(), doneAt: 0,
      events: [], cursor: 0, done: false, endSignal: false, cancelled: false, timedOut: false,
      reply: null, error: null, waiter: null, timer: null
    };
    ops.set(id, op);
    return op;
  }

  function cancelStream(op) {
    try { post(STREAM_PREFIX + 'cancel', { streamId: op.streamId }, 5000); } catch (error) { void error; }
  }

  function searchStart(id, query, timeoutMs) {
    var op = newOp(id, 'search', timeoutMs);
    op.streamId = 'stress-' + id + '-' + Math.random().toString(36).slice(2, 8);
    streams.set(op.streamId, op);
    op.timer = setTimeout(function () {
      if (op.done) return;
      op.timedOut = true;
      cancelStream(op);
      finish(op);
    }, timeoutMs);
    try {
      op.startedAt = nowMs();
      post(
        STREAM_PREFIX + 'start',
        { query: { text: query, inputs: [] }, activations: null, surface: 'core-box', streamId: op.streamId },
        15000,
        function (reply) {
          if (reply.code !== 200) fail(op, 'main-error', 'stream start refused: ' + describe(reply.data));
        }
      );
    } catch (error) {
      fail(op, 'protocol', failure(error));
    }
    return true;
  }

  function callStart(id, name, data, timeoutMs) {
    var op = newOp(id, 'call', timeoutMs);
    op.timer = setTimeout(function () {
      fail(op, 'timeout', 'no reply to ' + name + ' within ' + timeoutMs + ' ms');
    }, timeoutMs);
    try {
      post(name, data, timeoutMs, function (reply) {
        op.reply = { code: reply.code, data: reply.data === undefined ? null : reply.data };
        finish(op);
      });
    } catch (error) {
      fail(op, 'protocol', failure(error));
    }
    return true;
  }

  function drain(op) {
    var events = op.events.slice(op.cursor);
    op.cursor = op.events.length;
    var out = { events: events, done: op.done };
    if (op.done) {
      out.endSignal = op.endSignal;
      out.cancelled = op.cancelled;
      out.timedOut = op.timedOut;
      out.error = op.error;
      out.reply = op.reply;
      out.sessionId = op.sessionId;
      out.answerMs = round(op.doneAt - op.startedAt);
      ops.delete(op.id);
    }
    return out;
  }

  function wait(id, sliceMs) {
    var op = ops.get(id);
    if (!op) return Promise.resolve({ gone: true });
    return new Promise(function (resolve) {
      var timer = null;
      var deliver = function () {
        if (timer !== null) clearTimeout(timer);
        op.waiter = null;
        resolve(drain(op));
      };
      if (op.cursor < op.events.length || op.done) { deliver(); return; }
      timer = setTimeout(deliver, sliceMs);
      op.waiter = deliver;
    });
  }

  function cancel(id) {
    var op = ops.get(id);
    if (!op) return false;
    if (!op.done) {
      if (op.kind === 'search') cancelStream(op);
      finish(op);
    }
    ops.delete(id);
    return true;
  }

  function status() {
    return { version: VERSION, ops: ops.size, streams: streams.size, replies: replies.size, now: nowMs() };
  }

  function dispose() {
    if (typeof unsubscribe === 'function') unsubscribe();
    else if (typeof ipc.removeListener === 'function') ipc.removeListener(CHANNEL, onMessage);
    ops.forEach(function (op) { clearTimeout(op.timer); });
    ops.clear();
    streams.clear();
    replies.clear();
    if (window.__tuffStress && window.__tuffStress.version === VERSION) delete window.__tuffStress;
  }

  window.__tuffStress = {
    version: VERSION, searchStart: searchStart, callStart: callStart, wait: wait,
    cancel: cancel, status: status, dispose: dispose
  };
  return { installed: true, version: VERSION };
})()`

export interface PageState {
  /** The preload's ipcRenderer is there, which the bridge needs. */
  ipc: boolean
  /** The preload's `windowMode`; null when the page reports none. */
  mode: string | null
  /** The CoreBox window, the surface a user searches in. */
  box: boolean
}

/** Windows share one index.html and title, so only the preload's `windowMode` (body class `core-box` as a fallback) tells the CoreBox page apart. */
export const PAGE_STATE_EXPRESSION = `(function () {
  var w = window;
  var ipc = !!(w.electron && w.electron.ipcRenderer && typeof w.electron.ipcRenderer.send === 'function' && typeof w.electron.ipcRenderer.on === 'function');
  var mode = null;
  try {
    var context = w.api && typeof w.api.getStartupContextSnapshot === 'function' ? w.api.getStartupContextSnapshot() : null;
    if (context && typeof context.windowMode === 'string') mode = context.windowMode;
  } catch (error) { void error; }
  var classes = document.body && document.body.classList;
  var box = mode !== null ? mode === 'CoreBox' : !!(classes && classes.contains('core-box') && !classes.contains('division-box'));
  return { ipc: ipc, mode: mode, box: box };
})()`

const encode = (value: unknown): string => JSON.stringify(value === undefined ? null : value)

/** A bridge method call that answers `{ missing: true }` instead of throwing when the page was reloaded. */
export function bridgeCall(method: string, ...args: unknown[]): string {
  return `(window.__tuffStress ? window.__tuffStress.${method}(${args.map(encode).join(',')}) : { missing: true })`
}

export interface BridgeEvent {
  k: 'session' | 'snapshot' | 'update' | 'no-results' | 'complete'
  /** ms since the query was sent, measured in the page. */
  t: number
  items?: Array<{
    id: string
    kind: string
    title: string
    sourceId: string
    sourceType: string
    appPath: string | null
    filePath: string | null
    score: number | null
    pinned: boolean
    matchType: string | null
  }>
}

export interface BridgeSlice {
  missing?: true
  gone?: true
  events?: BridgeEvent[]
  done?: boolean
  endSignal?: boolean
  cancelled?: boolean
  timedOut?: boolean
  answerMs?: number
  sessionId?: string | null
  reply?: { code: number; data: unknown } | null
  error?: { kind: string; message: string; code: string | null } | null
}
