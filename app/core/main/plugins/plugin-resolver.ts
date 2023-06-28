import path from "path";
import fs from "fs";
import fse from "fs-extra";
import compressing from "compressing";
import { genPluginManager } from "./plugin-core";
import { checkDirWithCreate } from "../utils/common-util";
import { IManifest } from "@talex-touch/utils/plugin";

export enum ResolverStatus {
  OPEN_FILE_ERROR,
  READ_FILE_ERROR,
  NOT_A_PLUGIN_FILE,
  BROKEN_PLUGIN_FILE,
  SUCCESS,
}

export class PluginResolver {
  filePath: string;
  fd: number;

  constructor(filePath) {
    this.filePath = filePath;
  }

  async install(totalLength: number, manifest: IManifest, cb: Function) {
    console.log('[PluginResolver] Installing plugin: ' + manifest.name, manifest, totalLength, JSON.stringify(manifest).length)
    const _target = path.join(genPluginManager().pluginPath, manifest.name);

    // const _plugin: Plugin = pluginManager.plugins[manifest.name]
    // if ( _plugin ) {
    //     if ( !_plugin.pluginInfo.pluginSubInfo.dev ) {
    //         return cb('plugin already exists')
    //     }
    /*} else*/ if (fse.existsSync(_target)) return cb("plugin already exists");
    await checkDirWithCreate(_target, true);

    const target = path.join(_target, "extracted");
    const targetFile = path.join(target, manifest.name + "-unpacked.tar");
    await checkDirWithCreate(target, true);

    let bytesReceived = 0;
    let totalBytes = fs.statSync(this.filePath).size - totalLength;

    // 先将文件写入新文件
    const readStream = fs.createReadStream(this.filePath, {
      start: totalLength,
    });
    const fileStream = fs.createWriteStream(targetFile, { flags: "a" });

    readStream.on("data", (chunk) => {
      console.log(
        "[PluginResolver] Installing plugin: " +
          manifest.name +
          " | " +
          ((bytesReceived / totalBytes) * 100).toFixed(2) +
          "%"
      );
    });

    readStream.on("end", async () => {
      // 解压新的文件
      await compressing.tar.uncompress(targetFile, _target);

      fse.rm(targetFile);

      cb("success", "success");

      // rename manifest 2 init
      fse.rename(
        path.join(_target, "key.talex"),
        path.join(_target, "manifest.json")
      );

      // load plugin
      genPluginManager().loadPlugin(manifest.name);
    });

    readStream.pipe(fileStream);
  }

  resolve(callback, whole = false) {
    console.log("[PluginResolver] Resolving plugin: " + this.filePath);
    const event = {
      msg: "",
    } as any;
    fs.open(this.filePath, "r", "0666", (err, fd) => {
      if (err) {
        event.msg = ResolverStatus.OPEN_FILE_ERROR;
        return callback({ event, type: "error" });
      }

      let buffer = Buffer.alloc(32);
      fs.read(fd, buffer, 0, buffer.length, 0, async (err, bytes) => {
        if (err) {
          event.msg = ResolverStatus.READ_FILE_ERROR;
          return callback({ event, type: "error" });
        }

        try {
          const identifier = buffer.toString();
          const arr = identifier.split("@");

          if (
            !identifier.startsWith("TalexTouch-PluginPackage@@") ||
            arr.length !== 4
          ) {
            event.msg = ResolverStatus.NOT_A_PLUGIN_FILE;
            return callback({ event, type: "error" });
          }

          const length = Number(identifier.split("@")[2].substr(0, 5));

          buffer = Buffer.alloc(length);

          await fse.read(fd, buffer, 0, buffer.length, 32);

          const _content = buffer.toString();
          const _arr = _content.split("\n");

          if (_arr.length !== 5) {
            event.msg = ResolverStatus.BROKEN_PLUGIN_FILE;
            return callback({ event, type: "error" });
          }

          const manifest = JSON.parse(_arr[1]);

          if (!whole) {
            event.msg = manifest;
            return callback({ event, type: "success" });
          }

          const totalLength = length + 32;

          // install
          setTimeout(async () => {
            await this.install(totalLength, manifest as IManifest, (msg, type = "error") => {
              event.msg = msg;

              callback({ event, type });
            });
          });
        } catch (e) {
          event.msg = e;
          callback({ event, type: "error" });
        } finally {
          fs.close(fd, (err) => {
            if (err) {
              event.msg = "close file error";
              return callback({ event, type: "error" });
            }
          });

          console.log(
            "[PluginResolver] Resolved plugin: " +
              this.filePath +
              " | File released!"
          );
        }
      });
    });
  }
}

// export default {
//   name: Symbol("PluginResolver"),
//   init(app, manager) {},
//   destroy(app, manager) {},
// } as TalexTouch.IModule;
