import type { SelectOption } from '../prompts'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { t } from '../i18n'
import {
  askConfirm,
  askSelect,
  askText,
  colors,
  printError,
  printHeader,
  printInfo,
  printList,
  printSuccess,

  styled,
  withSpinner,
} from '../prompts'

const execAsync = promisify(exec)

const TEMPLATE_REPO = 'https://github.com/talex-touch/tuff-plugin-template.git'
const SQLITE_PERMISSION_ID = 'storage.sqlite'
const SQLITE_PERMISSION_REASON = 'Store plugin business data in the local SQLite database'

export interface CreateOptions {
  name?: string
  type?: 'basic' | 'ui' | 'service'
  language?: 'typescript' | 'javascript'
  uiFramework?: 'vue' | 'react' | 'none'
  template?: 'default' | 'translation' | 'image' | 'custom'
  outputDir?: string
  skipInstall?: boolean
}

/**
 * Validate plugin name
 */
function validatePluginName(name: string): boolean | string {
  if (!name) {
    return t('create.invalidName')
  }
  // Plugin name: lowercase letters, numbers, hyphens
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    return t('create.invalidName')
  }
  if (name.length < 2 || name.length > 50) {
    return 'Name must be between 2 and 50 characters'
  }
  return true
}

/**
 * Check if git is installed
 */
async function checkGitInstalled(): Promise<boolean> {
  try {
    await execAsync('git --version')
    return true
  }
  catch {
    return false
  }
}

/**
 * Clone template from GitHub
 */
async function cloneTemplate(targetDir: string, branch?: string): Promise<void> {
  const branchArg = branch ? `-b ${branch}` : ''
  await execAsync(`git clone --depth 1 ${branchArg} ${TEMPLATE_REPO} "${targetDir}"`)

  // Remove .git folder to start fresh
  const gitDir = path.join(targetDir, '.git')
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true })
  }
}

function ensureSqliteManifestConfig(manifest: any): void {
  const permissions = manifest.permissions && typeof manifest.permissions === 'object'
    ? manifest.permissions
    : {}
  const required = Array.isArray(permissions.required)
    ? permissions.required.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
  const optional = Array.isArray(permissions.optional)
    ? permissions.optional.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
    : []

  if (!required.includes(SQLITE_PERMISSION_ID)) {
    required.push(SQLITE_PERMISSION_ID)
  }

  manifest.permissions = {
    required,
    optional: optional.filter((permission: string) => permission !== SQLITE_PERMISSION_ID)
  }

  const permissionReasons =
    manifest.permissionReasons && typeof manifest.permissionReasons === 'object'
      ? manifest.permissionReasons
      : {}

  if (
    typeof permissionReasons[SQLITE_PERMISSION_ID] !== 'string'
    || permissionReasons[SQLITE_PERMISSION_ID].trim().length === 0
  ) {
    permissionReasons[SQLITE_PERMISSION_ID] = SQLITE_PERMISSION_REASON
  }

  manifest.permissionReasons = permissionReasons
}

async function createSqliteUsageExample(
  targetDir: string,
  language: 'typescript' | 'javascript'
): Promise<void> {
  const extension = language === 'typescript' ? 'ts' : 'js'
  const examplePath = path.join(targetDir, `sqlite-example.${extension}`)

  const content = language === 'typescript'
    ? `import { usePluginSqlite } from '@talex-touch/utils/plugin/sdk'

type NoteRow = {
  id: number
  title: string
  content: string
  created_at: string
}

export async function runSqliteExample(): Promise<NoteRow[]> {
  const sqlite = usePluginSqlite()

  await sqlite.execute(
    'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)'
  )

  await sqlite.transaction([
    {
      sql: 'INSERT INTO notes (title, content, created_at) VALUES (?, ?, ?)',
      params: ['Welcome', 'SQLite SDK ready', new Date().toISOString()]
    },
    {
      sql: 'INSERT INTO notes (title, content, created_at) VALUES (?, ?, ?)',
      params: ['Sync', 'Plugin items are synced automatically', new Date().toISOString()]
    }
  ])

  const result = await sqlite.query<NoteRow>(
    'SELECT id, title, content, created_at FROM notes ORDER BY id DESC LIMIT 20'
  )
  return result.rows
}
`
    : `import { usePluginSqlite } from '@talex-touch/utils/plugin/sdk'

export async function runSqliteExample() {
  const sqlite = usePluginSqlite()

  await sqlite.execute(
    'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL)'
  )

  await sqlite.transaction([
    {
      sql: 'INSERT INTO notes (title, content, created_at) VALUES (?, ?, ?)',
      params: ['Welcome', 'SQLite SDK ready', new Date().toISOString()]
    },
    {
      sql: 'INSERT INTO notes (title, content, created_at) VALUES (?, ?, ?)',
      params: ['Sync', 'Plugin items are synced automatically', new Date().toISOString()]
    }
  ])

  const result = await sqlite.query(
    'SELECT id, title, content, created_at FROM notes ORDER BY id DESC LIMIT 20'
  )
  return result.rows
}
`

  fs.writeFileSync(examplePath, content)
}

