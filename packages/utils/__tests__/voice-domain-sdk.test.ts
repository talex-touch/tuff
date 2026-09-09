import { describe, expect, it, vi } from "vitest";
import {
  createVoiceSdk,
  type VoiceSdkTransport,
  voiceApiEvents,
} from "../transport/sdk/domains/voice";

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
  it("transcribeUpload sends the upload event and unwraps the result", async () => {
    const transport = createTransportMock(async () => ({
      ok: true,
      result: {
        text: "你好，世界",
        language: "zh-CN",
        durationMs: 1_234,
        requestId: "request-upload-1",
        segments: [{ text: "你好，世界", startMs: 0, endMs: 1_234, speaker: "A" }],
      },
    }));
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport);
    const payload = {
      sourceUrl: "https://example.test/audio.wav",
      language: "zh-CN",
      enableTimestamps: true,
      enableSpeakerDiarization: true,
      removeDisfluencies: true,
    };

    const result = await sdk.transcribeUpload(payload);

    expect(transport.send).toHaveBeenCalledWith(
      voiceApiEvents.transcribeUpload,
      payload,
    );
    expect(result).toEqual({
      text: "你好，世界",
      language: "zh-CN",
      durationMs: 1_234,
      requestId: "request-upload-1",
      segments: [{ text: "你好，世界", startMs: 0, endMs: 1_234, speaker: "A" }],
    });
  });

  it("reads the main-owned ASR and STT capability readiness snapshot", async () => {
    const transport = createTransportMock(async () => ({
      ok: true,
      result: {
        asr: { ready: false, reason: "VOICE_ASR_CREDENTIAL_UNAVAILABLE" },
        stt: { ready: true },
      },
    }));
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport);

    await expect(sdk.getRecognitionStatus()).resolves.toEqual({
      asr: { ready: false, reason: "VOICE_ASR_CREDENTIAL_UNAVAILABLE" },
      stt: { ready: true },
    });
    expect(transport.send).toHaveBeenCalledWith(
      voiceApiEvents.getRecognitionStatus,
      undefined,
    );
  });

  it("transcribeUpload throws with the error from a failed envelope", async () => {
    const transport = createTransportMock(async () => ({
      ok: false,
      error: "audio source unavailable",
    }));
    const sdk = createVoiceSdk(transport as unknown as VoiceSdkTransport);

    await expect(
      sdk.transcribeUpload({ sourceUrl: "https://example.test/audio.wav" }),
    ).rejects.toThrow("audio source unavailable");
  });

  it("asrStream requires a stream-capable transport", async () => {
    const sdk = createVoiceSdk({
      send: vi.fn(async () => undefined),
    } as any);

    await expect(sdk.asrStream({}, { onData: () => {} })).rejects.toThrow(
      /stream-capable/,
    );
  });

  it("asrStream preserves the requested main-owned delivery mode", async () => {
    const transport = createTransportMock();
    // The mock does not express ITuffTransport's generic send signature.
    const voiceTransport = transport as unknown as VoiceSdkTransport;
    const sdk = createVoiceSdk(voiceTransport);
    const options = { onData: vi.fn() };

    await sdk.asrStream({ cleanup: true, delivery: "active-app" }, options);

    expect(transport.stream).toHaveBeenCalledWith(voiceApiEvents.asrStream, {
      cleanup: true,
      delivery: "active-app",
    }, options);
  });

  it("voice event names resolve to voice:api:<action>", () => {
    expect(voiceApiEvents.dictate.toEventName()).toBe("voice:api:dictate");
    expect(voiceApiEvents.speak.toEventName()).toBe("voice:api:speak");
    expect(voiceApiEvents.transcribeUpload.toEventName()).toBe(
      "voice:api:transcribe-upload",
    );
    expect(voiceApiEvents.asrStream.toEventName()).toBe("voice:api:asr-stream");
    expect(voiceApiEvents.getRecognitionStatus.toEventName()).toBe("voice:api:get-recognition-status");
  });
});
