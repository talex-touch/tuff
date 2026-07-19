import type { PluginSecurityScanFile, PluginSecurityScanInput, PluginSecurityScanWaiver } from '../../plugin'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  scanPluginPackage,
  serializePluginSecurityScanReport,
} from '../../plugin'

const ARTIFACT_SHA256 = 'a'.repeat(64)
const FIXED_NOW = Date.parse('2026-07-18T12:00:00.000Z')

function textFile(path: string, text: string): PluginSecurityScanFile {
  return {
    path,
    size: Buffer.byteLength(text),
    sha256: createHash('sha256').update(text).digest('hex'),
    kind: 'text',
    text,
  }
}

function binaryFile(path: string): PluginSecurityScanFile {
  return {
    path,
    size: 4,
    sha256: createHash('sha256').update(path).digest('hex'),
    kind: 'binary',
  }
}

function scan(
  files: readonly PluginSecurityScanFile[],
  options: Partial<PluginSecurityScanInput> = {},
) {
  return scanPluginPackage({
    artifactSha256: ARTIFACT_SHA256,
    policyVersion: '2026-07-18',
    policyPassed: true,
    manifest: {
      permissions: { required: [], optional: [] },
    },
    files,
    ...options,
  }, {
    clock: () => FIXED_NOW,
    timeoutMs: 1_000,
  })
}

