import fse from "fs-extra";
import path from "path";
import { session } from "electron";
import { TalexTouch } from "../types";

export default {
  name: Symbol("ExtensionLoader"),
  filePath: "extensions",
  extensions: [],
  init(app, manager) {
    const extensionPath = path.join(app.rootPath, "modules", "extensions");
    const extensions = fse.readdirSync(extensionPath);

    extensions.forEach((extension) => {
      console.log("[Extension] Loading extension", extension);

      this.extensions.push(extension);
      session.defaultSession.loadExtension(
        path.join(extensionPath, extension)
      );
    });
  },
  destroy() {},
} as TalexTouch.IModule;
