import { describe, expect, it, vi } from "vitest";
import { createVoiceSdk, voiceApiEvents } from "../transport/sdk/domains/voice";

function createTransportMock(
  sendImpl?: (...args: any[]) => Promise<any>,
) {
  return {
    send: vi.fn<(...args: any[]) => Promise<any>>(
      sendImpl ??
        (async () => ({
          ok: true,
          result: {
            text: "hello world",
            raw: "hello world",
            source: "native-cpal",
            polished: true,
          },
        })),
    ),
    on: vi.fn<(...args: any[]) => any>(() => vi.fn()),
    stream: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      cancel: vi.fn(),
      cancelled: false,
      streamId: "mock-stream",
    })),
  };
}

describe("voice domain sdk", () => {
  it("dictate sends the dictate event and unwraps the envelope", async () => {
    const transport = createTransportMock();
    const sdk = createVoiceSdk(transport as any);

    const result = await sdk.dictate({ cleanup: true, language: "zh-CN" });

    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.dictate, {
      cleanup: true,
      language: "zh-CN",
    });
    expect(result).toEqual({
      text: "hello world",
      raw: "hello world",
      source: "native-cpal",
      polished: true,
    });
  });

  it("dictate defaults to an empty payload", async () => {
    const transport = createTransportMock();
    const sdk = createVoiceSdk(transport as any);

    await sdk.dictate();

    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.dictate, {});
  });

  it("dictate throws with the error from a failed envelope", async () => {
    const transport = createTransportMock(async () => ({
      ok: false,
      error: "microphone unavailable",
    }));
    const sdk = createVoiceSdk(transport as any);

    await expect(sdk.dictate()).rejects.toThrow("microphone unavailable");
  });

  it("speak sends the speak event and unwraps the result", async () => {
    const transport = createTransportMock(async () => ({
      ok: true,
      result: { audio: "data:audio/wav;base64,AA", format: "wav", played: true },
    }));
    const sdk = createVoiceSdk(transport as any);

    const result = await sdk.speak({ text: "hello" });

    expect(transport.send).toHaveBeenCalledWith(voiceApiEvents.speak, {
      text: "hello",
    });
    expect(result).toEqual({
      audio: "data:audio/wav;base64,AA",
      format: "wav",
      played: true,
    });
  });

  it("asrStream requires a stream-capable transport", async () => {
    const sdk = createVoiceSdk({
      send: vi.fn(async () => undefined),
    } as any);

    await expect(sdk.asrStream({}, { onData: () => {} })).rejects.toThrow(
      /stream-capable/,
    );
  });

  it("voice event names resolve to voice:api:<action>", () => {
    expect(voiceApiEvents.dictate.toEventName()).toBe("voice:api:dictate");
    expect(voiceApiEvents.speak.toEventName()).toBe("voice:api:speak");
    expect(voiceApiEvents.asrStream.toEventName()).toBe("voice:api:asr-stream");
  });
});
