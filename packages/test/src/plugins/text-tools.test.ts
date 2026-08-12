import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule, withoutGlobal } from './plugin-loader'

const textToolsUrl = new URL('../../../../plugins/touch-text-tools/index.js', import.meta.url)

// The plugin's MD5 / SHA-1 items call globalThis.crypto.digest(algorithm, bytes) --
// a host capability, not Web Crypto (whose digest lives on crypto.subtle and has no
// MD5 anyway). Node's global crypto has no such method, so digestHex threw
// CRYPTO_DIGEST_UNAVAILABLE. The hash items are not individually guarded, so the throw
// escaped onFeatureTriggered and every test in this file received the generic
// '加载失败' item rather than any real output -- four different assertions, one cause.
//
// It is installed here rather than through createPluginGlobals because the loader
// restores overridden globals as soon as the module finishes compiling. Globals the
// plugin destructures at module scope survive that; globalThis.crypto is read inside
// digestHex at call time, long after the restore, so it has to be present for the
// duration of the test. Backed by node:crypto so the hashes are genuine.
const realCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto')

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    writable: true,
    value: {
      async digest(algorithm: string, data: Uint8Array) {
        const hash = createHash(algorithm.toLowerCase().replace('-', ''))
        hash.update(data)
        return new Uint8Array(hash.digest()).buffer
      },
    },
  })
})

afterAll(() => {
  if (realCrypto)
    Object.defineProperty(globalThis, 'crypto', realCrypto)
})

class FakeBuilder {
  item: Record<string, any>

  constructor(id: string) {
    this.item = { id, actions: [] }
  }

  setSource() {
    return this
  }

  setTitle(title: string) {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.item.subtitle = subtitle
    return this
  }

  setIcon() {
    return this
  }

  setMeta(meta: Record<string, any>) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id: string, type: string, title: string, payload: any) {
    this.item.actions.push({ id, type, title, payload })
    return this
  }

  build() {
    return this.item
  }
}

describe('touch-text-tools actions', () => {
  it('builds copy actions as plugin actions', async () => {
    const pushed: Array<Array<Record<string, any>>> = []
    const pluginModule = loadPluginModule(textToolsUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      plugin: {
        feature: {
          clearItems() {},
          pushItems(items: Array<Record<string, any>>) { pushed.push(items) },
        },
        box: { hide() {} },
        storage: {
          async getFile() {
            return null
          },
          async setFile() {},
        },
      },
    }))

    await pluginModule.onFeatureTriggered('text-tools', 'Hello')

    expect(pushed[0][0].actions[0]).toMatchObject({
      id: 'copy',
      type: 'plugin',
      title: '复制',
      payload: { text: 'HELLO' },
    })
  })

  // e37c92c8c moved the permission model host-side: this plugin no longer calls the
  // permission SDK, it calls clipboard.writeText and reads the thrown error, where
  // PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED means denied and anything else means the
  // write failed (index.js:324-333). These drove permission.request, which nothing
  // reads any more.
  const HOST_DENIED = 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'

  function copyItem(text: string) {
    return {
      meta: { defaultAction: 'copy' },
      actions: [{ id: 'copy', type: 'plugin', payload: { text } }],
    }
  }

  function moduleWithClipboard(clipboard: unknown) {
    return loadPluginModule(textToolsUrl, createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      clipboard,
      plugin: {
        feature: { clearItems() {}, pushItems() {} },
        box: { hide() {} },
        storage: {
          async getFile() {
            return null
          },
          async setFile() {},
        },
      },
    }))
  }

  it('blocks copy action when the host denies clipboard.write', async () => {
    const writeText = vi.fn(async () => {
      throw Object.assign(new Error('/private/clipboard denied'), { code: HOST_DENIED })
    })

    const result = await moduleWithClipboard({ writeText }).onItemAction(copyItem('HELLO'))

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'permission-denied',
      message: '缺少 clipboard.write 权限',
    })
  })

  it('separates a failed clipboard write from a denied one', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('clipboard transport failed')
    })

    const result = await moduleWithClipboard({ writeText }).onItemAction(copyItem('HELLO'))

    // Reporting a transport failure as a denial sends the user to a permission screen
    // that has nothing to fix.
    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-write-failed',
      message: '复制失败',
    })
  })

  it('blocks copy action when the host exposes no clipboard', async () => {
    const result = await moduleWithClipboard(withoutGlobal()).onItemAction(copyItem('HELLO'))

    expect(result).toMatchObject({
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-unavailable',
      message: '当前环境不支持写入剪贴板',
    })
  })

  it('copies the payload text when the host allows it', async () => {
    const writeText = vi.fn(async () => undefined)

    const result = await moduleWithClipboard({ writeText }).onItemAction(copyItem('HELLO'))

    expect(result).toMatchObject({ externalAction: true, status: 'started' })
    expect(writeText).toHaveBeenCalledWith('HELLO')
  })
})
