import { h } from '@satorijs/core'
import { isPlainObject } from '@chatluna/utils'
import type { Config } from './config'
import type { Target, VideoTarget } from './types'

const shortHosts = new Set(['b23.tv', 'bili22.cn', 'bili23.cn', 'bili33.cn', 'bili2233.cn'])
const videoHosts = new Set(['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'])

export function trustedPage(url: URL): boolean {
  return url.protocol === 'https:' && !url.username && !url.password && !url.port
    && (videoHosts.has(url.hostname) || shortHosts.has(url.hostname))
}

export function videoTarget(url: URL): VideoTarget | undefined {
  if (!trustedPage(url) || !videoHosts.has(url.hostname)) return
  const match = /^\/video\/(BV[0-9A-Za-z]{10}|av[1-9]\d*)(?:\/|$)/i.exec(url.pathname)
  if (!match) return
  const rawPage = url.searchParams.get('p') ?? '1'
  const page = Number(rawPage)
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page < 1) return
  const id = match[1].slice(0, 2).toLowerCase() === 'av' ? `av${match[1].slice(2)}` : `BV${match[1].slice(2)}`
  return { kind: 'video', id, page }
}

export function targetKey(target: Target): string {
  return target.kind === 'short' ? target.url : `${target.id}:${target.page}`
}

export function parseText(text: string, parseIds: boolean): Target[] {
  const result: Target[] = []
  const urls = /(?<![\w.@/:-])(?:https?:\/\/)?(?:[\w-]+\.)*(?:bilibili\.com|b23\.tv|bili(?:22|23|33|2233)\.cn)\/[A-Za-z0-9/?=&_%#.+~-]+/gi
  const withoutUrls = text.replace(/\\\//g, '/').replace(urls, (raw) => {
    let url: URL
    try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`) } catch { return '' }
    if (url.protocol === 'http:') url.protocol = 'https:'
    if (!trustedPage(url)) return ''
    const video = videoTarget(url)
    if (video) result.push(video)
    else if (shortHosts.has(url.hostname) && /^\/[\w-]+\/?$/.test(url.pathname)) {
      result.push({ kind: 'short', url: url.href })
    }
    return ''
  })
  if (parseIds) {
    for (const match of withoutUrls.matchAll(/(?<![\w/])(?:BV[0-9A-Za-z]{10}|av[1-9]\d*)(?![\w])/gi)) {
      const target = videoTarget(new URL(`https://www.bilibili.com/video/${match[0]}`))
      if (target) result.push(target)
    }
  }
  return result
}

export function extractTargets(elements: h[], config: Pick<Config, 'parseLinks' | 'parseShares' | 'parseIds'>): Target[] {
  const targets: Target[] = []
  function shareStrings(value: unknown, depth = 0): void {
    if (depth > 10) return
    if (typeof value === 'string') targets.push(...parseText(value, false))
    else if (Array.isArray(value)) value.slice(0, 64).forEach((item) => shareStrings(item, depth + 1))
    else if (isPlainObject(value)) Object.values(value).slice(0, 64).forEach((item) => shareStrings(item, depth + 1))
  }
  function visit(items: h[]): void {
    for (const element of items) {
      if (['quote', 'figure', 'message', 'forward'].includes(element.type)) continue
      if (element.type === 'json') {
        if (!config.parseShares) continue
        const data: unknown = element.attrs['data']
        try { shareStrings(typeof data === 'string' ? JSON.parse(data) : data) } catch { /* Invalid shares are not video links. */ }
      } else if (element.type === 'text' && config.parseLinks) {
        const content: unknown = element.attrs['content']
        if (typeof content === 'string') targets.push(...parseText(content, config.parseIds))
      } else if (element.type === 'a' && config.parseLinks) {
        const href: unknown = element.attrs['href']
        if (typeof href === 'string') targets.push(...parseText(href, false))
        visit(element.children)
      } else {
        visit(element.children)
      }
    }
  }
  visit(elements)
  return [...new Map(targets.map((target) => [targetKey(target), target])).values()]
}
