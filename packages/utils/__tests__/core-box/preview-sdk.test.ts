import { describe, expect, it, vi } from "vitest";
import type { PreviewAbility } from "../../core-box/preview";
import { TuffInputType } from "../../core-box/tuff";
import {
  AdvancedExpressionAbility,
  BasicExpressionAbility,
  ColorPreviewAbility,
  CurrencyPreviewAbility,
  PercentageAbility,
  QuickOpsDeveloperAbility,
  ScientificConstantsAbility,
  TextStatsAbility,
  TimeDeltaAbility,
  UnitConversionAbility,
  createDefaultPurePreviewAbilities,
  createPreviewSdk,
  createStaticPreviewSafetyPolicy,
  evaluateBasicExpression,
  hasQuickOpsDeveloperCommand,
  runPreviewSdkBenchmark,
} from "../../core-box/preview";

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe("PreviewSDK", () => {
  it("resolves abilities by priority and returns pure preview payloads", async () => {
    const sdk = createPreviewSdk({
      abilities: [
        new TextStatsAbility(),
        new PercentageAbility(),
        new BasicExpressionAbility(),
      ],
    });

    const result = await sdk.resolve({
      query: { text: "2 + 2", inputs: [] },
      signal: signal(),
    });

    expect(result?.abilityId).toBe("preview.expression.basic");
    expect(result?.payload.primaryValue).toBe("4");
  });

  it("exposes ability inventory with safety declarations", () => {
    const sdk = createPreviewSdk({
      abilities: [new ColorPreviewAbility(), new UnitConversionAbility()],
    });

    expect(sdk.listInventory()).toEqual([
      expect.objectContaining({
        id: "preview.color",
        owner: "preview-sdk",
        status: "migrated",
        safety: expect.objectContaining({
          usesDynamicExecution: false,
          usesNetwork: false,
          usesCache: false,
        }),
      }),
      expect.objectContaining({
        id: "preview.unit",
        safety: expect.objectContaining({
          replacementPlan: expect.stringContaining(
            "share static unit conversion core",
          ),
        }),
      }),
    ]);
  });

  it("evaluates basic arithmetic without dynamic code execution semantics", () => {
    expect(evaluateBasicExpression("2 * (3 + 4)")).toBe(14);
    expect(evaluateBasicExpression("-2 + 3 * 4")).toBe(10);
    expect(evaluateBasicExpression("process.exit()")).toBeNull();
  });

  it("converts units through the shared static conversion core", async () => {
    const ability = new UnitConversionAbility();
    const result = await ability.execute({
      query: { text: "100 cm to m", inputs: [] },
      signal: signal(),
    });

    expect(result?.abilityId).toBe("preview.unit");
    expect(result?.payload.primaryValue).toBe("1");
  });

  it("resolves advanced expression, constants and time abilities inside PreviewSDK", async () => {
    const advanced = await new AdvancedExpressionAbility().execute({
      query: { text: "sqrt(16)", inputs: [] },
      signal: signal(),
    });
    const constant = await new ScientificConstantsAbility().execute({
      query: { text: "speed of light constant", inputs: [] },
      signal: signal(),
    });
    const time = await new TimeDeltaAbility().execute({
      query: { text: "1h", inputs: [] },
      signal: signal(),
    });
    const currency = await new CurrencyPreviewAbility().execute({
      query: { text: "10 USD to CNY", inputs: [] },
      signal: signal(),
    });

    expect(advanced?.payload.primaryValue).toBe("4");
    expect(constant?.payload.title).toBe("真空光速");
    expect(time?.payload.subtitle).toBe("时长换算");
    expect(currency?.payload.primaryValue).toBe("72.50 CNY");
    expect(currency?.payload.warnings?.[0]).toContain("静态离线汇率");
  });

  it("keeps time, percentage, unit and QuickOps boundaries specific in default registry order", async () => {
    const sdk = createPreviewSdk({
      abilities: createDefaultPurePreviewAbilities(),
    });

    const chineseTime = await sdk.resolve({
      query: { text: "1小时30分钟后", inputs: [] },
      signal: signal(),
    });
    const chinesePercentage = await sdk.resolve({
      query: { text: "100 增加 20%", inputs: [] },
      signal: signal(),
    });
    const invalidRelativeTime = await sdk.resolveWithDiagnostics({
      query: { text: "now + abc", inputs: [] },
      signal: signal(),
    });
    const incompatibleUnit = await sdk.resolveWithDiagnostics({
      query: { text: "10 kg to m", inputs: [] },
      signal: signal(),
    });
    const currency = await sdk.resolve({
      query: { text: "€10 to CNY", inputs: [] },
      signal: signal(),
    });
    const uuidHistory = await sdk.resolveWithDiagnostics({
      query: { text: "uuid history", inputs: [] },
      signal: signal(),
    });
    const unknownCurrency = await sdk.resolveWithDiagnostics({
      query: { text: "10 foo to bar", inputs: [] },
      signal: signal(),
    });
    const regexMissingLiteral = await sdk.resolveWithDiagnostics({
      query: { text: "regex hello world", inputs: [] },
      signal: signal(),
    });

    expect(chineseTime?.abilityId).toBe("preview.time");
    expect(chineseTime?.payload.subtitle).toBe("时间偏移");
    expect(chinesePercentage?.abilityId).toBe("preview.percent");
    expect(chinesePercentage?.payload.primaryValue).toBe("120");
    expect(invalidRelativeTime.result).toBeNull();
    expect(invalidRelativeTime.diagnostics.status).toBe("no-match");
    expect(incompatibleUnit.result).toBeNull();
    expect(incompatibleUnit.diagnostics.status).toBe("no-match");
    expect(currency?.abilityId).toBe("preview.currency");
    expect(currency?.payload.meta?.currency).toEqual(
      expect.objectContaining({
        source: "EUR",
        target: "CNY",
        rateSource: "static",
      }),
    );
    expect(uuidHistory.result).toBeNull();
    expect(uuidHistory.diagnostics.status).toBe("no-match");
    expect(unknownCurrency.result).toBeNull();
    expect(unknownCurrency.diagnostics.status).toBe("no-match");
    expect(regexMissingLiteral.result).toBeNull();
    expect(regexMissingLiteral.diagnostics.status).toBe("no-match");
  });

  it("resolves QuickOps developer commands from query text", async () => {
    const sdk = createPreviewSdk({
      abilities: [new QuickOpsDeveloperAbility()],
    });

    const formattedJson = await sdk.resolve({
      query: { text: 'json {"ok":true}', inputs: [] },
      signal: signal(),
    });
    const encodedUrl = await sdk.resolve({
      query: { text: "url encode hello world", inputs: [] },
      signal: signal(),
    });
    const timestamp = await sdk.resolve({
      query: { text: "timestamp 1710000000", inputs: [] },
      signal: signal(),
    });
    const timezone = await sdk.resolve({
      query: { text: "timezone 2024-03-09T16:00:00Z UTC+08:00", inputs: [] },
      signal: signal(),
    });
    const uuid = await sdk.resolve({
      query: { text: "uuid v4", inputs: [] },
      signal: signal(),
    });
    const shortId = await sdk.resolve({
      query: { text: "short id 12", inputs: [] },
      signal: signal(),
    });
    const jwt = await sdk.resolve({
      query: {
        text:
          "jwt decode eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJib3NzIiwiaWF0IjoxNzEwMDAwMDAwfQ.signature",
        inputs: [],
      },
      signal: signal(),
    });
    const regex = await sdk.resolve({
      query: { text: "regex /boss/i hello Boss", inputs: [] },
      signal: signal(),
    });
    const csvTable = await sdk.resolve({
      query: { text: "csv to markdown name,role\nBoss,Developer", inputs: [] },
      signal: signal(),
    });
    const markdownToCsv = await sdk.resolve({
      query: { text: "markdown to csv | name | role |\n| --- | --- |\n| Boss | Developer |", inputs: [] },
      signal: signal(),
    });
    const snakeCase = await sdk.resolve({
      query: { text: "case snake helloWorld Test", inputs: [] },
      signal: signal(),
    });
    const kebabCaseQuery = await sdk.resolve({
      query: { text: "case kebab-case helloWorld Test", inputs: [] },
      signal: signal(),
    });

    expect(formattedJson?.abilityId).toBe("preview.quickops.developer");
    expect(formattedJson?.payload.primaryValue).toBe('{\n  "ok": true\n}');
    expect(encodedUrl?.payload.primaryValue).toBe("hello%20world");
    expect(timestamp?.payload.secondaryValue).toBe("2024-03-09T16:00:00.000Z");
    expect(timezone?.payload.primaryValue).toBe("2024-03-10 00:00:00 UTC+08:00");
    expect(timezone?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "date-convert",
        inputSource: "query",
        targetOffsetMinutes: 480,
      }),
    );
    expect(timezone?.payload.warnings?.[0]).toContain("固定 UTC offset");
    expect(uuid?.payload.primaryValue).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(uuid?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "uuid-v4",
        inputSource: "query",
      }),
    );
    expect(shortId?.payload.primaryValue).toMatch(/^[\w-]{12}$/);
    expect(shortId?.payload.secondaryValue).toBe("12");
    expect(shortId?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "short-id",
        inputSource: "query",
      }),
    );
    expect(jwt?.payload.primaryValue).toBe('{\n  "sub": "boss",\n  "iat": 1710000000\n}');
    expect(jwt?.payload.sections?.[0]?.rows[0]?.value).toBe(
      '{\n  "alg": "HS256",\n  "typ": "JWT"\n}',
    );
    expect(jwt?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "jwt-decode",
        inputSource: "query",
        signatureVerified: false,
      }),
    );
    expect(regex?.payload.primaryValue).toBe("匹配");
    expect(regex?.payload.secondaryValue).toBe("1");
    expect(regex?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "regex-test",
        inputSource: "query",
        patternLength: 4,
        targetLength: 10,
        matchCount: 1,
      }),
    );
    expect(csvTable?.payload.primaryValue).toBe(
      "| name | role      |\n| ---- | --------- |\n| Boss | Developer |",
    );
    expect(csvTable?.payload.secondaryValue).toBe("2x2");
    expect(csvTable?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "csv-to-markdown",
        inputSource: "query",
      }),
    );
    expect(markdownToCsv?.payload.primaryValue).toBe("name,role\nBoss,Developer");
    expect(markdownToCsv?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "markdown-to-csv",
        inputSource: "query",
      }),
    );
    expect(snakeCase?.payload.primaryValue).toBe("hello_world_test");
    expect(snakeCase?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "case-snake",
        inputSource: "query",
      }),
    );
    expect(kebabCaseQuery?.payload.primaryValue).toBe("hello-world-test");
    expect(kebabCaseQuery?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "case-kebab",
        inputSource: "query",
      }),
    );
  });

  it("uses text clipboard input for QuickOps developer commands", async () => {
    const sdk = createPreviewSdk({
      abilities: [new QuickOpsDeveloperAbility()],
    });

    const decoded = await sdk.resolve({
      query: {
        text: "base64 decode",
        inputs: [{ type: TuffInputType.Text, content: "SGVsbG8=" }],
      },
      signal: signal(),
    });
    const invalidJson = await sdk.resolve({
      query: {
        text: "json",
        inputs: [{ type: TuffInputType.Text, content: "{bad" }],
      },
      signal: signal(),
    });
    const kebabCase = await sdk.resolve({
      query: {
        text: "case kebab",
        inputs: [{ type: TuffInputType.Text, content: "Hello world_test" }],
      },
      signal: signal(),
    });
    const jwtFromClipboard = await sdk.resolve({
      query: {
        text: "jwt decode",
        inputs: [
          {
            type: TuffInputType.Text,
            content:
              "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiZGV2ZWxvcGVyIn0.",
          },
        ],
      },
      signal: signal(),
    });
    const regexFromClipboard = await sdk.resolve({
      query: {
        text: "regex /dev\\w+/g",
        inputs: [{ type: TuffInputType.Text, content: "developer devtools" }],
      },
      signal: signal(),
    });
    const overlongRegexTarget = await sdk.resolve({
      query: {
        text: "regex /a/",
        inputs: [{ type: TuffInputType.Text, content: "a".repeat(2001) }],
      },
      signal: signal(),
    });
    const complexRegex = await sdk.resolve({
      query: { text: "regex /(a+)+$/ aaaa", inputs: [] },
      signal: signal(),
    });
    const formattedMarkdownTable = await sdk.resolve({
      query: {
        text: "markdown table",
        inputs: [
          {
            type: TuffInputType.Text,
            content: "| name | role |\n|---|---|\n| Boss | Dev |",
          },
        ],
      },
      signal: signal(),
    });
    const quotedCsvTable = await sdk.resolve({
      query: {
        text: "csv to markdown",
        inputs: [{ type: TuffInputType.Text, content: 'name,note\nBoss,"a,b"' }],
      },
      signal: signal(),
    });
    const invalidCsvTable = await sdk.resolve({
      query: {
        text: "csv to markdown",
        inputs: [{ type: TuffInputType.Text, content: 'name,note\nBoss,"broken' }],
      },
      signal: signal(),
    });
    const timezoneFromClipboard = await sdk.resolve({
      query: {
        text: "date UTC-05",
        inputs: [{ type: TuffInputType.Text, content: "2024-03-09T16:00:00Z" }],
      },
      signal: signal(),
    });
    const invalidTimezone = await sdk.resolve({
      query: { text: "timezone 2024-03-09T16:00:00Z UTC+15", inputs: [] },
      signal: signal(),
    });

    expect(decoded?.payload.primaryValue).toBe("Hello");
    expect(decoded?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "base64-decode",
        inputSource: "clipboard",
      }),
    );
    expect(invalidJson?.payload.primaryLabel).toBe("错误");
    expect(invalidJson?.payload.warnings?.[0]).toContain("JSON");
    expect(kebabCase?.payload.primaryValue).toBe("hello-world-test");
    expect(kebabCase?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "case-kebab",
        inputSource: "clipboard",
      }),
    );
    expect(jwtFromClipboard?.payload.primaryValue).toBe('{\n  "role": "developer"\n}');
    expect(jwtFromClipboard?.payload.secondaryValue).toBe("无签名段");
    expect(jwtFromClipboard?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "jwt-decode",
        inputSource: "clipboard",
        signatureVerified: false,
      }),
    );
    expect(regexFromClipboard?.payload.primaryValue).toBe("匹配");
    expect(regexFromClipboard?.payload.secondaryValue).toBe("2");
    expect(regexFromClipboard?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "regex-test",
        inputSource: "clipboard",
        matchCount: 2,
      }),
    );
    expect(overlongRegexTarget?.payload.primaryLabel).toBe("错误");
    expect(overlongRegexTarget?.payload.warnings?.[0]).toContain(
      "Regex target text",
    );
    expect(complexRegex?.payload.primaryLabel).toBe("错误");
    expect(complexRegex?.payload.warnings?.[0]).toContain("too complex");
    expect(formattedMarkdownTable?.payload.primaryValue).toBe(
      "| name | role |\n| ---- | ---- |\n| Boss | Dev  |",
    );
    expect(formattedMarkdownTable?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "markdown-table-format",
        inputSource: "clipboard",
      }),
    );
    expect(quotedCsvTable?.payload.primaryValue).toBe(
      "| name | note |\n| ---- | ---- |\n| Boss | a,b  |",
    );
    expect(invalidCsvTable?.payload.primaryLabel).toBe("错误");
    expect(invalidCsvTable?.payload.warnings?.[0]).toContain("CSV");
    expect(timezoneFromClipboard?.payload.primaryValue).toBe("2024-03-09 11:00:00 UTC-05:00");
    expect(timezoneFromClipboard?.payload.meta?.quickOps).toEqual(
      expect.objectContaining({
        operation: "date-convert",
        inputSource: "clipboard",
        targetOffsetMinutes: -300,
      }),
    );
    expect(invalidTimezone?.payload.primaryLabel).toBe("错误");
    expect(invalidTimezone?.payload.warnings?.[0]).toContain("date/timezone");
  });

  it("keeps QuickOps clipboard fallback detection command-specific", () => {
    expect(hasQuickOpsDeveloperCommand({ text: "json" })).toBe(true);
    expect(hasQuickOpsDeveloperCommand({ text: "base64 decode" })).toBe(true);
    expect(hasQuickOpsDeveloperCommand({ text: "uuid v4" })).toBe(true);
    expect(hasQuickOpsDeveloperCommand({ text: "uuid history" })).toBe(false);
  });

  it("guards overlong input before ability matching", async () => {
    const canHandle = vi.fn(() => true);
    const sdk = createPreviewSdk({
      maxInputLength: 4,
      abilities: [
        {
          id: "preview.test",
          priority: 1,
          safety: createStaticPreviewSafetyPolicy("test", 4),
          canHandle,
          execute: vi.fn(async () => null),
        },
      ],
    });

    const output = await sdk.resolveWithDiagnostics({
      query: { text: "12345", inputs: [] },
      signal: signal(),
    });

    expect(output.result).toBeNull();
    expect(output.diagnostics).toEqual(
      expect.objectContaining({
        status: "input-too-long",
        inputLength: 5,
        maxInputLength: 4,
        checkedAbilityCount: 0,
        executedAbilityCount: 0,
      }),
    );
    expect(canHandle).not.toHaveBeenCalled();
  });

  it("returns resolve diagnostics and enriches preview payload metadata", async () => {
    let now = 0;
    const ability: PreviewAbility = {
      id: "preview.test",
      priority: 1,
      safety: createStaticPreviewSafetyPolicy("test", 20),
      canHandle: () => true,
      execute: async () => ({
        abilityId: "preview.test",
        confidence: 0.9,
        payload: {
          abilityId: "preview.test",
          title: "test",
          primaryValue: "ok",
        },
      }),
    };
    const sdk = createPreviewSdk({
      abilities: [ability],
      now: () => now++,
    });

    const output = await sdk.resolveWithDiagnostics({
      query: { text: "test", inputs: [] },
      signal: signal(),
      budgetMs: 2,
    });

    expect(output.result?.durationMs).toBe(1);
    expect(output.diagnostics).toEqual(
      expect.objectContaining({
        status: "success",
        durationMs: 3,
        checkedAbilityCount: 1,
        executedAbilityCount: 1,
        exceededBudget: true,
        matchedAbilityId: "preview.test",
      }),
    );
    expect(output.result?.payload.meta?.previewSdk).toEqual(
      expect.objectContaining({
        status: "success",
        resolveDurationMs: 3,
        abilityDurationMs: 1,
        inputLength: 4,
        checkedAbilityCount: 1,
        executedAbilityCount: 1,
        exceededBudget: true,
      }),
    );
  });

  it("runs deterministic PreviewSDK benchmark cases", async () => {
    let now = 0;
    const ability: PreviewAbility = {
      id: "preview.benchmark",
      priority: 1,
      safety: createStaticPreviewSafetyPolicy("benchmark", 20),
      canHandle: (query) => query.text === "hit",
      execute: async () => ({
        abilityId: "preview.benchmark",
        confidence: 0.8,
        payload: {
          abilityId: "preview.benchmark",
          title: "benchmark",
          primaryValue: "ok",
        },
      }),
    };
    const sdk = createPreviewSdk({
      abilities: [ability],
      now: () => now++,
    });

    const result = await runPreviewSdkBenchmark(
      sdk,
      [
        {
          id: "hit",
          query: { text: "hit", inputs: [] },
          expectedAbilityId: "preview.benchmark",
          budgetMs: 2,
        },
        {
          id: "miss",
          query: { text: "miss", inputs: [] },
          expectNoResult: true,
        },
      ],
      signal(),
    );

    expect(result.summary).toEqual(
      expect.objectContaining({
        total: 2,
        matchedExpected: 2,
        mismatchedExpected: 0,
        exceededBudget: 1,
        failed: 1,
        p50DurationMs: 1,
        p95DurationMs: 3,
        maxDurationMs: 3,
      }),
    );
    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: "budget-exceeded",
        caseId: "hit",
        expectedAbilityId: "preview.benchmark",
        actualAbilityId: "preview.benchmark",
        status: "success",
      }),
    ]);
    expect(result.cases.map((item) => item.matchedExpected)).toEqual([
      true,
      true,
    ]);
  });

  it("surfaces benchmark ability mismatches as actionable failures", async () => {
    const sdk = createPreviewSdk({
      abilities: [
        {
          id: "preview.actual",
          priority: 1,
          safety: createStaticPreviewSafetyPolicy("benchmark", 20),
          canHandle: () => true,
          execute: async () => ({
            abilityId: "preview.actual",
            confidence: 0.8,
            payload: {
              abilityId: "preview.actual",
              title: "benchmark",
              primaryValue: "ok",
            },
          }),
        },
      ],
    });

    const result = await runPreviewSdkBenchmark(
      sdk,
      [
        {
          id: "wrong-ability",
          query: { text: "hit", inputs: [] },
          expectedAbilityId: "preview.expected",
          budgetMs: 40,
        },
      ],
      signal(),
    );

    expect(result.summary).toEqual(
      expect.objectContaining({
        total: 1,
        matchedExpected: 0,
        mismatchedExpected: 1,
        exceededBudget: 0,
        failed: 1,
      }),
    );
    expect(result.failures).toEqual([
      expect.objectContaining({
        kind: "ability-mismatch",
        caseId: "wrong-ability",
        expectedAbilityId: "preview.expected",
        actualAbilityId: "preview.actual",
        status: "success",
      }),
    ]);
  });
});
