import { readFileSync } from "node:fs";

const repoRoot = new URL("../../", import.meta.url);

function readRepoFile(file) {
  try {
    return readFileSync(new URL(file, repoRoot), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

const checks = [
  {
    file: "docs/plan-prd/03-features/ai-2.5.0-plan-prd.md",
    needles: [
      "Stable 只承诺 **CoreBox 文本 + OCR + provider routing + 明确失败路径**",
      "CoreBox AI Ask",
      "默认 Nexus AI provider",
      "--requireCurrentVersion",
    ],
  },
  {
    file: "docs/plan-prd/03-features/ai-2.5.3-local-knowledge-retrieval-prd.md",
    needles: [
      "SQLite / FTS5 / metadata",
      "Context Builder",
      "不把 embeddings 或向量数据库作为第一优先级",
    ],
  },
  {
    file: "docs/plan-prd/03-features/ai-2.5.4-context-hygiene-memory-prd.md",
    needles: [
      "Session / Checkpoint / Memory / Compression / ContextPackage",
      "默认轻上下文",
      "旧 session 原文不默认注入 prompt",
    ],
  },
  {
    file: "docs/plan-prd/03-features/ai-2.5.5-local-model-runtime-prd.md",
    needles: ["不强依赖 Ollama", "内置 GGUF runtime", "模型权重按需下载"],
  },
  {
    file: "docs/plan-prd/03-features/ai-2.5.8-asr-provider-runtime-prd.md",
    needles: ["whisper.cpp", "local-only", "不做 TTS"],
  },
  {
    file: "docs/plan-prd/TODO.md",
    needles: [
      "R2 AI Stable",
      "historical 13/13 / current recapture open",
      "--requireCurrentVersion",
      "R9.2 ContextHygiene",
      "R8-F CatalogService MVP",
    ],
  },
  {
    file: "docs/plan-prd/04-implementation/AI-2.5x-Execution-Plan-2026-06-16.md",
    needles: [
      "2.5.0 可见体验证据",
      "2.5.3 Context Builder 基座",
      "2.5.4 ContextHygiene",
      "2.5.5 / 2.5.8 非当前抢占范围",
      "验证门禁",
      "后续切片",
    ],
  },
];

const failures = [];

for (const check of checks) {
  const content = readRepoFile(check.file);
  if (content === null) {
    failures.push(`${check.file}: file is missing`);
    continue;
  }

  for (const needle of check.needles) {
    if (!content.includes(needle)) {
      failures.push(`${check.file}: missing ${JSON.stringify(needle)}`);
    }
  }
}

if (failures.length > 0) {
  console.error("AI docs verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("AI docs verification passed");
for (const check of checks) {
  console.log(`- ${check.file}`);
}
