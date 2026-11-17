'use strict'

const assert = require('node:assert/strict')
const { Buffer } = require('node:buffer')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  getRustOcrHelperStatus,
  recognizeImageTextViaRustHelper,
  closeRustOcrHelper,
} = require('./ocr-helper')

function buildWindowsFakeHelperExe(dir) {
  const rsTarget = path.join(dir, 'fake-ocr.rs')
  const exeTarget = path.join(dir, 'fake-ocr.exe')
  fs.writeFileSync(
    rsTarget,
    `use std::io::{self, BufRead, Write};

fn extract_str<'a>(line: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\\"{key}\\":\\"");
    let start = line.find(&needle)? + needle.len();
    let rest = &line[start..];
    let end = rest.find('"')?;
    Some(&rest[..end])
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut out = io::BufWriter::new(stdout.lock());
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let id = extract_str(&line, "id").unwrap_or("");
        let op = extract_str(&line, "operation").unwrap_or("");
        if op == "shutdown" {
            let _ = writeln!(out, "{{\\"id\\":\\"{id}\\",\\"ok\\":true}}");
            let _ = out.flush();
            std::process::exit(0);
        }
        let file_path = extract_str(&line, "filePath");
        if let Some(fp) = file_path {
            if fp.contains("hang") {
                continue;
            }
            if fp.contains("crash") {
                std::process::exit(2);
            }
            if fp.contains("no-text") {
                let _ = writeln!(
                    out,
                    "{{\\"id\\":\\"{id}\\",\\"ok\\":false,\\"code\\":\\"ERR_OCR_RECOGNIZE_FAILED\\",\\"message\\":\\"Apple Vision recognized no text in the image\\"}}"
                );
                let _ = out.flush();
                continue;
            }
        }
        let tag = file_path.unwrap_or("buf");
        let pid = std::process::id();
        let _ = writeln!(
            out,
            "{{\\"id\\":\\"{id}\\",\\"ok\\":true,\\"text\\":\\"pid:{pid}:{tag}\\",\\"engine\\":\\"apple-vision\\",\\"durationMs\\":7}}"
        );
        let _ = out.flush();
    }
}
`,
    'utf8',
  )
  const compile = spawnSync('rustc', [rsTarget, '-O', '-o', exeTarget], {
    encoding: 'utf8',
  })
  assert.equal(
    compile.status,
    0,
    `Failed to compile fake-ocr.exe with rustc: ${compile.stderr || compile.error?.message || ''}`,
  )
  return exeTarget
}

function makeFakeHelperScript() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-ocr-helper-test-'))
  if (process.platform === 'win32') {
    return { dir, scriptPath: buildWindowsFakeHelperExe(dir) }
  }

  const scriptPath = path.join(dir, 'fake-ocr.js')
  const jsTarget = path.join(dir, 'worker.js')

  fs.writeFileSync(
    jsTarget,
    `'use strict'
const readline = require('node:readline')
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  if (!line.trim()) return
  const req = JSON.parse(line)
  if (req.operation === 'shutdown') {
    process.stdout.write(JSON.stringify({ id: req.id, ok: true }) + '\\n')
    process.exit(0)
  }
  if (req.filePath && req.filePath.includes('hang')) {
    return
  }
  if (req.filePath && req.filePath.includes('crash')) {
    process.exit(2)
  }
  if (req.filePath && req.filePath.includes('no-text')) {
    process.stdout.write(JSON.stringify({
      id: req.id,
      ok: false,
      code: 'ERR_OCR_RECOGNIZE_FAILED',
      message: 'Apple Vision recognized no text in the image',
    }) + '\\n')
    return
  }
  process.stdout.write(JSON.stringify({
    id: req.id,
    ok: true,
    text: 'pid:' + process.pid + ':' + (req.filePath || 'buf'),
    engine: 'apple-vision',
    durationMs: 7,
  }) + '\\n')
})
`,
    'utf8',
  )

  fs.writeFileSync(scriptPath, `#!/bin/sh\nexec "${process.execPath}" "${jsTarget}"\n`, 'utf8')
  fs.chmodSync(scriptPath, 0o755)

  return { dir, scriptPath }
}

test('Rust OCR helper reuses one process across calls, isolates hangs/crashes, and recovers', async (t) => {
  const { dir, scriptPath } = makeFakeHelperScript()
  const prevPath = process.env.TUFF_RUST_OCR_HELPER_PATH
  const prevDisable = process.env.TUFF_DISABLE_RUST_OCR
  process.env.TUFF_RUST_OCR_HELPER_PATH = scriptPath
  delete process.env.TUFF_DISABLE_RUST_OCR

  t.after(() => {
    closeRustOcrHelper()
    if (prevPath === undefined) {
      delete process.env.TUFF_RUST_OCR_HELPER_PATH
    }
    else {
      process.env.TUFF_RUST_OCR_HELPER_PATH = prevPath
    }
    if (prevDisable === undefined) {
      delete process.env.TUFF_DISABLE_RUST_OCR
    }
    else {
      process.env.TUFF_DISABLE_RUST_OCR = prevDisable
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  assert.equal(getRustOcrHelperStatus().available, true)

  const first = await recognizeImageTextViaRustHelper({ filePath: '/tmp/a.png' })
  const second = await recognizeImageTextViaRustHelper({ image: Buffer.from('hello') })
  const pid1 = first.text.split(':')[1]
  const pid2 = second.text.split(':')[1]
  assert.equal(pid1, pid2, 'warm requests should reuse the same persistent helper pid')

  // Native error keeps the warm helper alive.
  await assert.rejects(
    () => recognizeImageTextViaRustHelper({ filePath: '/tmp/no-text.png' }),
    { code: 'ERR_OCR_RECOGNIZE_FAILED' },
  )
  const third = await recognizeImageTextViaRustHelper({ filePath: '/tmp/b.png' })
  assert.equal(third.text.split(':')[1], pid1)

  // Timeout kills only the wedged helper; the queued follower runs on a fresh helper pid.
  const hung = recognizeImageTextViaRustHelper(
    { filePath: '/tmp/hang.png' },
    { timeoutMs: 80 },
  )
  const queued = recognizeImageTextViaRustHelper({ filePath: '/tmp/recovered.png' })

  await assert.rejects(() => hung, { code: 'OCR_PROCESS_TIMEOUT' })
  const recovered = await queued
  const pidAfterHang = recovered.text.split(':')[1]
  assert.notEqual(pidAfterHang, pid1, 'timeout recovery must spawn a fresh helper pid')

  // Unexpected child exit rejects active call and still allows fresh recovery.
  await assert.rejects(
    () => recognizeImageTextViaRustHelper({ filePath: '/tmp/crash.png' }),
    { code: 'OCR_PROCESS_EXITED' },
  )
  const afterCrash = await recognizeImageTextViaRustHelper({ filePath: '/tmp/c.png' })
  assert.ok(afterCrash.text.startsWith('pid:'))

  // Env opt-out hides helper cleanly.
  process.env.TUFF_DISABLE_RUST_OCR = '1'
  assert.equal(getRustOcrHelperStatus().available, false)
})
