import fs from 'node:fs'
import { createIndexTemplate, createVueTemplate } from './template.ts'
import '../../config/env.ts'

const cssPreprocessor = process.env.CSS_PREPROCESSOR ?? 'scss'

export function createComponent(componentsPath: string, compName: string) {
  const compRoot = `${componentsPath}/${compName}`

  if (!componentExist(compRoot)) {
    console.log(`${compName}组件存在: ${compRoot}`)
    return
  }

  const dirName = `${compRoot}/src/style`
  const indexTemplate = createIndexTemplate(compName)
  const vueTemplate = createVueTemplate(compName)
  const indexTsName = `${compRoot}/index.ts`
  const vueName = `${compRoot}/src/${compName}.vue`
  const styleName = `${dirName}/index.${cssPreprocessor}`

  insertComponent(`${componentsPath}/components.ts`, compName)

  fs.mkdir(dirName, {
    recursive: true
  }, (err) => {
    if (!err) {
      createFile(indexTsName, indexTemplate)
      createFile(vueName, vueTemplate)
      createFile(styleName, '')
    } else {
      console.log('创建组件失败', err)
    }
  })
  const mainStylePath ='./packages/components/style/index.scss'
  const importStyleContent = `@import url('../src/${compName}/src/style/index.scss');`
  fs.writeFile(mainStylePath, importStyleContent,{ encoding: 'utf8', flag: 'a' }, err => {
    if (err) {
      console.log('全局样式引入局部样式失败')
    } else {
      console.log(`全局样式引入局部样式成功`)
    }
  })
}

function createFile(dir: string, template: string) {
  fs.writeFile(dir, template, (err) => {
    if (!err) {
      console.log(`${dir}文件创建成功`)
    } else {
      console.log(`${dir}文件创建失败`, err)
    }
  })
}

export function componentExist(compRoot: string) {
  if (fs.existsSync(compRoot)) {
    return false
  } else {
    return true
  }
}

function insertComponent(path: string, compName: string) {
  const content = `\nexport * from './${compName}/index';`
  fs.writeFile(path, content,{ encoding: 'utf8', flag: 'a' }, err => {
    if (err) {
      console.log('component注入失败')
    } else {
      console.log(`${path}注入组件成功`)
    }
  })
}