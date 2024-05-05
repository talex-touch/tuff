import { touchChannel } from "~/modules/channel/channel-core";
import {
  blowMention,
  forTouchTip,
  popperMention,
} from "~/modules/mention/dialog-mention";
import { h, ref, effectScope } from "vue";
import PluginApplyInstall from "@comp/plugin/action/mention/PluginApplyInstall.vue";
import { AppUpdate } from "~/modules/hooks/api/useUpdate";
import AppUpdateView from "@comp/base/AppUpgradationView.vue";
import { pluginManager } from "~/modules/channel/plugin-core/api";
import { pluginAdopter } from "~/modules/hooks/adopters/plugin-adpoter";
import { useRouter } from "vue-router";
import { DataCode } from "@talex-touch/utils/channel";

export function usePlugins() {
  const plugins = ref();
  provide("plugins", plugins);

  const scope = effectScope();

  scope.run(() => {
    watchEffect(() => {
      plugins.value = [...pluginAdopter.plugins.values()];

      if (activePlugin?.value) {
        if (
          !plugins.value.filter((item) => item.name === activePlugin.value)
            .length
        ) {
          lastActivePlugin.value = activePlugin.value;
          activePlugin.value = "";
        }
      } else if (
        plugins.value.filter((item) => item.name === lastActivePlugin.value)
          .length &&
        lastActivePlugin.value
      ) {
        setTimeout(() => {
          activePlugin.value = lastActivePlugin.value;
          lastActivePlugin.value = "";

          const id = `touch-plugin-item-${activePlugin.value}`;

          setTimeout(() => {
            const el = document.getElementById(id);
            if (!el) return;

            el["$fixPointer"]?.();
          }, 200);
        }, 200);
      }
    });
    // watch(pluginAdopter, val => {
    //   console.log("updated", pluginAdopter, val);
    //   plugins.value = [...val.values()];

    // }, { deep: true, immediate: true })
    // watch(() => pluginAdopter.plugins.size, () => plugins.value = [...pluginAdopter.plugins.values()])
  });

  return [plugins, scope];
}

const activePlugin = ref("");
const lastActivePlugin = ref("");

export function usePlugin() {
  const router = useRouter();

  const stop = watch(
    () => activePlugin.value,
    (val, oldVal) => {
      pluginManager.changeActivePlugin(val);
    },
    { immediate: true }
  );

  provide("activePlugin", activePlugin);

  return stop;
}

export async function urlHooker() {
  function directListener(event: any) {
    const target = event.target;

    if (target.nodeName.toLocaleLowerCase() === "a") {
      if (target.getAttribute("ignoreSafeCheck") === "true") return;

      const url = target.getAttribute("href");

      console.log(target, url, window.location.origin)

      const regex = /(^https:\/\/localhost)|(^http:\/\/localhost)|(^http:\/\/127\.0\.0\.1)|(^https:\/\/127\.0\.0\.1)/;

      event.preventDefault();
      if (!regex.test(url) || url.startsWith(window.location.origin) || url.startsWith("/")) {
        touchChannel.send("url:open", url);
      } else touchChannel.send("open-external", { url });

      // if(/^\//.test(target)) {
      //   // Relative to this website url
      //   return true
      // }

      // const isSafe = undefined !== whiteDomList.find(item=>{
      //   return target.indexOf(item) !== -1
      // })

      // if(!isSafe) {
      //   window.open(`${window.location.host}/direct?target=${target}`, '_blank')
      // window.open(`${safeLink}${target}`, '_blank')
      // }

      // window.open(`${url}`, "_blank");
    }
  }

  document.body.addEventListener("click", directListener);

  touchChannel.regChannel("url:open", async ({ data, reply }) => {
    await forTouchTip("Allow to open external link?", data, [
      {
        content: "Cancel",
        type: "info",
        onClick: async () => {
          reply(DataCode.SUCCESS, false);
          return true;
        },
      },
      {
        content: "Sure",
        type: "danger",
        onClick: async () => {
          reply(DataCode.SUCCESS, true);
          return true;
        },
      },
    ]);
  });
}

export async function applicationUpgrade() {
  const res = await AppUpdate.getInstance().check();
  console.log(res);
  window.$startupInfo.appUpdate = res;
  if (res) {
    document.body.classList.add("has-update");

    await popperMention("New Version Available", () => {
      return h(AppUpdateView, { release: res });
    });
  }
}

export function screenCapture() {
  const widthStr = document.body.style.getPropertyValue("--winWidth");
  const heightStr = document.body.style.getPropertyValue("--winHeight");

  const winWidth = widthStr ? parseInt(widthStr) : 0;
  const winHeight = heightStr ? parseInt(heightStr) : 0;

  if (winWidth === 0 || winHeight === 0) return;
  registerTypeProcess("@screen-capture", async ({ data }) => {
    const width = document.body.clientWidth;
    const height = document.body.clientHeight;

    const video = document.getElementById("video") as HTMLVideoElement;

    const media = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        // @ts-expect-error
        chromeMediaSource: "desktop",
        // deviceId: data.id,
        chromeMediaSourceId: data.id,
        minWidth: width,
        maxWidth: winHeight,
        minHeight: height,
        maxHeight: winHeight,
        height,
        width,
      },
    });

    console.log(data, media.getTracks());
    //
    // const track = media.getVideoTracks()[0]

    console.log(data, media);

    // video.srcObject = media
    // video.onloadedmetadata = (e) => {
    //     video.play()
    // }
  });
}

export function dropperResolver() {
  async function dropperFile(path) {
    if (path.endsWith(".touch-plugin")) {
      await blowMention(
        "Fatal Error",
        "Sorry, the plugin is deprecated, we only supports .tpex now."
      );

      return true;
    }

    if (path.endsWith(".tpex")) {
      const data = touchChannel.sendSync("drop:plugin", path);

      if (data.status === "error") {
        if (data.msg === "10091")
          await blowMention(
            "Install",
            "The plugin has been irreversible damage!"
          );
        else if (data.msg === "10092")
          await blowMention("Install", "Unable to identify the file!");
      } else {
        const { manifest } = data;

        await popperMention(manifest.name, () => {
          return h(PluginApplyInstall, { manifest, path });
        });
      }
      return true;
    }

    return false;
  }

  document.addEventListener("drop", async (e) => {
    e.preventDefault();

    const files = e.dataTransfer!.files;

    if (files && files.length === 1) {
      // 获取文件路径
      const { path } = files[0] as any;

      if (await dropperFile(path)) return;
    }

    const option = {
      shift: e.shiftKey,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      pageX: e.pageX,
      pageY: e.pageY,
      composed: e.composed,
      timeStamp: e.timeStamp,
      type: e.type,
      x: e.x,
      y: e.y,
      data: {
        files: [...e.dataTransfer!.files].map(parseFile),
        // items: e.dataTransfer.items,
        types: e.dataTransfer!.types,
      },
    };

    // TODO: drop file to plugins (lack plugin name)
    // touchChannel.send("drop", option);
  });

  function parseFile(file: File) {
    return {
      lastModified: file.lastModified,
      name: file.name,
      path: file["path"],
      size: file.size,
      type: file.type,
    };
  }

  document.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
}

export function clipBoardResolver() {
  touchChannel.regChannel("clipboard:trigger", ({ data }: any) => {
    if (data.type === "text") {
      blowMention("Clipboard", `You may copied "${data.data}"`);
    } else if (data.type === "image") {
      blowMention("Clipboard", data.data);
    } else if (data.type === "html") {
      blowMention("Clipboard", data.data);
    }
  });
}
