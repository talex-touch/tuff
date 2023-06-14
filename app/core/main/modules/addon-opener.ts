import { ChannelType, DataCode } from '@talex-touch/utils/channel';
import { APP_SCHEMA } from "../config/default";
import { TalexTouch } from "../types";
import { PluginResolver, ResolverStatus } from "../plugins/plugin-resolver";
import { genTouchChannel } from "../core/channel-core";
import { protocol } from 'electron';
import path from 'path';

function windowsAdapter(touchApp: TalexTouch.TouchApp) {
  const app = touchApp.app;

  app.on("second-instance", (event, argv, workingDirectory) => {
    const win = touchApp.window.window;

    if (win.isMinimized()) win.restore();
    win.focus();

    const url = argv.find((v) => v.startsWith(`${APP_SCHEMA}://`));
    if (url) {
      onSchema(url);
    }
  });
}

function macOSAdapter(touchApp: TalexTouch.TouchApp) {
  const app = touchApp.app;

  app.on("open-url", (event, url) => {
    onSchema(url);
  });
}

function onSchema(url: string) {
    console.log("[Addon] Opened schema: " + url);
}

export default {
  name: Symbol("AddonOpener"),
  filePath: false,
  listeners: new Array<Function>(),
  init(app, manager) {
    const touchChannel = genTouchChannel();
    const win = app.window.window;

    windowsAdapter(app);
    macOSAdapter(app);

    app.app.setAsDefaultProtocolClient(APP_SCHEMA, process.cwd());

    protocol.registerFileProtocol('touch-plugin', (request, callback) => {
        console.log('[Addon] Protocol opened file: ' + request.url)
        const url = request.url.substr(15)
        const fileExt = path.extname(url)
        if (fileExt === '.touch-plugin') {
            return callback({ error: 1, data: 'Unsupported file type' })
        }
        callback({ path: path.normalize(url) })
    })

    async function onOpenFile(url: any) {
      await touchChannel.send(ChannelType.MAIN, "@mock-drop", url);
    }

    app.app.on("open-file", (event, filePath) => {
      event.preventDefault();

      console.log("[Addon] Opened file: " + filePath);

      win.previewFile(filePath);

      touchChannel.send(ChannelType.MAIN, "@open-plugin", filePath);
    });

    this.listeners.push(
      touchChannel.regChannel(ChannelType.MAIN, "@install-plugin", ({ data, reply }) => {
        new PluginResolver(data).resolve(({ event, type }) => {
          console.log("[AddonInstaller] Installed file: " + data);

          reply(DataCode.SUCCESS, {
            status: type,
            msg: event.msg,
            event,
          });
        }, true);
      })
    );

    this.listeners.push(
      touchChannel.regChannel(ChannelType.MAIN, 'drop:plugin', async ({ data, reply }) => {
        console.log("[AddonDropper] Dropped file: " + data);

        new PluginResolver(data).resolve(({ event, type }) => {
          console.log(event, type);

          if (type === "error") {
            if (event.msg === ResolverStatus.BROKEN_PLUGIN_FILE) {
              return reply(DataCode.SUCCESS, {
                status: "error",
                msg: "10091",
              });
            } else {
              return reply(DataCode.SUCCESS, {
                status: "error",
                msg: "10092",
              });
            }
          } else {
            return reply(DataCode.SUCCESS, {
              status: "success",
              manifest: event.msg,
              msg: "10090",
            });
          }

          /*return reply({
                          status: 'unknown',
                          msg: '-1'
                      })*/
        });
      })
    );
  },
  destroy(app, manager) {
    this.listeners.forEach((v: () => any) => v());
  },
} as TalexTouch.IModule;
