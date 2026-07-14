import type {
  NativeScreenshotCaptureRequest,
  NativeScreenshotCaptureResult,
  NativeScreenshotDisplay,
  NativeScreenshotSupport,
} from "../../transport/events/types";
import type { ITuffTransport } from "../../transport/types";
import { createNativeScreenshotSdk } from "../../transport/sdk/domains/native";

export type PluginScreenshotCaptureResult = Omit<
  NativeScreenshotCaptureResult,
  "path"
>;

export interface PluginScreenshotSDK {
  getSupport: () => Promise<NativeScreenshotSupport>;
  listDisplays: () => Promise<NativeScreenshotDisplay[]>;
  capture: (
    request?: NativeScreenshotCaptureRequest,
  ) => Promise<PluginScreenshotCaptureResult>;
}

export function createPluginScreenshotSDK(
  transport: Pick<ITuffTransport, "send">,
): PluginScreenshotSDK {
  const screenshot = createNativeScreenshotSdk(transport);

  return {
    getSupport: screenshot.getSupport,
    listDisplays: screenshot.listDisplays,
    capture: async (request) => {
      const { path: _rawPath, ...result } = await screenshot.capture(request);
      return result;
    },
  };
}
