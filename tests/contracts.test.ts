import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Config } from '../src/config'
import zh from '../client/locales/zh.yml'
import en from '../client/locales/en.yml'

const root = resolve(import.meta.dirname, '..')

describe('配置和项目规范', () => {
  it('默认保留卡片和视频，参数有界且输出类型严格', () => {
    const config = Config.parse({})
    expect(config.outputs).toEqual(['card', 'video'])
    expect(config.cooldown).toBe(180)
    for (const input of [{ outputs: ['unknown'] }, { parseLimit: 0 }, { maxFileSize: 0 }, { bufferDelay: 31 }, { queueLimit: 0 }]) {
      expect(() => Config.parse(input)).toThrow()
    }
  })
  it('解析来源为独立开关，网页链接编号随附带链接出现', () => {
    const config = Config.parse({})
    expect([config.parseLinks, config.parseShares, config.parseIds]).toEqual([true, true, true])
    expect(config).not.toHaveProperty('idPreference')
    const linked = Config.parse({ showLink: true })
    expect(linked.idPreference).toBe('bv')
    expect(Config.parse({ filterAction: 'silent' }).shortTip).toBe('视频时长低于解析下限')
  })
  it('每份子目录说明已登记且登记路径都存在', () => {
    const rootText = readFileSync(resolve(root, 'AGENTS.md'), 'utf8')
    const found: string[] = []
    function walk(directory: string) {
      for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
        if (['node_modules', 'lib', 'dist', '.git'].includes(entry.name)) continue
        const relative = directory ? `${directory}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(relative)
        else if (entry.name === 'AGENTS.md' && directory) found.push(relative)
      }
    }
    walk('')
    for (const file of found) expect(rootText).toContain(`\`${file}\``)
    for (const match of rootText.matchAll(/`([^`]+\/AGENTS\.md)`/g)) expect(existsSync(resolve(root, match[1]))).toBe(true)
  })
  it('输出控件使用宿主支持的扁平翻译键，中英文均有完整文案', () => {
    const keys = ['card', 'link', 'log', 'video'].flatMap((output) => [`${output}.description`, `${output}.title`])
    for (const dict of [zh, en]) {
      expect(Object.keys(dict).sort()).toEqual(keys)
      for (const key of keys) {
        expect(typeof dict[key]).toBe('string')
        expect(dict[key].trim()).not.toBe('')
      }
    }
  })
  it('输出选项按控件实际使用的键读取中文标题和说明', () => {
    expect(['card', 'video', 'link', 'log'].map((output) => zh[`${output}.title`])).toEqual([
      '图片卡片', '视频', '视频直链', '解析日志'
    ])
    expect(zh['card.description']).toContain('弹幕与热门评论')
    expect(zh['video.description']).toContain('单段 MP4')
    expect(zh['link.description']).toContain('有效期')
    expect(zh['log.description']).toContain('不记录签名直链')
  })
})