/**
 * Configure manifest.json with user inputs
 */
async function configureManifest(
  targetDir: string,
  config: {
    name: string
    type: string
    language: string
    uiFramework: string
  },
): Promise<void> {
  const manifestPath = path.join(targetDir, 'manifest.json')

  if (!fs.existsSync(manifestPath)) {
    // Create default manifest if not exists
    const manifest = {
      name: config.name,
      version: '0.0.1',
      description: `${config.name} - A Tuff plugin`,
      author: '',
      main: 'index.js',
      sdkapi: 260215,
      category: 'utilities',
      permissions: {
        required: [SQLITE_PERMISSION_ID],
        optional: [],
      },
      permissionReasons: {
        [SQLITE_PERMISSION_ID]: SQLITE_PERMISSION_REASON,
      },
      features: [
        {
          id: 'main',
          title: config.name,
          description: `Main feature of ${config.name}`,
          icon: 'puzzle',
          keywords: [config.name],
        },
      ],
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
    return
  }

  // Update existing manifest
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  manifest.name = config.name
  manifest.description = `${config.name} - A Tuff plugin`
  if (typeof manifest.sdkapi !== 'number' || manifest.sdkapi < 260215) {
    manifest.sdkapi = 260215
  }
  ensureSqliteManifestConfig(manifest)

  // Update feature titles
  if (manifest.features && Array.isArray(manifest.features)) {
    manifest.features = manifest.features.map((feature: any) => ({
      ...feature,
      title: feature.title?.replace(/template/gi, config.name) || config.name,
      description: feature.description?.replace(/template/gi, config.name) || `Feature of ${config.name}`,
    }))
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

/**
 * Update package.json with plugin info
 */
async function configurePackageJson(
  targetDir: string,
  config: {
    name: string
  },
): Promise<void> {
  const packagePath = path.join(targetDir, 'package.json')

  if (!fs.existsSync(packagePath)) {
    return
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
  pkg.name = config.name
  pkg.version = '0.0.1'
  pkg.description = `${config.name} - A Tuff plugin`

  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2))
}

/**
 * Install dependencies using pnpm/npm/yarn
 */
async function installDependencies(targetDir: string): Promise<void> {
  // Detect package manager
  let pm = 'npm'
  try {
    await execAsync('pnpm --version')
    pm = 'pnpm'
  }
  catch {
    try {
      await execAsync('yarn --version')
      pm = 'yarn'
    }
    catch {
      // fallback to npm
    }
  }

  await execAsync(`${pm} install`, { cwd: targetDir })
}

/**
 * Interactive create command
 */
export async function runCreate(options: CreateOptions = {}): Promise<void> {
  printHeader(t('create.title'))

  // Check git
  const gitInstalled = await checkGitInstalled()
  if (!gitInstalled) {
    printError(t('errors.gitNotInstalled'))
    process.exitCode = 1
    return
  }

  // Get plugin name
  const name = options.name || await askText(t('create.enterName'), {
    hint: t('create.enterNameHint'),
    validate: validatePluginName,
  })

  // Get plugin type
  const typeOptions: SelectOption<CreateOptions['type']>[] = [
    { label: t('create.types.basic'), value: 'basic' },
    { label: t('create.types.ui'), value: 'ui' },
    { label: t('create.types.service'), value: 'service' },
  ]
  const type = options.type || await askSelect(t('create.selectType'), typeOptions)

  // Get language
  const langOptions: SelectOption<CreateOptions['language']>[] = [
    { label: t('create.languages.typescript'), value: 'typescript' },
    { label: t('create.languages.javascript'), value: 'javascript' },
  ]
  const language = options.language || await askSelect(t('create.selectLanguage'), langOptions)

  // Get UI framework (only for UI type)
  let uiFramework: CreateOptions['uiFramework'] = 'none'
  if (type === 'ui') {
    const uiOptions: SelectOption<CreateOptions['uiFramework']>[] = [
      { label: t('create.uiFrameworks.vue'), value: 'vue' },
      { label: t('create.uiFrameworks.react'), value: 'react' },
      { label: t('create.uiFrameworks.none'), value: 'none' },
    ]
    uiFramework = options.uiFramework || await askSelect(t('create.selectUIFramework'), uiOptions)
  }

  // Get template
  const templateOptions: SelectOption<CreateOptions['template']>[] = [
    { label: t('create.templates.default'), value: 'default' },
    { label: t('create.templates.translation'), value: 'translation' },
    { label: t('create.templates.image'), value: 'image' },
    { label: t('create.templates.custom'), value: 'custom' },
  ]
  const template = options.template || await askSelect(t('create.selectTemplate'), templateOptions)

  // Get output directory
  const outputDir = options.outputDir || await askText(t('create.outputDir'), {
    hint: t('create.outputDirHint'),
    defaultValue: '.',
  })

  // Calculate target directory
  const targetDir = path.resolve(process.cwd(), outputDir, name)
  const relativePath = path.relative(process.cwd(), targetDir)

  // Check if directory exists
  if (fs.existsSync(targetDir)) {
    printError(t('errors.directoryExists', { path: relativePath }))
    process.exitCode = 1
    return
  }

  // Show summary and confirm
  console.log('')
  printInfo('Summary:')
  printList([
    `Name: ${styled(name, colors.cyan)}`,
    `Type: ${styled(type || 'basic', colors.cyan)}`,
    `Language: ${styled(language || 'typescript', colors.cyan)}`,
    `UI Framework: ${styled(uiFramework || 'none', colors.cyan)}`,
    `Template: ${styled(template || 'default', colors.cyan)}`,
    `Output: ${styled(relativePath, colors.cyan)}`,
  ])
  console.log('')

  const confirmed = await askConfirm(t('create.confirmCreate'))
  if (!confirmed) {
    printInfo(t('common.cancel'))
    return
  }

  console.log('')

  // Clone template
  try {
    await withSpinner(t('create.cloning'), async () => {
      // Map template to branch if available
      const branchMap: Record<string, string> = {
        default: 'main',
        translation: 'template/translation',
        image: 'template/image',
        custom: 'main',
      }
      const branch = branchMap[template || 'default']
      await cloneTemplate(targetDir, branch)
    })
  }
  catch (error: any) {
    printError(t('create.cloningError', { error: error.message }))
    process.exitCode = 1
    return
  }

  // Configure plugin
  try {
    await withSpinner(t('create.configuring'), async () => {
      await configureManifest(targetDir, {
        name,
        type: type || 'basic',
        language: language || 'typescript',
        uiFramework: uiFramework || 'none',
      })
      await configurePackageJson(targetDir, { name })
      await createSqliteUsageExample(targetDir, (language || 'typescript') as 'typescript' | 'javascript')
    })
  }
  catch (error: any) {
    printError(`Configuration failed: ${error.message}`)
  }

  // Install dependencies (optional)
  if (!options.skipInstall) {
    const shouldInstall = await askConfirm('Install dependencies now?', true)
    if (shouldInstall) {
      try {
        await withSpinner(t('create.installing'), async () => {
          await installDependencies(targetDir)
        })
      }
      catch (error: any) {
        printError(t('create.installingError', { error: error.message }))
        printInfo('You can install dependencies manually later.')
      }
    }
  }

  // Success!
  console.log('')
  printSuccess(t('create.complete', { name }))
  console.log('')
  printInfo(t('create.nextSteps'))
  printList([
    styled(t('create.nextStepCd', { path: relativePath }), colors.cyan),
    styled(t('create.nextStepInstall'), colors.cyan),
    styled(t('create.nextStepDev'), colors.cyan),
  ])
  console.log('')
}
