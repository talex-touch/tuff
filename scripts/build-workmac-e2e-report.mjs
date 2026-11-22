import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const usage = 'Usage: node scripts/build-workmac-e2e-report.mjs <evidence-directory> <path-to-am.mjs>'
const [, , evidenceDirectory, rendererPath, ...extra] = process.argv
if (evidenceDirectory === '--help' && !rendererPath) {
  console.log(usage)
  process.exit(0)
}
if (!evidenceDirectory || !rendererPath || extra.length) {
  console.error(usage)
  process.exit(2)
}

const root = realpathSync(evidenceDirectory)
const renderer = realpathSync(rendererPath)

const read = path => readFileSync(join(root, path), 'utf8')
const json = path => JSON.parse(read(path))
const markdown = read('README.md')
const inventory = json('feature-inventory.json')
const chapters = [...markdown.matchAll(/^## (.+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)]
  .map(([, name, content]) => ({ name, content: content.trim() }))
const originReport = new Map(chapters.map(({ name, content }) => [name, content]))
function section(name) {
  assert(originReport.has(name), `Missing chapter in README.md: ${name}`)
  return originReport.get(name)
}

function readBatches(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^desktop-\d{14}(?:-[a-z0-9-]+)?$/.test(entry.name))
    .map(({ name }) => {
      const path = `${directory}/${name}`
      return { name, path, ...json(`${path}/results.json`) }
    })
    .filter(batch => batch.finishedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

const mainBatches = readBatches('batches')
const releaseBatches = readBatches('published-batches')
const nativeIndexBuild = json('bundle-native-index-check.json')
const mainBuild = json('bundle-check.json')
assert.equal(mainBuild.sourceCommit, inventory.sourceCommit, 'Candidate and inventory source commits differ')
assert.equal(mainBuild.version, inventory.coreAppVersion, 'Candidate and inventory versions differ')
const latest = new Map()
const released = new Map()
const candidateCaseIds = new Set()
let mainScreenshots = 0
let publishedScreenshots = 0

function evidenceCase(result, batch) {
  const screenshot = result.screenshot?.file
  if (screenshot) {
    assert.match(screenshot, /^screenshots\/[a-z0-9-]+\.png$/)
    assert(existsSync(join(root, batch.path, screenshot)), `Missing screenshot for ${batch.name}: ${result.id}`)
  }
  assert(result.status !== 'passed' || (batch.isolationVerified && screenshot), `Missing passed-case evidence: ${result.id}`)
  return { ...result, batch }
}

for (const batch of mainBatches) {
  assert.equal(batch.sourceCommit, inventory.sourceCommit)
  if (batch.packageVariant === 'native-index') {
    assert.equal(batch.appAsarSha256, nativeIndexBuild.appAsarSha256)
  }
  for (const result of batch.cases) {
    const entry = evidenceCase(result, batch)
    mainScreenshots += Number(Boolean(result.screenshot))
    if (batch.packageVariant !== 'native-index' || result.id.startsWith('native-index-') || !latest.has(result.id)) {
      latest.set(result.id, entry)
    }
    if (batch.runtime === 'packaged application' && batch.isolationVerified)
      candidateCaseIds.add(result.id)
  }
}

for (const batch of releaseBatches) {
  const trust = batch.publishedRelease
  assert(batch.runtime === 'official signed application' && trust?.buildAttestationVerified && trust.dmgSignatureVerified)
  assert.equal(batch.sourceCommit, trust.sourceCommit)
  assert.equal(batch.appAsarSha256, trust.appAsarSha256)
  assert.equal(batch.appVersion, trust.version)
  for (const result of batch.cases) {
    const entry = evidenceCase(result, batch)
    publishedScreenshots += Number(Boolean(result.screenshot))
    if (/^beta(?:9-update|10-release)-/.test(result.id))
      released.set(result.id, entry)
  }
}

const rank = ['failed', 'blocked', 'evidence-missing', 'passed']
function sortCases(results) {
  return [...results.values()].sort((a, b) =>
    rank.indexOf(a.status) - rank.indexOf(b.status) || a.title.localeCompare(b.title, 'zh-CN') || a.id.localeCompare(b.id))
}
const cases = sortCases(latest)
const releaseCases = sortCases(released)
const failed = cases.filter(item => item.status === 'failed')
const passed = cases.filter(item => item.status === 'passed').length
const releasePassed = releaseCases.filter(item => item.status === 'passed').length
const verifiedCases = [...cases, ...releaseCases].filter(item => item.screenshot)
for (const item of verifiedCases) {
  const screenshot = item.screenshot
  const bytes = readFileSync(join(root, item.batch.path, screenshot.file))
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(bytes.readUInt32BE(16), screenshot.width)
  assert.equal(bytes.readUInt32BE(20), screenshot.height)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), screenshot.sha256)
}

const coverage = new Map([...section('当前覆盖').matchAll(/^\| (.+?) \| (\d+) \|$/gm)]
  .map(([, label, count]) => [label, Number(count)]))
for (const [label, actual] of Object.entries({
  '有执行记录的不同用例': cases.length,
  '在 macOS 本地候选包有运行记录的用例': candidateCaseIds.size,
  '通过': passed,
  '失败': failed.length,
  '阻塞': cases.filter(item => item.status === 'blocked').length,
  '断言通过但截图缺失': cases.filter(item => item.status === 'evidence-missing').length,
  '最近一次执行有截图的用例': cases.filter(item => item.screenshot).length,
  '最近一次执行没有截图的用例': cases.filter(item => !item.screenshot).length,
  '历次主线重跑中已核对的截图': mainScreenshots,
  '公开发布包专属用例': releaseCases.length,
  '公开发布包自动断言通过': releasePassed,
  '公开发布包已核对的截图': publishedScreenshots,
})) assert.equal(coverage.get(label), actual, `README.md is out of sync with the evidence: ${label}`)

const dateFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const date = timestamp => dateFormat.format(new Date(timestamp))
const number = value => value.toLocaleString('zh-CN')
const status = {
  'passed': 'ok 通过',
  'failed': 'no 失败',
  'blocked': 'warn 阻塞',
  'evidence-missing': 'warn 缺截图',
}
function runtime(batch) {
  if (batch.publishedRelease)
    return `官方发布包 ${batch.appVersion}`
  if (batch.packageVariant === 'native-index')
    return 'macOS 原生索引测试包'
  return batch.runtime === 'packaged application' ? 'macOS 候选包' : '源码运行'
}

function plain(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/[\r\n]+/g, ' ').trim().replace(/[\\`*_[\]$]/g, '\\$&')
}

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
    '',
    '{table sort filter}',
  ].join('\n')
}

function caseTable(records, includeObservations = false) {
  return table(['用例', '结果', '操作与预期', '运行形态', '证据'], records.map((item) => {
    const path = item.batch.path
    const steps = item.steps?.map(plain).join(' → ') ?? ''
    const observation = item.error ?? (includeObservations && item.observation ? JSON.stringify(item.observation) : '')
    const summary = [steps, `**预期** ${plain(item.expectation)}`, observation ? `**实测** ${plain(observation)}` : ''].filter(Boolean)
    return [
      `${plain(item.title)} · \`${item.id}\``,
      status[item.status] ?? plain(item.status),
      summary.join('。 '),
      runtime(item.batch),
      `${item.screenshot ? `[原图](${path}/${item.screenshot.file}) · ` : ''
      }[JSON](${path}/results.json)`,
    ]
  }))
}

