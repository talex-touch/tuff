import { series, dest, src, parallel } from 'gulp'
import gulpSass from 'gulp-sass'
import autoPrefixer from 'gulp-autoprefixer'
import sassLang from 'sass'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { delPath } from './del.ts'
import run from './run.ts'
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

export const buildComponent = async () => {
  run("pnpm run build", componentPath);
}

export default series(
  async () => removeDist(),
  parallel(
    async () => buildStyle(),
    async () => buildComponent()
  )
)
