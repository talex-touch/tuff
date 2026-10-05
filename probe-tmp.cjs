const MODULE=require('node:module'),fs=require('node:fs'),path=require('node:path')
const P=require('node:path').resolve(__dirname,'plugins/touch-browser-open/index.js')
const state={features:new Map()}
globalThis.TuffItemBuilder=class{constructor(){}setSource(){return this}setTitle(){return this}setSubtitle(){return this}setIcon(){return this}setMeta(){return this}createAndAddAction(){return this}build(){return{}}}
globalThis.platform={platform:'darwin'}
globalThis.logger={error(){},warn(){}}
globalThis.features={getFeatures:async()=>[],getFeature:async()=>null,addFeature:async f=>{state.features.set(f.id,f);return true},removeFeature:async()=>true}
globalThis.plugin={feature:{clearItems:async()=>{},pushItems:async()=>{}},storage:{getFile:async()=>null,setFile:async()=>{}},browser:{list:async()=>({status:'available',defaultAvailable:true,browsers:[{id:'chrome',name:'Chrome',token:'bo_'+'A'.repeat(32)}]}),open:async()=>({status:'completed'})}}
const mod=new MODULE(P); mod.filename=P; mod.paths=MODULE._nodeModulePaths(path.dirname(P)); mod._compile(fs.readFileSync(P,'utf8'),P)
const api=mod.exports
api.onInit().then(()=>{
  const link=state.features.get('browser-direct-default')
  const search=state.features.get('search-open-google')
  const linkRe=new RegExp(link.commands[0].value)
  const searchRe=new RegExp(search.commands[0].value)
  for (const t of ['example.com','example.com/docs','www.example.com/a?b=1','https://example.com/a','README.md','readme.md','notes.txt','hello world','~/Workspace','/tmp/x','google foo'])
    console.log('link', JSON.stringify(t), linkRe.test(t), 'search', searchRe.test(t))
  console.log('LINK PATTERN', link.commands[0].value)
})
