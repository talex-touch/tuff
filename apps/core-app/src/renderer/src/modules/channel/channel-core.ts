import type {
  ITouchClientChannel,
  RawChannelSyncData,
  RawStandardChannelData,
  StandardChannelData
} from '@talex-touch/utils/channel'

import type { IpcRendererEvent } from 'electron'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { formatPayloadPreview } from '@talex-touch/utils/common/utils/payload-preview'
import { reportPerfToMain } from '~/modules/perf/perf-report'

// Use preload-exposed ipcRenderer via electron-toolkit
const ipcRenderer = window.electron.ipcRenderer
const CHANNEL_DEFAULT_TIMEOUT = 60_000
const CHANNEL_SENDSYNC_WARN_MS = 80
const CHANNEL_SEND_WARN_MS = 500
const CHANNEL_SEND_ERROR_MS = 2_000

class TouchChannel implements ITouchClientChannel {
  channelMap: Map<string, ((data: StandardChannelData) => any)[]> = new Map()

  pendingMap: Map<string, (data: RawStandardChannelData) => void> = new Map()

  constructor() {
    ipcRenderer.on('@main-process-message', this.__handle_main.bind(this))
  }

  __parse_raw_data(e: IpcRendererEvent | null, arg: any): RawStandardChannelData | null {
    if (arg) {
      const { name, header, code, plugin, data, sync } = arg

      if (header) {
        return {
          header: {
            status: header.status || 'request',
            type: ChannelType.MAIN,
            _originData: arg,
            event: e || undefined
          },
          sync,
          code,
          data,
          plugin,
          name: name as string
        }
      }
    }

    console.error(e, arg)
    return null
    // throw new Error("Invalid message!");
  }

  __handle_main(e: IpcRendererEvent, arg: any): void {
    const rawData = this.__parse_raw_data(e, arg)
    if (!rawData?.header) {
      console.error('Invalid message: ', arg)
      return
    }

    if (rawData.header.status === 'reply' && rawData.sync) {
      const { id } = rawData.sync

      return this.pendingMap.get(id)?.(rawData)
    }

    this.channelMap.get(rawData.name)?.forEach((func) => {
      let replySent = false
      const handInData: StandardChannelData & { replySent?: boolean } = {
        reply: (code: DataCode, data: any) => {
          if (replySent) return
          replySent = true
          e.sender.send(
            '@main-process-message',
            this.__parse_sender(code, rawData, data, rawData.sync)
          )
        },
        ...rawData
      }

      const res = func(handInData)

      if (res instanceof Promise) {
        res
          .then((data) => {
            if (!replySent) {
              handInData.reply(DataCode.SUCCESS, data)
            }
          })
          .catch((err) => {
            if (!replySent) {
              handInData.reply(DataCode.ERROR, err)
            }
          })
        return
      }

      if (!replySent) {
        handInData.reply(DataCode.SUCCESS, res)
      }
    })
  }

  __parse_sender(
    code: DataCode,
    rawData: RawStandardChannelData,
    data: any,
    sync?: RawChannelSyncData
  ): RawStandardChannelData {
    return {
      code,
      data,
      sync: !sync
        ? undefined
        : {
            timeStamp: new Date().getTime(),
            // reply sync timeout should follow the request timeout, unless user set it.
            timeout: sync.timeout,
            id: sync.id
          },
      name: rawData.name,
      plugin: rawData.plugin,
      header: {
        status: 'reply',
        type: rawData.header.type,
        _originData: rawData.header._originData
      }
    }
  }

  regChannel(eventName: string, callback: (data: StandardChannelData) => void): () => void {
    const listeners = this.channelMap.get(eventName) || []

    if (!listeners.includes(callback)) {
      listeners.push(callback)
    } else {
      return () => {}
    }

    this.channelMap.set(eventName, listeners)

    return () => {
      const index = listeners.indexOf(callback)

      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }
  }

  private formatPayloadPreview(payload: unknown): string {
    return formatPayloadPreview(payload)
  }

