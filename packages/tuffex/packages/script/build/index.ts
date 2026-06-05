import { series, dest, src, parallel } from 'gulp'
import type { TaskFunction } from 'gulp'
import gulpSass from 'gulp-sass'
import autoPrefixer from 'gulp-autoprefixer'
import * as sassLang from 'sass'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'path'
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

export const removeDist = () => {
  return delPath(distPath);
}

const sass = gulpSass(sassLang)

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

export const buildStyleEntry = async () => {
  await mkdir(distPath, { recursive: true })
  const baseStyle = await readFile(resolve(distPath, 'es/index.css'), 'utf-8')
  await Promise.all([
    writeFile(resolve(distPath, 'es/base.css'), baseStyle),
    writeFile(resolve(distPath, 'lib/base.css'), baseStyle),
    rm(resolve(distPath, 'es/index.css'), { force: true }),
    rm(resolve(distPath, 'lib/index.css'), { force: true }),
  ])
  await writeFile(resolve(distPath, 'style.css'), '@import "./es/components.css";\n')
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
)

export default build
