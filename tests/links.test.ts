import { describe, expect, it } from 'vitest'
import { h } from '@satorijs/core'
import { Config } from '../src/config'
import { extractTargets, parseText, trustedPage } from '../src/links'

const defaults = Config.parse({})

describe('链接与分享卡片', () => {
  it('保留 BV 大小写与分 P，并识别相邻 AV 号', () => {
    expect(parseText('https://www.bilibili.com/video/BV17x411w7KC?p=2 【av170001】 BV1xx411c7mD', true)).toEqual([
      { kind: 'video', id: 'BV17x411w7KC', page: 2 },
      { kind: 'video', id: 'av170001', page: 1 },
      { kind: 'video', id: 'BV1xx411c7mD', page: 1 }
    ])
  })
  it('保留所有短链原始域名', () => {
    for (const host of ['b23.tv', 'bili22.cn', 'bili23.cn', 'bili33.cn', 'bili2233.cn']) {
      expect(parseText(`https://${host}/abc123`, false)).toEqual([{ kind: 'short', url: `https://${host}/abc123` }])
    }
  })
  it('支持 HTTP、无协议链接和转义斜杠', () => {
    expect(parseText('http://b23.tv/abc b23.tv/xyz https:\\/\\/b23.tv\\/def', false)).toHaveLength(3)
  })
  it('不把任意域名或路径中的字符串当成 B 站链接', () => {
    for (const text of ['https://evil.example/bilibili.com/video/BV17x411w7KC', 'https://www.bilibili.com.evil.example/video/BV17x411w7KC', 'https://evilbilibili.com/video/BV17x411w7KC', 'https://evil.bilibili.com/video/BV17x411w7KC']) {
      expect(parseText(text, false)).toEqual([])
    }
  })
  it('独立编号需要边界且长度正确', () => {
    expect(parseText('abcBV17x411w7KC BV17x411w7KCx av170001tail av0', true)).toEqual([])
    expect(parseText('BV17x411w7KC', false)).toEqual([])
  })
  it('非法分 P 不隐式降为第一 P', () => {
    for (const page of ['0', '-1', 'a', '1.5', '9007199254740993']) {
      expect(parseText(`https://www.bilibili.com/video/BV17x411w7KC?p=${page}`, false)).toEqual([])
    }
  })
  it('从 JSON 卡片读取链接，去掉同一条消息内重复目标', () => {
    const card = h('json', { data: JSON.stringify({ meta: { detail_1: { qqdocurl: 'https://b23.tv/abc', desc: 'https://b23.tv/abc' } } }) })
    expect(extractTargets([card, h.text('https://b23.tv/abc')], defaults)).toHaveLength(1)
  })
  it('按来源开关独立处理混合消息', () => {
    const elements = [h.text('BV17x411w7KC'), h('json', { data: { url: 'https://b23.tv/abc' } })]
    expect(extractTargets(elements, { parseLinks: false, parseShares: true, parseIds: true })).toEqual([{ kind: 'short', url: 'https://b23.tv/abc' }])
    expect(extractTargets(elements, { parseLinks: true, parseShares: false, parseIds: true })).toEqual([{ kind: 'video', id: 'BV17x411w7KC', page: 1 }])
  })
  it('不解析引用或合并转发，忽略损坏的 JSON', () => {
    const elements = [h('quote', {}, [h.text('BV17x411w7KC')]), h('figure', {}, [h.text('BV17x411w7KC')]), h('json', { data: '{invalid' })]
    expect(extractTargets(elements, defaults)).toEqual([])
  })
  it('从链接元素 href 提取，禁止嵌入凭证和自定义端口', () => {
    expect(extractTargets([h('a', { href: 'https://b23.tv/abc' }, '链接')], defaults)).toHaveLength(1)
    expect(trustedPage(new URL('https://user@b23.tv/abc'))).toBe(false)
    expect(trustedPage(new URL('https://b23.tv:444/abc'))).toBe(false)
  })
})
