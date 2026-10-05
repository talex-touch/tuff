// Managed by Comet: Oh My Pi Hook Router bridge
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@oh-my-pi/pi-coding-agent';

const ompRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const router = resolve(ompRoot, 'skills/comet/scripts/comet-hook-router.mjs');

function runRouter(payload: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    let settled = false;
    let stderr = '';
    let stdout = '';
    const finish = (code: number, reason = stderr) => {
      if (settled) return;
      settled = true;
      done({ code, stdout, stderr: reason });
    };
    const child = spawn('node', [router, '--platform', 'oh-my-pi'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (stdout.length < 262_144) stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (stderr.length < 65_536) stderr += chunk;
    });
    child.on('error', (error) => finish(1, error.message));
    child.on('close', (code) => finish(code ?? 1));
    child.stdin.end(payload);
  });
}

function readContext(stdout: string): string | undefined {
  for (const line of stdout.trim().split(/\r?\n/u).reverse()) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as {
        additionalContext?: unknown;
        hookSpecificOutput?: { additionalContext?: unknown };
      };
      const context = value.hookSpecificOutput?.additionalContext ?? value.additionalContext;
      if (typeof context === 'string' && context.trim()) return context;
    } catch {
      continue;
    }
  }
  return undefined;
}

function sessionId(ctx: { sessionManager?: { getSessionFile?: () => string | undefined } }): string | undefined {
  return ctx.sessionManager?.getSessionFile?.();
}

export default function cometHook(pi: ExtensionAPI): void {
  pi.on('before_agent_start', async (event, ctx) => {
    const result = await runRouter(
      JSON.stringify({
        hook_event_name: 'before_agent_start',
        task: event.prompt,
        cwd: ctx.cwd,
        session_id: sessionId(ctx),
      }),
    );
    if (result.code !== 0) return;
    const context = readContext(result.stdout);
    if (!context) return;
    return {
      message: {
        customType: 'comet.context-manifest',
        content: context,
        display: false,
        details: { source: 'comet.context-director' },
      },
    };
  });

  pi.on('tool_call', async (event, ctx) => {
    const result = await runRouter(
      JSON.stringify({
        tool_name: event.toolName,
        tool_input: event.input,
        cwd: ctx.cwd,
        session_id: sessionId(ctx),
      }),
    );
    if (result.code === 0) return;
    const reason = result.stderr.trim() || 'Comet Hook Router blocked the tool call';
    return { block: true, reason };
  });
}
