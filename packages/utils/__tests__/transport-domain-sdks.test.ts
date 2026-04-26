import { describe, expect, it, vi } from "vitest";
import {
  AgentsEvents,
  AppEvents,
  PermissionEvents,
  UpdateEvents,
} from "../transport/events";
import { createAgentStoreSdk } from "../transport/sdk/domains/agents-store";
import { createAppSdk } from "../transport/sdk/domains/app";
import { createAgentsSdk } from "../transport/sdk/domains/agents";
import { createIntelligenceSdk } from "../transport/sdk/domains/intelligence";
import { createPermissionSdk } from "../transport/sdk/domains/permission";
import { createSettingsSdk } from "../transport/sdk/domains/settings";
import { createUpdateSdk } from "../transport/sdk/domains/update";

function createTransportMock() {
  return {
    send: vi.fn<(...args: any[]) => Promise<any>>(async () => undefined),
    on: vi.fn<(...args: any[]) => any>(() => vi.fn()),
    stream: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      cancel: vi.fn(),
      cancelled: false,
      streamId: "mock-stream",
    })),
  };
}

describe("transport domain sdk mappings", () => {
  it("update sdk maps check and settings events", async () => {
    const transport = createTransportMock();
    const sdk = createUpdateSdk(transport as any);

    await sdk.check({ force: true });
    await sdk.updateSettings({ autoDownload: true });

    expect(transport.send).toHaveBeenNthCalledWith(1, UpdateEvents.check, {
      force: true,
    });
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      UpdateEvents.updateSettings,
      {
        settings: { autoDownload: true },
      },
    );
  });

  it("settings sdk maps file index stream to typed transport stream", async () => {
    const transport = createTransportMock();
    const sdk = createSettingsSdk(transport as any);
    const onData = vi.fn();

    await sdk.fileIndex.streamProgress({ onData });

    expect(transport.stream).toHaveBeenCalledWith(
      AppEvents.fileIndex.progress,
      undefined,
      { onData },
    );
  });

  it("settings sdk maps device idle diagnostic event", async () => {
    const transport = createTransportMock();
    const sdk = createSettingsSdk(transport as any);

    await sdk.deviceIdle.getDiagnostic();

    expect(transport.send).toHaveBeenCalledWith(
      AppEvents.deviceIdle.getDiagnostic,
    );
  });

  it("settings sdk maps managed app entry events through appIndex domain", async () => {
    const transport = createTransportMock();
    const sdk = createSettingsSdk(transport as any);

    await sdk.appIndex.listEntries();
    await sdk.appIndex.upsertEntry({
      path: "/Applications/WeChat.app",
      displayName: "微信",
      enabled: true,
    });
    await sdk.appIndex.removeEntry({ path: "/Applications/WeChat.app" });
    await sdk.appIndex.setEntryEnabled({
      path: "/Applications/WeChat.app",
      enabled: false,
    });

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AppEvents.appIndex.listEntries,
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AppEvents.appIndex.upsertEntry,
      {
        path: "/Applications/WeChat.app",
        displayName: "微信",
        enabled: true,
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AppEvents.appIndex.removeEntry,
      {
        path: "/Applications/WeChat.app",
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      4,
      AppEvents.appIndex.setEntryEnabled,
      {
        path: "/Applications/WeChat.app",
        enabled: false,
      },
    );
  });

  it("app sdk maps openPromptsFolder to typed system event", async () => {
    const transport = createTransportMock();
    const sdk = createAppSdk(transport as any);

    await sdk.openPromptsFolder();

    expect(transport.send).toHaveBeenCalledWith(
      AppEvents.system.openPromptsFolder,
    );
  });

  it("intelligence sdk throws typed error when main returns failed ApiResponse", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValueOnce({
      ok: false,
      error: "quota exceeded",
    });

    const sdk = createIntelligenceSdk(transport as any);

    await expect(sdk.invoke("text.chat", { messages: [] })).rejects.toThrow(
      "quota exceeded",
    );
  });

  it("intelligence sdk maps session subscribe to typed transport stream", async () => {
    const transport = createTransportMock();
    const sdk = createIntelligenceSdk(transport as any);
    const onData = vi.fn();

    await sdk.agentSessionSubscribe(
      { sessionId: "tis_1", fromSeq: 3 },
      { onData },
    );

    expect(transport.stream).toHaveBeenCalledTimes(1);
    const [event, payload, options] = transport.stream.mock.calls[0] || [];
    expect(event?.toEventName?.()).toBe("intelligence:agent:session:subscribe");
    expect(payload).toEqual({ sessionId: "tis_1", fromSeq: 3 });
    expect(options).toEqual({ onData });
  });

  it("intelligence sdk subscribe throws when stream transport is unavailable", async () => {
    const transport = { send: vi.fn() };
    const sdk = createIntelligenceSdk(transport as any);

    await expect(
      sdk.agentSessionSubscribe({ sessionId: "tis_1" }, { onData: vi.fn() }),
    ).rejects.toThrow("transport.stream is unavailable");
  });

  it("intelligence sdk maps workflow CRUD events through typed transport events", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValue({ ok: true, result: undefined });
    const sdk = createIntelligenceSdk(transport as any);

    await sdk.workflowList({ includeTemplates: true });
    await sdk.workflowGet({ workflowId: "wf_1" });
    await sdk.workflowSave({
      id: "wf_1",
      name: "整理剪贴板",
      triggers: [],
      contextSources: [],
      toolSources: ["builtin"],
      steps: [],
    });
    await sdk.workflowDelete({ workflowId: "wf_1" });
    await sdk.workflowRun({ workflowId: "wf_1", sessionId: "tis_1" });
    await sdk.workflowHistory({ workflowId: "wf_1", limit: 10 });

    expect(transport.send.mock.calls[0]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:list",
    );
    expect(transport.send.mock.calls[0]?.[1]).toEqual({
      includeTemplates: true,
    });
    expect(transport.send.mock.calls[1]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:get",
    );
    expect(transport.send.mock.calls[1]?.[1]).toEqual({ workflowId: "wf_1" });
    expect(transport.send.mock.calls[2]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:save",
    );
    expect(transport.send.mock.calls[2]?.[1]).toEqual({
      id: "wf_1",
      name: "整理剪贴板",
      triggers: [],
      contextSources: [],
      toolSources: ["builtin"],
      steps: [],
    });
    expect(transport.send.mock.calls[3]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:delete",
    );
    expect(transport.send.mock.calls[3]?.[1]).toEqual({ workflowId: "wf_1" });
    expect(transport.send.mock.calls[4]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:run",
    );
    expect(transport.send.mock.calls[4]?.[1]).toEqual({
      workflowId: "wf_1",
      sessionId: "tis_1",
    });
    expect(transport.send.mock.calls[5]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:history",
    );
    expect(transport.send.mock.calls[5]?.[1]).toEqual({
      workflowId: "wf_1",
      limit: 10,
    });
  });

  it("permission sdk maps grant + push subscription", async () => {
    const transport = createTransportMock();
    const dispose = vi.fn();
    transport.on.mockReturnValue(dispose);

    const sdk = createPermissionSdk(transport as any);

    await sdk.grant({
      pluginId: "demo",
      permissionId: "intelligence.basic",
      grantedBy: "user",
    });
    const unsubscribe = sdk.onUpdated(() => {});
    unsubscribe();

    expect(transport.send).toHaveBeenCalledWith(PermissionEvents.api.grant, {
      pluginId: "demo",
      permissionId: "intelligence.basic",
      grantedBy: "user",
    });
    expect(transport.on).toHaveBeenCalledWith(
      PermissionEvents.push.updated,
      expect.any(Function),
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("agent market sdk maps market event names through typed events", async () => {
    const transport = createTransportMock();
    const sdk = createAgentStoreSdk(transport as any);

    await sdk.searchAgents({ keyword: "workflow" });
    await sdk.installAgent("community.workflow-agent", "1.0.0");
    await sdk.checkUpdates();

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AgentsEvents.store.search,
      { keyword: "workflow" },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AgentsEvents.store.install,
      { agentId: "community.workflow-agent", version: "1.0.0" },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AgentsEvents.store.checkUpdates,
    );
  });

  it("agents sdk maps api list/execute-immediate/update-priority events", async () => {
    const transport = createTransportMock();
    const sdk = createAgentsSdk(transport as any);

    await sdk.listAll();
    await sdk.executeImmediate({
      agentId: "builtin.search-agent",
      type: "execute",
      input: { query: "hello" },
    });
    await sdk.updatePriority("task-1", 9);

    expect(transport.send).toHaveBeenNthCalledWith(1, AgentsEvents.api.listAll);
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AgentsEvents.api.executeImmediate,
      {
        agentId: "builtin.search-agent",
        type: "execute",
        input: { query: "hello" },
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AgentsEvents.api.updatePriority,
      {
        taskId: "task-1",
        priority: 9,
      },
    );
  });

  it("agents sdk maps task push subscriptions", async () => {
    const transport = createTransportMock();
    const dispose = vi.fn();
    transport.on.mockReturnValue(dispose);
    const sdk = createAgentsSdk(transport as any);

    const unsubscribe = sdk.onTaskStarted(() => {});
    unsubscribe();

    expect(transport.on).toHaveBeenCalledWith(
      AgentsEvents.push.taskStarted,
      expect.any(Function),
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
