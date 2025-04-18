import * as path from 'node:path'

import { REG_POST } from './constants'
import { entryCache } from './entry-cache'
import { stringifyRequest } from './util'

import type * as webpack from 'webpack'

interface PageConfig {
  content: any
  path: string
}

export default function (this: webpack.LoaderContext<any>, source: string) {
  const options = this.getOptions()
  const config = getPageConfig(options.config, this.resourcePath)
  const configString = JSON.stringify(config)
  const stringify = (s: string): string => stringifyRequest(this, s)
  const pageName = options.name
  const {
    isNeedRawLoader,
    importFrameworkStatement,
    mockAppStatement,
    frameworkArgs,
    creator,
    creatorLocation
  } = options.loaderMeta
  const appConfig = options.appConfig
  const frameworkArgsArray = frameworkArgs.split(',')
  frameworkArgsArray.splice(frameworkArgsArray.length - 1, 1, 'appConfig')
  const frameworkArgsCopy = frameworkArgsArray.join(',')
  // raw is a placeholder loader to locate changed .vue resource
  const entryCacheLoader = path.join(__dirname, 'entry-cache.js') + `?name=${pageName}`
  entryCache.set(pageName, source)
  const raw = path.join(__dirname, 'raw.js')
  const componentPath = isNeedRawLoader
    ? ['!', raw, entryCacheLoader, this.resourcePath].join('!')
    : ['!', entryCacheLoader, this.resourcePath].join('!')
  const runtimePath = Array.isArray(options.runtimePath) ? options.runtimePath : [options.runtimePath]
  const behaviorsName = options.behaviorsName
  let setReconcilerPost = ''
  const setReconciler = runtimePath.reduce((res, item) => {
    if (REG_POST.test(item)) {
      setReconcilerPost += `import '${item.replace(REG_POST, '')}'\n`
      return res
    } else {
      return res + `import '${item}'\n`
    }
  }, '')
  const { globalObject } = this._compilation?.outputOptions || { globalObject: 'wx' }

  const prerender = `
if (typeof PRERENDER !== 'undefined') {
  ${globalObject}._prerender = inst
}`
  return `${setReconciler}
import { createPageConfig, window } from '@tarojs/runtime'
import { ${creator} } from '${creatorLocation}'
${setReconcilerPost}
${importFrameworkStatement}
var config = ${configString};
var appConfig = ${JSON.stringify(appConfig)};
window.__taroAppConfig = appConfig
${mockAppStatement}
${creator}(App, ${frameworkArgsCopy})
var component = require(${stringify(componentPath)}).default
${config.enableShareTimeline ? 'component.enableShareTimeline = true' : ''}
${config.enableShareAppMessage ? 'component.enableShareAppMessage = true' : ''}
var taroOption = createPageConfig(component, '${pageName}', {}, config || {})
if (component && component.behaviors) {
  taroOption.${behaviorsName} = (taroOption.${behaviorsName} || []).concat(component.behaviors)
}
var inst = Page(taroOption)
${options.prerender ? prerender : ''}
export default component
`
}

function getPageConfig (configs: Record<string, PageConfig>, resourcePath: string) {
  const configPath = removeExt(resourcePath) + '.config'
  for (const name in configs) {
    const config = configs[name]
    if (removeExt(configs[name].path) === configPath) {
      return config.content
    }
  }
  return {}
}

function removeExt (file: string) {
  return path.join(path.dirname(file), path.basename(file, path.extname(file)))
}
