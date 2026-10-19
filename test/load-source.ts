import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

export const loadSource = (file: string, globals: Record<string, any>, overrides: Record<string, any> = {}) => {
  const cache = new Map<string, any>()
  const load = (filename: string): any => {
    if (cache.has(filename)) return cache.get(filename)
    const exports = {}
    cache.set(filename, exports)
    const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    runInNewContext(source, {
      console, URL, setTimeout, clearTimeout, ...globals, exports,
      require: (name: string) => name in overrides ? overrides[name] : name.startsWith('.')
        ? load(resolve(dirname(filename), name + '.ts')) : require(name),
    }, { filename })
    return exports
  }
  return load(resolve(file))
}

export const event = () => {
  const listeners = new Set<(...args: any[]) => void>()
  return {
    listeners,
    addListener: (fn: (...args: any[]) => void) => listeners.add(fn),
    removeListener: (fn: (...args: any[]) => void) => listeners.delete(fn),
    emit: (...args: any[]) => { for (const fn of [...listeners]) fn(...args) },
  }
}