  send(eventName: string, arg: any): Promise<any> {
    const uniqueId = `${new Date().getTime()}#${eventName}@${Math.random().toString(12)}`
    const startedAt = performance.now()
    const stack = new Error().stack

    const data = {
      code: DataCode.SUCCESS,
      data: arg,
      sync: {
        timeStamp: new Date().getTime(),
        timeout: CHANNEL_DEFAULT_TIMEOUT,
        id: uniqueId
      },
      name: eventName,
      header: {
        status: 'request',
        type: ChannelType.MAIN
      }
    } as RawStandardChannelData

    return new Promise((resolve, reject) => {
      try {
        ipcRenderer.send('@main-process-message', data)
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        console.error(`[Channel] Failed to send "${eventName}": ${errorMessage}`, {
          payloadPreview: this.formatPayloadPreview(arg)
        })
        reject(
          Object.assign(
            new Error(`Failed to send channel message "${eventName}": ${errorMessage}`),
            { code: 'channel_send_failed' }
          )
        )
        return
      }

      const timeoutMs = data.sync?.timeout ?? CHANNEL_DEFAULT_TIMEOUT
      const timeoutHandle = setTimeout(() => {
        if (!this.pendingMap.has(uniqueId)) return
        this.pendingMap.delete(uniqueId)
        const error = Object.assign(
          new Error(`Channel request "${eventName}" timed out after ${timeoutMs}ms`),
          { code: 'channel_timeout' }
        )
        console.warn(error.message, {
          payloadPreview: this.formatPayloadPreview(arg),
          stack
        })
        reportPerfToMain({
          kind: 'channel.send.timeout',
          eventName,
          durationMs: timeoutMs,
          at: Date.now(),
          payloadPreview: this.formatPayloadPreview(arg),
          stack,
          meta: { timeoutMs, syncId: uniqueId }
        })
        reject(error)
      }, timeoutMs)

      this.pendingMap.set(uniqueId, (res) => {
        clearTimeout(timeoutHandle)
        this.pendingMap.delete(uniqueId)

        const duration = performance.now() - startedAt
        if (duration >= CHANNEL_SEND_ERROR_MS) {
          const logSlow = eventName === 'market:http-request' ? console.warn : console.error
          logSlow(`[Channel][send][slow] "${eventName}" took ${duration.toFixed(1)}ms`, {
            payloadPreview: this.formatPayloadPreview(arg),
            stack
          })
          reportPerfToMain({
            kind: 'channel.send.slow',
            eventName,
            durationMs: duration,
            at: Date.now(),
            payloadPreview: this.formatPayloadPreview(arg),
            stack,
            meta: { threshold: CHANNEL_SEND_ERROR_MS, syncId: uniqueId }
          })
        } else if (duration >= CHANNEL_SEND_WARN_MS) {
          console.warn(`[Channel][send][slow] "${eventName}" took ${duration.toFixed(1)}ms`, {
            payloadPreview: this.formatPayloadPreview(arg),
            stack
          })
          reportPerfToMain({
            kind: 'channel.send.slow',
            eventName,
            durationMs: duration,
            at: Date.now(),
            payloadPreview: this.formatPayloadPreview(arg),
            stack,
            meta: { threshold: CHANNEL_SEND_WARN_MS, syncId: uniqueId }
          })
        }

        if (res.code === DataCode.ERROR) {
          console.warn(`[Channel][send][errorReply] "${eventName}" replied with ERROR`, {
            payloadPreview: this.formatPayloadPreview(arg),
            replyPreview: this.formatPayloadPreview(res.data),
            stack
          })
          reportPerfToMain({
            kind: 'channel.send.errorReply',
            eventName,
            durationMs: duration,
            at: Date.now(),
            payloadPreview: this.formatPayloadPreview(arg),
            stack,
            meta: {
              replyPreview: this.formatPayloadPreview(res.data),
              syncId: uniqueId
            }
          })
        }

        resolve(res.data)
      })
    })
  }

  sendSync(eventName: string, arg?: any): any {
    const data = {
      code: DataCode.SUCCESS,
      data: arg,
      name: eventName,
      header: {
        status: 'request',
        type: ChannelType.MAIN
      }
    } as RawStandardChannelData

    try {
      const startedAt = performance.now()
      const raw = ipcRenderer.sendSync('@main-process-message', data)
      const duration = performance.now() - startedAt

      if (duration >= CHANNEL_SENDSYNC_WARN_MS) {
        console.warn(
          `[Channel][sendSync][slow] "${eventName}" blocked renderer for ${duration.toFixed(1)}ms`,
          {
            payloadPreview: this.formatPayloadPreview(arg),
            stack: new Error().stack
          }
        )
        reportPerfToMain({
          kind: 'channel.sendSync.slow',
          eventName,
          durationMs: duration,
          at: Date.now(),
          payloadPreview: this.formatPayloadPreview(arg),
          stack: new Error().stack
        })
      }

      const res = this.__parse_raw_data(null, raw)

      if (res?.header?.status === 'reply') return res.data

      return res
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`[Channel] Failed to sendSync "${eventName}": ${errorMessage}`, {
        payloadPreview: this.formatPayloadPreview(arg)
      })
      throw Object.assign(
        new Error(`Failed to sendSync channel message "${eventName}": ${errorMessage}`),
        { code: 'channel_send_failed' }
      )
    }
  }

  unRegChannel(eventName: string, callback: (data: StandardChannelData) => any): boolean {
    const callbacks = this.channelMap.get(eventName)
    if (callbacks) {
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
        return true
      }
    }
    return false
  }
}

export const touchChannel: ITouchClientChannel = (window.$channel = new TouchChannel())
