import { series, dest, src, parallel } from 'gulp'
import type { TaskFunction } from 'gulp'
import autoPrefixer from 'gulp-autoprefixer'
import * as sassLang from 'sass'
import { Buffer } from 'node:buffer'
import { Transform } from 'node:stream'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { delPath } from './del.ts'
import run from './run.ts'
import { buildComponentStyles } from './component-styles.ts'
import { fixComponentDeclarations } from './component-declarations.ts'
import '../../../config/env.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const distPath = resolve(__dirname, '../../../dist')
const componentPath =resolve(__dirname, '../../components')
const baseStyleSourcePath = resolve(componentPath, 'style/index.scss')

export const removeDist = () => {
  return delPath(distPath);
}

/**
 * gulp-sass 5.x only speaks Dart Sass's legacy render/renderSync API, which is
 * deprecated and slated for removal in Sass 2.0 — bumping the sass catalog entry
 * past that would break the build outright with "renderSync is not a function".
 * This is the same pipeline stage on the modern compile() API, as a plain stream
 * so no replacement gulp plugin is needed.
 */
function sass() {
  return new Transform({
    objectMode: true,
    transform(file: any, _encoding, done) {
      // Partials are only ever @use'd by an entry file; compiling one directly
      // would emit a stray stylesheet, which gulp-sass also skipped.
      if (file.isNull() || basename(file.path).startsWith('_')) {
        done(null, undefined)
        return
      }

      try {
        const result = sassLang.compile(file.path, { loadPaths: [dirname(file.path)] })
        file.contents = Buffer.from(result.css)
        file.path = file.path.replace(/\.s[ac]ss$/, '.css')
        done(null, file)
      }
      catch (error) {
        done(error as Error)
      }
    },
  })
}

export const buildStyle = () => {
return src(`${componentPath}/src/**/src/style/**/*.scss`)
.pipe(sass())
.pipe(autoPrefixer())
.pipe(dest(`${distPath}/lib`))
.pipe(dest(`${distPath}/es`))
}

export const buildBaseStyle = () => {
  return src(`${componentPath}/style/index.scss`)
    .pipe(sass())
    .pipe(autoPrefixer())
    .pipe(dest(`${distPath}/lib`))
    .pipe(dest(`${distPath}/es`))
}

export const buildComponent = async () => {
  return run("pnpm run build", componentPath);
}

async function readBaseStyle(): Promise<string> {
  const generatedCandidates = [
    resolve(distPath, 'es/index.css'),
    resolve(distPath, 'es/base.css'),
    resolve(distPath, 'lib/index.css'),
    resolve(distPath, 'lib/base.css'),
  ]

  for (const candidate of generatedCandidates) {
    try {
      return await readFile(candidate, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  return sassLang.compile(baseStyleSourcePath).css
}

export const buildStyleEntry = async () => {
  await mkdir(distPath, { recursive: true })
  const baseStyle = await readBaseStyle()
  await Promise.all([
    writeFile(resolve(distPath, 'es/base.css'), baseStyle),
    writeFile(resolve(distPath, 'lib/base.css'), baseStyle),
    rm(resolve(distPath, 'es/index.css'), { force: true }),
    rm(resolve(distPath, 'lib/index.css'), { force: true }),
  ])
  await writeFile(resolve(distPath, 'style.css'), '@import "./es/components.css";\n')
}

/**
 * The package declares `"type": "module"`, so Node parses every `.js` under it as
 * ESM — including `dist/lib`, which the component build emits as CommonJS. Any
 * consumer resolving the `require` condition therefore died on load with
 * "exports is not defined in ES module scope".
 *
 * Scoping the subtree with its own manifest is the fix that does not touch the
 * emitted code: renaming to `.cjs` would also mean rewriting every internal
 * `require('./x.js')` specifier the build produces.
 */
export const writeCjsScopeManifest = async () => {
  await mkdir(resolve(distPath, 'lib'), { recursive: true })
  await writeFile(
    resolve(distPath, 'lib/package.json'),
    `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
  )
}

const build: TaskFunction = series(
  async () => removeDist(),
  parallel(
    async () => buildStyle(),
    async () => buildBaseStyle(),
    async () => buildComponent()
  ),
  async () => fixComponentDeclarations(),
  async () => buildComponentStyles(),
  async () => buildStyleEntry(),
  async () => writeCjsScopeManifest(),
)

export default build
