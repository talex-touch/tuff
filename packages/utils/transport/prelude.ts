type PluginChannelPreludeOptions = {
  uniqueKey: string
  initialData?: Record<string, unknown>
}

const DATA_CODE = {
  SUCCESS: 200,
  NETWORK_ERROR: 500,
  ERROR: 100,
} as const

export function getPluginChannelPreludeCode(options: PluginChannelPreludeOptions): string {
  const initialData = options.initialData ?? {}

  return `
(function() {
  const uniqueKey = ${JSON.stringify(options.uniqueKey)};
  window['$tuffInitialData'] = ${JSON.stringify(initialData)};
  const { ipcRenderer } = require('electron');
  const DataCode = ${JSON.stringify(DATA_CODE)};
  const CHANNEL_DEFAULT_TIMEOUT = 60000;

  class TouchChannel {
    channelMap = new Map();
    pendingMap = new Map();
    earlyMessageQueue = new Map();

    constructor() {
      ipcRenderer.on('@plugin-process-message', this.__handle_main.bind(this));
    }

    __parse_raw_data(e, arg) {
      if (arg) {
        const { name, header, code, plugin, data, sync } = arg;
        if (header) {
          const { uniqueKey: thisUniqueKey } = header;
          if (!thisUniqueKey) {
            console.warn('[Plugin] uniqueKey missing in header:', arg);
          } else if (thisUniqueKey !== uniqueKey) {
            console.error('[Plugin] uniqueKey mismatch:', thisUniqueKey, uniqueKey);
            return null;
          }
          return {
            header: {
              status: header.status || 'request',
              type: 'main',
              _originData: arg,
              event: e || undefined
            },
            sync,
            code,
            data,
            plugin,
            name
          };
        }
      }
      console.error(e, arg);
      return null;
    }

    __handle_main(e, arg) {
      const rawData = this.__parse_raw_data(e, arg);
      if (!rawData?.header) return;
      if (rawData.header.status === 'reply' && rawData.sync) {
        const { id } = rawData.sync;
        return this.pendingMap.get(id)?.(rawData);
      }
      const listeners = this.channelMap.get(rawData.name);
      if (listeners && listeners.length > 0) {
        this.__dispatch(e, rawData, listeners);
      } else {
        const queue = this.earlyMessageQueue.get(rawData.name) || [];
        queue.push({ e, rawData });
        this.earlyMessageQueue.set(rawData.name, queue);
      }
    }

    __dispatch(e, rawData, listeners) {
      listeners.forEach((func) => {
        const handInData = {
          reply: (code, data) => {
            e.sender.send(
              '@plugin-process-message',
              this.__parse_sender(code, rawData, data, rawData.sync)
            );
          },
          ...rawData
        };
        func(handInData);
        handInData.reply(DataCode.SUCCESS, undefined);
      });
    }

    __parse_sender(code, rawData, data, sync) {
      return {
        code,
        data,
        sync: !sync ? undefined : {
          timeStamp: new Date().getTime(),
          timeout: sync.timeout,
          id: sync.id
        },
        name: rawData.name,
        header: {
          status: 'reply',
          type: rawData.header.type,
          _originData: rawData.header._originData
        }
      };
    }

    regChannel(eventName, callback) {
      const listeners = this.channelMap.get(eventName) || [];
      if (!listeners.includes(callback)) {
        listeners.push(callback);
      } else {
        return () => {};
      }
      this.channelMap.set(eventName, listeners);

      const earlyMessages = this.earlyMessageQueue.get(eventName);
      if (earlyMessages && earlyMessages.length > 0) {
        this.earlyMessageQueue.delete(eventName);
        earlyMessages.forEach(({ e, rawData }) => {
          this.__dispatch(e, rawData, [callback]);
        });
      }

      return () => {
        const index = listeners.indexOf(callback);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
      };
    }

    send(eventName, arg) {
      const uniqueId = Date.now() + '#' + eventName + '@' + Math.random().toString(12);
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
          uniqueKey,
          status: 'request',
          type: 'plugin'
        }
      };
      const instance = this;
      return new Promise((resolve, reject) => {
        try {
          ipcRenderer.send('@plugin-process-message', data);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[Plugin] Failed to send channel message', eventName, errorMessage);
          const sendError = new Error('Failed to send plugin channel message "' + eventName + '": ' + errorMessage);
          sendError.code = 'plugin_channel_send_failed';
          reject(sendError);
          return;
        }

        const timeoutMs = data.sync?.timeout ?? CHANNEL_DEFAULT_TIMEOUT;
        const timeoutHandle = setTimeout(() => {
          if (!instance.pendingMap.has(uniqueId)) return;
          instance.pendingMap.delete(uniqueId);
          const timeoutError = new Error('Plugin channel request "' + eventName + '" timed out after ' + timeoutMs + 'ms');
          timeoutError.code = 'plugin_channel_timeout';
          console.warn(timeoutError.message);
          reject(timeoutError);
        }, timeoutMs);

        instance.pendingMap.set(uniqueId, (res) => {
          clearTimeout(timeoutHandle);
          instance.pendingMap.delete(uniqueId);
          resolve(res.data);
        });
      });
    }

    sendSync(eventName, arg) {
      const data = {
        code: DataCode.SUCCESS,
        data: arg,
        name: eventName,
        header: {
          uniqueKey,
          status: 'request',
          type: 'plugin'
        }
      };
      try {
        const res = this.__parse_raw_data(null, ipcRenderer.sendSync('@plugin-process-message', data));
        if (res?.header?.status === 'reply') return res.data;
        return res;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[Plugin] Failed to sendSync channel message', eventName, errorMessage);
        throw new Error('Failed to sendSync plugin channel message "' + eventName + '": ' + errorMessage);
      }
    }
  }

  window['$channel'] = new TouchChannel();
})();
`
}
