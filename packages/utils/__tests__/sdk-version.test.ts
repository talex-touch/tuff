import { describe, expect, it } from "vitest";
import {
  CURRENT_SDK_VERSION,
  LOCALIZATION_FACADE_MIN_VERSION,
  SdkApi,
  SUPPORTED_SDK_VERSIONS,
  checkSdkCompatibility,
  formatSdkVersion,
  isSupportedSdkVersion,
  resolveSdkApiVersion,
} from "../plugin";

describe("sdk version markers", () => {
  it("uses 260713 as the current supported sdkapi marker", () => {
    expect(CURRENT_SDK_VERSION).toBe(SdkApi.V260713);
    expect(SUPPORTED_SDK_VERSIONS[0]).toBe(SdkApi.V260713);
    expect(formatSdkVersion(CURRENT_SDK_VERSION)).toBe("26.07.13");
    expect(LOCALIZATION_FACADE_MIN_VERSION).toBe(SdkApi.V260713);
  });

  it("accepts the localization facade marker with permission enforcement", () => {
    expect(isSupportedSdkVersion(SdkApi.V260713)).toBe(true);
    expect(resolveSdkApiVersion(260713)).toBe(SdkApi.V260713);
    expect(checkSdkCompatibility(260713, "touch-localization-plugin")).toEqual({
      compatible: true,
      enforcePermissions: true,
    });
  });

  it("keeps the prior supported marker compatible", () => {
    expect(isSupportedSdkVersion(SdkApi.V260626)).toBe(true);
    expect(resolveSdkApiVersion(260626)).toBe(SdkApi.V260626);
    expect(checkSdkCompatibility(260626, "touch-existing-plugin")).toEqual({
      compatible: true,
      enforcePermissions: true,
    });
  });

  it("keeps non-canonical historical markers blocked", () => {
    expect(isSupportedSdkVersion(260421)).toBe(false);
    expect(resolveSdkApiVersion(260421)).toBeUndefined();
    expect(checkSdkCompatibility(260421, "touch-old-dev")).toMatchObject({
      compatible: false,
      enforcePermissions: false,
    });
  });
});
