import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, it } from "vitest";

const ciDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(ciDir, "..", "..");
const workflowPath = path.join(repoRoot, ".github/workflows/ai-review.yml");
const reviewScriptPath = path.join(ciDir, "ai-review.mjs");
const reviewCommand = 'node scripts/ci/ai-review.mjs "$GITHUB_EVENT_PATH"';

function runReview(event) {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "tuff-ai-review-event-"),
  );
  const eventPath = path.join(tempDir, "event.json");
  fs.writeFileSync(eventPath, JSON.stringify(event));

  try {
    return spawnSync(process.execPath, [reviewScriptPath, eventPath], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {},
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("AI PR review CI security contract", () => {
  it("checks out only the trusted base revision with least-privileged permissions", () => {
    const workflow = parse(fs.readFileSync(workflowPath, "utf8"));
    const reviewJob = workflow.jobs["ai-review"];
    const checkoutSteps = reviewJob.steps.filter((step) =>
      String(step.uses ?? "").startsWith("actions/checkout@"),
    );
    const runCommands = reviewJob.steps
      .map((step) => step.run)
      .filter((command) => typeof command === "string");

    assert.equal(workflow.name, "AI PR Review");
    assert.deepEqual(workflow.on.pull_request_target.types, [
      "opened",
      "edited",
      "reopened",
      "ready_for_review",
      "synchronize",
    ]);
    assert.deepEqual(workflow.permissions, {
      contents: "read",
      "pull-requests": "read",
      issues: "write",
    });
    assert.deepEqual(workflow.concurrency, {
      group: "ai-pr-review-${{ github.event.pull_request.number }}",
      "cancel-in-progress": true,
    });
    assert.equal(checkoutSteps.length, 1);
    assert.equal(checkoutSteps[0].uses, "actions/checkout@v6");
    assert.equal(
      checkoutSteps[0].with.ref,
      "${{ github.event.pull_request.base.sha }}",
    );
    assert.equal(checkoutSteps[0].with["persist-credentials"], false);
    assert.deepEqual(runCommands, [reviewCommand]);
  });

  it.each([
    {
      name: "draft pull request",
      event: {
        pull_request: {
          draft: true,
        },
      },
      message: /Pull request is draft, skip AI review\./,
    },
    {
      name: "unchecked AI review request",
      event: {
        pull_request: {
          draft: false,
          body: "Please review this pull request without requesting AI analysis.",
          author_association: "MEMBER",
        },
      },
      message: /AI review not requested in PR template, skip\./,
    },
    {
      name: "checked English AI review request from an untrusted author",
      event: {
        pull_request: {
          draft: false,
          body: "- [x] Request AI assistance for PR analysis (summary, risks, etc.)",
          author_association: "NONE",
        },
      },
      message: /Author association NONE not in allowed list, skip\./,
    },
  ])(
    "skips safely for a $name without credentials or network access",
    ({ event, message }) => {
      const result = runReview(event);

      assert.equal(result.error, undefined);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, message);
    },
  );
});