describe('plugin security scan', () => {
  it('passes clean packages deterministically and orders findings by normalized location', () => {
    const cleanFiles = [textFile('index.js', 'export const ready = true')]
    const first = scan(cleanFiles)
    const second = scan(cleanFiles)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      decision: 'passed',
      findings: [],
      artifactSha256: ARTIFACT_SHA256,
    })

    const ordered = scan([
      textFile('z-last.js', 'eval("runtime")'),
      textFile('a-first.js', 'const api_key = "0123456789"'),
    ])
    expect(ordered.findings.map(finding => [finding.location.path, finding.code])).toEqual([
      ['a-first.js', 'PLUGIN_SCAN_SECRET_MATERIAL'],
      ['z-last.js', 'PLUGIN_SCAN_DYNAMIC_EXECUTION'],
    ])
  })

  it.each([
    ['your prefix', 'your-api-key'],
    ['example prefix', 'example-api-key'],
    ['replace-me', 'replace-me'],
    ['change-me', 'change-me'],
    ['dummy prefix', 'dummy-api-key'],
    ['test prefix', 'test-api-key'],
    ['angle-bracket reference', '<api-key>'],
    ['template reference', ['$', '{API_KEY}'].join('')],
    ['all x characters', 'xxxxxxxx'],
    ['all asterisks', '********'],
    ['all zeroes', '00000000'],
  ] as const)('accepts %s secret placeholder without a finding', (_name, value) => {
    const report = scan([textFile('placeholder.js', `const api_key = "${value}"`)])

    expect(report).toMatchObject({ decision: 'passed', findings: [] })
  })

  it('blocks a realistic assigned secret with the stable finding code', () => {
    const report = scan([
      textFile('config.js', 'const api_key = "sk-12345678901234567890"'),
    ])

    expect(report.decision).toBe('blocked')
    expect(report.findings.map(finding => finding.code)).toEqual([
      'PLUGIN_SCAN_SECRET_MATERIAL',
    ])
  })

  it.each([
    ['private key material', [textFile('key.pem', '-----BEGIN PRIVATE KEY-----')], 'PLUGIN_SCAN_PRIVATE_KEY_MATERIAL'],
    ['secret material', [textFile('secret.js', 'const api_key = "not-a-real-secret-value"')], 'PLUGIN_SCAN_SECRET_MATERIAL'],
    ['raw runtime escape', [textFile('escape.js', 'import { app } from "electron"')], 'PLUGIN_SCAN_RAW_RUNTIME_ESCAPE'],
    ['dynamic execution', [textFile('dynamic.js', 'eval("runtime")')], 'PLUGIN_SCAN_DYNAMIC_EXECUTION'],
    ['native binary', [binaryFile('native/addon.node')], 'PLUGIN_SCAN_NATIVE_BINARY'],
    ['undeclared network capability', [textFile('network.js', 'fetch("https://example.invalid")')], 'PLUGIN_SCAN_PERMISSION_MISMATCH'],
  ] as const)('blocks %s with its stable finding code', (_name, files, code) => {
    const report = scan(files)

    expect(report.decision).toBe('blocked')
    expect(report.findings).toContainEqual(expect.objectContaining({ code }))
  })

  it('maps child-process use to system.shell permission and treats node:vm as dynamic execution', () => {
    const childProcess = textFile('shell.js', 'import { exec } from "node:child_process"')
    const undeclaredShell = scan([childProcess])
    const shellMismatch = undeclaredShell.findings.find(
      finding => finding.code === 'PLUGIN_SCAN_PERMISSION_MISMATCH',
    )

    expect(undeclaredShell.decision).toBe('blocked')
    expect(shellMismatch?.permissionId).toBe('system.shell')

    const declaredShell = scan([childProcess], {
      manifest: { permissions: { required: ['system.shell'], optional: [] } },
    })
    expect(declaredShell).toMatchObject({ decision: 'passed', findings: [] })

    const vmReport = scan([
      textFile('vm.js', 'import vm from "node:vm"'),
    ])
    expect(vmReport.decision).toBe('blocked')
    expect(vmReport.findings.map(finding => finding.code)).toContain(
      'PLUGIN_SCAN_DYNAMIC_EXECUTION',
    )
  })

  it('fails closed when its input is invalid or its clock exceeds the scan deadline', () => {
    const invalidDigest = scan([textFile('index.js', 'export {}')], {
      artifactSha256: 'not-a-digest',
    })
    expect(invalidDigest).toMatchObject({
      decision: 'unavailable',
      failure: { code: 'PLUGIN_SCAN_ARTIFACT_DIGEST_INVALID' },
    })

    let calls = 0
    const timedOut = scanPluginPackage({
      artifactSha256: ARTIFACT_SHA256,
      policyVersion: '2026-07-18',
      policyPassed: true,
      manifest: {},
      files: [textFile('index.js', 'export {}')],
    }, {
      clock: () => {
        calls += 1
        return calls === 1 ? FIXED_NOW : FIXED_NOW + 2
      },
      timeoutMs: 1,
    })
    expect(timedOut).toMatchObject({
      decision: 'unavailable',
      failure: { code: 'PLUGIN_SCAN_TIMEOUT' },
    })
  })

  it('fails closed without leaking exception text when scanning engine input throws', () => {
    const engineErrorText = 'internal scanner fixture failure'
    const manifest = new Proxy({}, {
      get() {
        throw new Error(engineErrorText)
      },
    })

    const report = scan([textFile('index.js', 'export {}')], { manifest })
    const serialized = serializePluginSecurityScanReport(report)

    expect(report).toMatchObject({
      decision: 'unavailable',
      findings: [],
      failure: { code: 'PLUGIN_SCAN_ENGINE_ERROR' },
    })
    expect(serialized).not.toContain(engineErrorText)
  })

  it('limits executable-code rules to executable files while retaining README secret detection', () => {
    const report = scan([textFile('README.md', [
      'eval("documentation example")',
      'import { app } from "electron"',
      '-----BEGIN PRIVATE KEY-----',
      'const api_key = "not-a-real-secret-value"',
    ].join('\n'))])
    const findingCodes = report.findings.map(finding => finding.code)

    expect(report.decision).toBe('blocked')
    expect(findingCodes).toEqual(expect.arrayContaining([
      'PLUGIN_SCAN_PRIVATE_KEY_MATERIAL',
      'PLUGIN_SCAN_SECRET_MATERIAL',
    ]))
    expect(findingCodes).not.toContain('PLUGIN_SCAN_DYNAMIC_EXECUTION')
    expect(findingCodes).not.toContain('PLUGIN_SCAN_RAW_RUNTIME_ESCAPE')
  })

  it('honors only valid server-owned waivers while retaining the original finding', () => {
    const files = [textFile('dynamic.js', 'eval("runtime")')]
    const validWaiver: PluginSecurityScanWaiver = {
      id: 'waiver-1',
      artifactSha256: ARTIFACT_SHA256,
      ruleId: 'PLUGIN_SCAN_DYNAMIC_EXECUTION',
      owner: 'security-reviewer',
      reason: 'Tracked compatibility exception',
      createdAt: '2026-07-17T12:00:00.000Z',
      expiresAt: '2026-07-19T12:00:00.000Z',
    }

    const waived = scan(files, { waivers: [validWaiver] })
    expect(waived).toMatchObject({
      decision: 'passed',
      findings: [expect.objectContaining({
        code: 'PLUGIN_SCAN_DYNAMIC_EXECUTION',
        waiver: expect.objectContaining({ id: 'waiver-1', owner: 'security-reviewer' }),
      })],
    })

    const expired = scan(files, {
      waivers: [{ ...validWaiver, expiresAt: '2026-07-18T11:59:59.000Z' }],
    })
    const malformed = scan(files, {
      waivers: [{ ...validWaiver, owner: '   ' }],
    })
    expect(expired.decision).toBe('blocked')
    expect(malformed.decision).toBe('blocked')
  })

  it('never serializes matched secret values or complete source text into reports', () => {
    const secret = 'not-a-real-secret-value'
    const source = `const api_key = "${secret}"\nexport const safe = true`
    const report = scan([textFile('secrets.js', source)])
    const serialized = serializePluginSecurityScanReport(report)

    expect(serialized).not.toContain(secret)
    expect(serialized).not.toContain(source)
    expect(report.findings[0]).toMatchObject({
      code: 'PLUGIN_SCAN_SECRET_MATERIAL',
      location: { path: 'secrets.js', line: 1 },
    })
  })
})
