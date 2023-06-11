import { ChannelType } from 'utils/channel/index';
import { ITouchPlugin } from "utils/plugin";
import { TalexTouch } from "./../types/touch-core";
import path from "path";
import { checkDirWithCreate } from "../utils/common-util";
import fse from "fs-extra";
import compressing from "compressing";
import * as fs from "fs";
import { exec } from "child_process";
import { CompressLimit, TalexCompress } from "../utils/compress-util";
import { genPluginManager } from "./plugin-core";
import { genTouchChannel } from '../core/channel-core';

export class PluginAssets {
  plugin: ITouchPlugin;
  manifest: string;
  files: string;

  constructor(plugin: ITouchPlugin, manifest: string, files: string) {
    this.plugin = plugin;
    this.manifest = manifest;
    this.files = files;
  }

  packManifest() {
    const m = JSON.parse(this.manifest);

    delete m["pluginSubInfo"];
    delete m["plugin"];

    return JSON.stringify(m);
  }

  __init(mainPath: string) {
    fse.writeFileSync(
      path.join(mainPath, "manifest.talex"),
      this.packManifest()
    );
    // generate key
    fse.writeFileSync(path.join(mainPath, "key.talex"), this.plugin.name);
  }

  __pack__tarStream(mainPath: string, pluginPath: string) {
    const tarStream = new compressing.tar.Stream();

    tarStream.addEntry(path.join(mainPath, "manifest.talex"));
    tarStream.addEntry(path.join(mainPath, "key.talex"));

    const array = JSON.parse(this.files);
    array.forEach((file) => {
      if (file === "init.json") return;
      tarStream.addEntry(path.join(pluginPath, file));
    });

    return tarStream;
  }

  __pack__destStream(mainPath: string) {
    const target = path.join(mainPath, this.plugin.name + ".touch-plugin");
    const destStream = fs.createWriteStream(target);

    const content = "@@@" + this.plugin.name + "\n" + this.manifest + "\n\n\n";
    const length = content.length + 25;

    const l = length.toString().padStart(5, "0");
    destStream.write("TalexTouch-PluginPackage@@" + l + content);

    return destStream;
  }

  __pack(option: Array<any>) {
    const [sendLog, sendProgress, target, { mainPath, pluginPath }] = option;
    sendLog("Start packaging plugin: " + this.plugin.name);
    sendLog("Initialized plugin package!");

    const srcPaths = [
      path.join(mainPath, "manifest.talex"),
      path.join(mainPath, "key.talex"),
    ];
    const array = JSON.parse(this.files);

    array.forEach((file) => {
      if (file === "init.json") return;
      srcPaths.push(path.join(pluginPath, file));
    });

    // ========================================================

    const content = "@@@" + this.plugin.name + "\n" + this.manifest + "\n\n\n";
    const length = content.length + 25;

    const l = length.toString().padStart(5, "0");

    const tCompress = new TalexCompress(
      srcPaths,
      target,
      "TalexTouch-PluginPackage@@" + l + content
    );

    tCompress.on("progress", (bytes) => {
      sendProgress(bytes, tCompress.totalBytes);
      sendLog(`Compressing plugin files... (${bytes}/${tCompress.totalBytes})`);
    });

    tCompress.on("stats", (e) => {
      if (e === 0) {
        sendLog("Stats compressing plugin files...");
        sendProgress(tCompress.limit.size, tCompress.limit.size);
        return;
      }

      if (e === -1) {
        sendLog("Stats done, total: " + tCompress.totalBytes + " k-bytes");
        sendProgress(0, tCompress.limit.size);
        return;
      }

      const { srcPath, srcStat, totalBytes } = e;

      sendLog(" - File: " + srcPath + " | " + srcStat.size + " bytes");
      sendProgress(tCompress.limit.size - totalBytes, tCompress.limit.size);
    });

    tCompress.on("err", (msg) => {
      sendLog(msg, "ERROR");

      const touchChannel = genTouchChannel();
      touchChannel.send(ChannelType.MAIN, "plugin-packager", {
        type: "pack",
        plugin: this.plugin.name,
        status: "failed",
      });
    });

    tCompress.on("flush", () => {
      sendLog("DONE!");
      sendProgress(1, 1);
      sendLog(
        "Finished packaging plugin! (" + tCompress.totalBytes + " bytes)"
      );
      console.log("[PluginPackager] Packaged plugin: " + this.plugin.name);

      sendLog("Opening plugin package folder at " + target + "!");

      exec("explorer.exe /select," + path.normalize(target));
      const touchChannel = genTouchChannel();
      touchChannel.send(ChannelType.MAIN, "plugin-packager", {
        type: "pack",
        plugin: this.plugin.name,
        status: "success",
      });
    });

    tCompress.setLimit(new CompressLimit(0, 0));

    sendLog("Start compressing plugin files...");
    tCompress.compress();
  }
}

export class PluginPackager {
  pluginPath: string;
  mainPath: string;

  constructor(pluginPath: string, buildPath: string) {
    this.pluginPath = pluginPath;
    this.mainPath = buildPath;
  }

  wrapPlugin(asset: PluginAssets) {
    const mainPath = path.join(this.mainPath, asset.plugin.name);
    asset.__init(mainPath);

    const target = path.join(
      this.mainPath,
      asset.plugin.name + ".touch-plugin"
    );
    const sendLog = (log: string, prefix = "PluginPackager") => {
      touchChannel.send("plugin-packager-progress-log/" + asset.plugin.name, {
        type: "pack",
        plugin: asset.plugin.name,
        log: `\x1b[1;32m[${prefix}]\x1b[0m ${log}\n`,
      });
    };
    const sendProgress = (c: number, t: number) => {
      touchChannel.send("plugin-packager-progress/" + asset.plugin.name, {
        type: "pack",
        total: t,
        received: c,
      });
    };

    asset.__pack([
      sendLog,
      sendProgress,
      target,
      { mainPath, pluginPath: this.pluginPath },
    ]);
  }
}

let pluginPackager: PluginPackager | null = null;

export function genPluginPackager(buildPath?: string): PluginPackager {
  if (!pluginPackager)
    pluginPackager = new PluginPackager(
      genPluginManager().pluginPath,
      buildPath
    );

  return pluginPackager!;
}

export default {
  name: Symbol("PluginPackager"),
  filePath: false,
  listeners: new Array<Function>,
  init(app, manager) {
    const buildPath = path.join(app.rootPath, "build");

    checkDirWithCreate(buildPath, true);

    genPluginPackager(buildPath);

    const touchChannel = genTouchChannel();

    this.listeners.push(
      touchChannel.regChannel(ChannelType.MAIN, "new-plugin-template", async ({ options }) => {
        
        
      })
    );
  },
  destroy(app, manager) {
    this.listeners.forEach(v => v())
  },
} as TalexTouch.IModule;
