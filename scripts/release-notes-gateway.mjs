#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { getArgValue, hasFlag } from './lib/argv-utils.mjs'
import {
  compareReleaseNotesVersions,
  inferReleaseNotesChannel,
  validateReleaseNotesAtRepo,
} from './lib/release-notes-contract.mjs'

const argv = process.argv.slice(2)
const command = argv[0] || 'verify'
const repoRoot = path.resolve(getArgValue(argv, '--repo-root', process.cwd()))
const version = getArgValue(argv, '--version', readPackageVersion(repoRoot))
const tag = getArgValue(argv, '--tag', `v${version}`)

if (command === 'prepare') {
  prepare()
}
else if (command === 'verify') {
  verify()
}
else {
  fail(`Unknown command: ${command}`)
}

function prepare() {
  const targetRef = getArgValue(argv, '--target-ref', 'HEAD')
  const targetSha = runGit(['rev-parse', targetRef])
  const channel = inferReleaseNotesChannel(version)
  const tags = runGit(['tag', '--merged', targetSha, '--sort=-v:refname'])
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean)
  const previousTag
    = tags.find((candidate) => {
      return inferReleaseNotesChannel(candidate) === channel && compareReleaseNotesVersions(candidate, version) < 0
    }) ?? ''
  const range = previousTag ? `${previousTag}..${targetSha}` : targetSha
  const commits = parseGitLog(runGit(['log', '--format=%H%x1f%s%x1f%b%x1e', range]))
  const templates = buildTemplates(version)
  const files = {
    zh: path.join(repoRoot, 'notes', `update_${version}.zh.md`),
    en: path.join(repoRoot, 'notes', `update_${version}.en.md`),
  }

  if (hasFlag(argv, '--write')) {
    fs.mkdirSync(path.dirname(files.zh), { recursive: true })
    writeNewFile(files.zh, templates.zh)
    writeNewFile(files.en, templates.en)
  }

  print({
    command,
    version,
    tag,
    channel,
    targetRef,
    targetSha,
    previousTag,
    range,
    commits,
    files,
    templates,
    wroteTemplates: hasFlag(argv, '--write'),
  })
}

function verify() {
  const rootVersion = readPackageVersion(repoRoot)
  const coreVersion = readPackageVersion(path.join(repoRoot, 'apps', 'core-app'))
  const notes = validateReleaseNotesAtRepo({ repoRoot, version })
  const checks = [
    {
      name: 'root-version',
      pass: rootVersion === version,
      expected: version,
      actual: rootVersion,
    },
    {
      name: 'core-version',
      pass: coreVersion === version,
      expected: version,
      actual: coreVersion,
    },
    {
      name: 'tag-version',
      pass: tag.replace(/^v/, '') === version,
      expected: version,
      actual: tag.replace(/^v/, ''),
    },
    {
      name: 'bilingual-notes',
      pass: notes.enforcement.enforced ? Boolean(notes.validation?.valid) : true,
      enforced: notes.enforcement.enforced,
      channel: notes.enforcement.channel,
      reason: notes.enforcement.reason,
      errors: notes.validation?.errors ?? [],
    },
  ]
  const valid = checks.every(check => check.pass)

  print({
    command,
    valid,
    version,
    tag,
    files: notes.paths,
    checks,
  })

  if (!valid)
    process.exitCode = 1
}

function readPackageVersion(root) {
  const packagePath = path.join(root, 'package.json')
  const parsed = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  if (typeof parsed.version !== 'string' || !parsed.version.trim()) {
    throw new Error(`Package version is missing: ${packagePath}`)
  }
  return parsed.version.trim()
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function parseGitLog(raw) {
  return raw
    .split('\x1E')
    .map(record => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash = '', subject = '', body = ''] = record.split('\x1F')
      return { hash, subject, body: body.trim() }
    })
}

function buildTemplates(targetVersion) {
  return {
    zh: `# Tuff v${targetVersion} 更新说明\n\n## 摘要\n\n- \n- \n- \n\n## 变更内容\n\n- \n`,
    en: `# Tuff v${targetVersion} Release Notes\n\n## Summary Notes\n\n- \n- \n- \n\n## What's Changed\n\n- \n`,
  }
}

function writeNewFile(filePath, content) {
  if (fs.existsSync(filePath)) {
    throw new Error(`Refusing to overwrite existing release notes: ${filePath}`)
  }
  fs.writeFileSync(filePath, content, 'utf8')
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