const batchTable = table(['开始时间（北京时间）', '批次', '运行形态', '执行', '通过', '截图', '回执'], [...mainBatches, ...releaseBatches].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(batch => [
  date(batch.startedAt),
  `\`${batch.name}\` · ${plain(batch.suite)}`,
  runtime(batch) + (batch.appAsarSha256 ? ` · \`${batch.appAsarSha256.slice(0, 12)}\`` : ''),
  batch.cases.length,
  batch.cases.filter(item => item.status === 'passed').length,
  batch.cases.filter(item => item.screenshot).length,
  `[结果 JSON](${batch.path}/results.json)${batch.runError ? `。${plain(batch.runError)}` : ''}`,
]))

const firstModule = chapters.findIndex(item => item.name === 'CoreBox 输入与结果')
const firstBuild = chapters.findIndex(item => item.name === 'macOS 候选包')
assert(firstModule >= 0 && firstBuild > firstModule)
assert.equal(mainBatches.length, (section('批次历史').match(/^\| \d{4}\//gm) ?? []).length, 'The main batch count does not match the original report')
const representative = latest.get('home-shell-terminal-open-native')
const screenPath = representative?.screenshot && resolve(root, representative.batch.path, representative.screenshot.file)
const chapter = ({ name, content }) => `### ${name}\n\n${content.replace(/^### /gm, '#### ')}`
const moduleContent = chapters.slice(firstModule, firstBuild).map((item) => {
  const detail = chapter(item)
  return item.name === '主窗口交互终端' && screenPath
    ? `${detail}\n\n![主窗口内置终端在候选包上启动原生 zsh 会话](${screenPath})`
    : detail
}).join('\n\n')
const buildContent = chapters.slice(firstBuild, chapters.findIndex(item => item.name === '证据说明'))
  .map(({ name, content }) => {
    if (name !== 'workmac 官方发布包验收')
      return chapter({ name, content })
    const beforeTable = content.search(/^\| 用例 \| 操作 \| 结果 \| 观察 \| 图像 \|/m)
    const afterTable = content.search(/^发布包批次 /m)
    assert(beforeTable >= 0 && afterTable > beforeTable, 'Could not locate the original release case table')
    const synopsis = content.slice(0, beforeTable).trimEnd().replace('本页上方的主线矩阵', '[主线用例明细](#panel-G)')
    return chapter({ name, content: `${synopsis}\n\n${caseTable(releaseCases, true)}\n\n${content.slice(afterTable)}` })
  })
  .join('\n\n')

const snapshotDate = date(mainBatches.at(-1).finishedAt)
const mainWithScreenshots = cases.filter(item => item.screenshot).length
const otherStatuses = cases.length - passed - failed.length

const draft = [
  '---',
  'template: doc',
  'theme: paper',
  'outline: left',
  'lang: zh',
  'title: Tuff 全量 E2E 验收报告',
  `subtitle: workmac · macOS arm64 · CoreApp ${inventory.coreAppVersion}`,
  'file: tuff-e2e-report',
  'style: off',
  '---',
  '',
  `**主线** \`${inventory.sourceCommit.slice(0, 9)}\` · **证据截至** ${snapshotDate}（北京时间）`,
  '',
  '[查看失败用例](#panel-F) · [检索全部用例](#panel-G) · [待验收](#panel-C) · [批次历史](#panel-H) · [原始报告](README.md)',
  '',
  '## A 验收总览',
  '',
  '```kv cols=4',
  `执行用例: ${number(cases.length)}`,
  `通过: ${number(passed)}`,
  `失败: ${number(failed.length)}`,
  `最近一次有截图: ${number(mainWithScreenshots)}`,
  '```',
  '',
  '```chart pie unit=条',
  `通过 | ${passed}`,
  `失败 | ${failed.length}`,
  ...(otherStatuses ? [`其他结果 | ${otherStatuses}`] : []),
  '```',
  '',
  `${candidateCaseIds.size} 条主线用例在 macOS 候选包上跑过。主线累计 ${number(mainBatches.length)
  } 个批次，核对 ${number(mainScreenshots)} 张截图。官方发布包有 ${
    releaseBatches.length} 个批次和 ${releaseCases.length} 条专属用例，自动断言通过 ${releasePassed} 条。`,
  '',
  `源码清单收录 ${inventory.summary.sourceBackedEntries} 个已确认入口及命令，另有 ${
    inventory.summary.extractedActionCandidates} 个待去重的界面操作候选。 [源代码功能清单](feature-inventory.json)`,
  '',
  '## B 已复现的问题',
  '',
  section('已复现的问题'),
  '',
  '## C 尚待验收',
  '',
  section('尚待验收'),
  '',
  '## D 分模块验收详情',
  '',
  moduleContent,
  '',
  '## E 构建与官方发布',
  '',
  `主线候选包构建指纹为 \`${mainBuild.appAsarSha256.slice(0, 12)}\`。官方包的构建提交及更新回执见下方。`,
  '',
  buildContent,
  '',
  `## F 失败用例 · ${failed.length} 条`,
  '',
  '按标题、用例 ID 或错误关键词查找。每行提供截图原图和本批次的完整回执。',
  '',
  caseTable(failed),
  '',
  `## G 全部用例 · ${cases.length} 条`,
  '',
  '每条用例展示最近一次验收的步骤、预期及证据。可搜索列内文字并点击表头排序。',
  '',
  caseTable(cases),
  '',
  `## H 批次与复跑 · ${mainBatches.length + releaseBatches.length} 批`,
  '',
  batchTable,
  '',
  '### 证据说明',
  '',
  section('证据说明'),
  '',
  '### 执行流程',
  '',
  section('执行流程'),
  '',
].join('\n')

for (const [, path] of draft.matchAll(/\]\(((?:batches\/|published-batches\/|tools\/)[^)]+|[a-z-]+\.json|README\.md)\)/g)) {
  assert(existsSync(join(root, path)), `Broken report link: ${path}`)
}

const outputDirectory = mkdtempSync(join(root, '.report-render-'))
const temporary = join(outputDirectory, 'index.html')
try {
  const generated = spawnSync(process.execPath, [renderer, 'render', '-', '--no-open', '-o', temporary], {
    cwd: root,
    encoding: 'utf8',
    input: draft,
    maxBuffer: 1024 * 1024,
  })
  if (generated.error)
    throw generated.error
  if (generated.status !== 0)
    throw new Error(generated.stderr || generated.stdout)
  assert(existsSync(temporary), 'The report renderer produced no HTML')
  renameSync(temporary, join(root, 'index.html'))
  process.stdout.write(generated.stdout.replace(temporary, join(root, 'index.html')))
  console.log(JSON.stringify({
    mainCases: cases.length,
    failed: failed.length,
    mainBatches: mainBatches.length,
    releaseCases: releaseCases.length,
    releaseBatches: releaseBatches.length,
    latestPngHashesVerified: verifiedCases.length,
  }))
}
finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
