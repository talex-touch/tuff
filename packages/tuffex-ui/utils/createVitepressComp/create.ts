import fs from 'node:fs'

export function createVitepressComp(compName: string) {

  const dir = `./docs/components/${compName}.md`
  const template = `---
sider_text="侧边栏名称"
---`

  fs.writeFile(dir, template, (err) => {
    if (!err) {
      console.log(`${dir}文件创建成功`)
    } else {
      console.log(`${dir}文件创建失败`, err)
    }
  })
}