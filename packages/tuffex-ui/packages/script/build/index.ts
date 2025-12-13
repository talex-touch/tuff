import { series, dest, src, parallel } from 'gulp'
import gulpSass from 'gulp-sass'
import autoPrefixer from 'gulp-autoprefixer'
import sassLang from 'sass'
import less from 'gulp-less'
import { resolve } from 'path'
import { delPath } from './del'
import run from './run'
import '../../../config/env.ts'

const distPath = resolve(__dirname, '../../../dist')
const componentPath =resolve(__dirname, '../../components')

export const removeDist = () => {
  return delPath(distPath);
}

const sass = gulpSass(sassLang)

function cssType() {
  const CSS_PREPROCESSOR = process.env.CSS_PREPROCESSOR ?? 'scss'
  if (CSS_PREPROCESSOR === 'scss') {
    return sass
  } else {
    return less
  }
}

export const buildStyle = () => {
return src(`${componentPath}/src/**/src/style/**`)
.pipe(cssType()())
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
