import { createRequire } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { h } from '@satorijs/core'
import { extractResourceUrls, type ImageSource, type Node, Renderer } from '@takumi-rs/core'
import { fromHtml } from '@takumi-rs/helpers/html'
import { extractEmojis } from '@takumi-rs/helpers/emoji'
import type { Config } from './config'
import type { BilibiliClient } from './network'
import type { CardDetails, Log, VideoInfo } from './types'

const missingImage = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f1f2f3"/></svg>')
const dateFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
})

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function clipped(value: string, length: number): string {
  const chars = Array.from(value)
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : value
}

export function formatNumber(value: number, compact: boolean): string {
  if (!compact || value < 10000) return String(value)
  return value < 100000000 ? `${(value / 10000).toFixed(1)}万` : `${(value / 100000000).toFixed(1)}亿`
}

export function formatDuration(value: number): string {
  const seconds = Math.floor(Math.max(0, value))
  const minutes = Math.floor(seconds / 60)
  return minutes < 60
    ? `${minutes}:${String(seconds % 60).padStart(2, '0')}`
    : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function videoUrl(info: VideoInfo, preference: Config['idPreference']): string {
  return `https://www.bilibili.com/video/${preference === 'av' ? `av${info.aid}` : info.bvid}${info.page > 1 ? `?p=${info.page}` : ''}`
}

function icon(path: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#61666d" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`
  return `<img class="icon" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" />`
}

function commentMessage(message: string, emotes: Record<string, { url: string }>): string {
  const names = Object.keys(emotes)
  if (names.length === 0) return escapeHtml(clipped(message, 500))
  const pattern = new RegExp(`(${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g')
  return clipped(message, 500).split(pattern).map((part) => {
    const emote = emotes[part]
    return emote ? `<img class="emote" src="${escapeHtml(emote.url)}" />` : escapeHtml(part)
  }).join('')
}

export function cardHtml(info: VideoInfo, details: CardDetails, config: Pick<Config, 'formatNumbers'>, fontFamily: string): string {
  const number = (value: number) => formatNumber(value, config.formatNumbers)
  const stats: [string, number, string][] = [
    ['播放', info.stat.view, '<path d="m9 5 10 7-10 7z"/>'],
    ['点赞', info.stat.like, '<path d="M7 10v11H3V10zm0 0 5-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7"/>'],
    ['投币', info.stat.coin, '<circle cx="12" cy="12" r="9"/><path d="M8 8h8m-4 0v9m-4-2v-2a4 4 0 0 1 8 0v2"/>'],
    ['收藏', info.stat.favorite, '<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>'],
    ['分享', info.stat.share, '<path d="m14 4 7 7-7 7v-5C8 13 5 15 3 19c0-9 5-12 11-12z"/>']
  ]
  const comments = details.comments.map((comment) => `
    <article class="comment">
      <img class="avatar" src="${escapeHtml(comment.avatar)}" />
      <div class="comment-body">
        <div class="comment-user">${escapeHtml(clipped(comment.name, 36))}${comment.level === undefined ? '' : `<span class="level">Lv.${comment.level}</span>`}</div>
        <p>${commentMessage(comment.message, comment.emotes)}</p>
        <small>${dateFormat.format(comment.published * 1000)} · ${number(comment.likes)} 赞</small>
      </div>
    </article>`).join('')
  return `<style>
* { box-sizing: border-box; }
.card { width: 620px; overflow: hidden; border-radius: 20px; color: #18191c; background: #fff; font-family: ${fontFamily}, sans-serif; font-size: 16px; line-height: 1.5; }
.cover { position: relative; height: 349px; background: #f1f2f3; }
.cover img { width: 620px; height: 349px; object-fit: cover; }
.cover-meta { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: flex-end; padding: 28px 16px 12px; color: #fff; font-size: 15px; background: linear-gradient(transparent, rgba(0,0,0,.68)); }
.main { padding: 22px 24px 28px; }
h1 { margin: 0; font-size: 25px; line-height: 1.38; font-weight: 750; word-break: break-word; }
.part { margin-top: 8px; color: #61666d; }
.online { margin-top: 8px; color: #61666d; font-size: 14px; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.tags span { padding: 5px 9px; border-radius: 6px; color: #61666d; background: #f1f2f3; font-size: 14px; }
.stats { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
.stat { display: flex; align-items: center; gap: 5px; padding: 7px 9px; border-radius: 18px; color: #61666d; background: #f1f2f3; font-size: 14px; }
.icon { width: 18px; height: 18px; }
.owner { display: flex; align-items: center; gap: 12px; margin-top: 20px; }
.owner-name { font-size: 20px; font-weight: 700; }
.publish-date { margin-top: 4px; color: #61666d; font-size: 14px; }
.avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #f1f2f3; flex-shrink: 0; }
.desc { margin-top: 20px; padding: 14px 16px; border-radius: 12px; color: #61666d; background: #f6f7f8; font-size: 16px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
section { margin-top: 24px; }
h2 { margin: 0 0 12px; font-size: 22px; }
.section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.section-title span { color: #61666d; font-size: 14px; }
.danmaku { display: flex; flex-wrap: wrap; gap: 8px; }
.danmaku span { padding: 8px 11px; border-radius: 8px; color: #61666d; background: #f1f2f3; font-size: 15px; }
.comment { display: flex; gap: 12px; margin-top: 16px; }
.comment-body { flex: 1; min-width: 0; }
.comment-user { display: flex; align-items: center; gap: 6px; color: #61666d; font-size: 16px; }
.level { padding: 2px 6px; border-radius: 4px; color: #356ba4; background: #e8f3ff; font-size: 12px; }
.comment p { margin: 5px 0 8px; font-size: 17px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.emote { display: inline-block; width: 24px; height: 24px; object-fit: contain; vertical-align: -6px; }
.comment small, .empty { color: #61666d; font-size: 14px; }
</style>
<main class="card">
  <div class="cover"><img src="${escapeHtml(info.cover)}" /><div class="cover-meta">${formatDuration(info.duration)}</div></div>
  <div class="main">
    <h1>${escapeHtml(clipped(info.title, 200))}</h1>
    ${info.part ? `<div class="part">P${info.page} · ${escapeHtml(clipped(info.part, 100))}</div>` : ''}
    ${details.online ? `<div class="online">${escapeHtml(details.online)} 人正在看</div>` : ''}
    ${details.tags.length ? `<div class="tags">${details.tags.map((tag) => `<span>${escapeHtml(clipped(tag, 30))}</span>`).join('')}</div>` : ''}
    <div class="stats">${stats.map(([label, value, path]) => `<span class="stat">${icon(path)}${label} ${number(value)}</span>`).join('')}</div>
    <div class="owner"><img class="avatar" src="${escapeHtml(info.owner.avatar)}" /><div><div class="owner-name">${escapeHtml(clipped(info.owner.name, 40))}</div><div class="publish-date">${dateFormat.format(info.published * 1000)} 发布</div></div></div>
    <div class="desc">${escapeHtml(clipped(info.description || '暂无简介', 1000))}</div>
    ${details.danmaku.length ? `<section><h2>弹幕</h2><div class="danmaku">${details.danmaku.map((item) => `<span>${escapeHtml(clipped(item, 100))}</span>`).join('')}</div></section>` : ''}
    <section><div class="section-title"><h2>热门评论</h2><span>${number(info.stat.reply)} 条评论</span></div>${comments || '<p class="empty">暂无可用热门评论</p>'}</section>
  </div>
</main>`
}

export function decodeCardNode(node: Node): Node {
  // fromHtml preserves entities. Decode the parsed tree, never raw HTML, so text cannot become markup.
  if (node.type === 'text') return { ...node, text: h.unescape(node.text) }
  if (node.type === 'image') return { ...node, src: typeof node.src === 'string' ? h.unescape(node.src) : node.src }
  return { ...node, children: node.children?.map((child) => child ? decodeCardNode(child) : child) }
}

export class CardRenderer {
  private engine?: { renderer: Renderer; fontFamily: string }

  constructor(private client: Pick<BilibiliClient, 'image'>, private logger: Log, private signal: AbortSignal) {}

  private getEngine() {
    if (this.engine) return this.engine
    const require = createRequire(import.meta.url)
    const fonts = ['@fontsource-variable/noto-sans-sc', '@fontsource-variable/noto-sans-kr', '@fontsource/dejavu-sans'].flatMap((pkg, i) => {
      const directory = resolve(dirname(require.resolve(`${pkg}/package.json`)), 'files')
      return readdirSync(directory).filter((name) => name.endsWith('.woff2')).sort().map((name, j) => ({
        name: `CardFont${i}_${j}`, data: readFileSync(resolve(directory, name))
      }))
    })
    return this.engine = { renderer: new Renderer({ fonts, loadDefaultFonts: true }), fontFamily: fonts.map((font) => `'${font.name}'`).join(',') }
  }

  async render(info: VideoInfo, details: CardDetails, config: Pick<Config, 'formatNumbers'>): Promise<Buffer> {
    this.signal.throwIfAborted()
    const { renderer, fontFamily } = this.getEngine()
    const parsed = fromHtml(cardHtml(info, details, config, fontFamily))
    const node = extractEmojis(decodeCardNode(parsed.node), 'twemoji')
    const urls = [...new Set(extractResourceUrls(node))]
    const fetchedResources: ImageSource[] = []
    for (let i = 0; i < urls.length; i += 4) {
      await Promise.all(urls.slice(i, i + 4).map(async (src) => {
        if (src.startsWith('data:')) return
        try { fetchedResources.push({ src, data: await this.client.image(src) }) } catch {
          this.signal.throwIfAborted()
          this.logger.debug('Card image unavailable')
          fetchedResources.push({ src, data: missingImage })
        }
      }))
    }
    this.signal.throwIfAborted()
    return renderer.render(node, { width: 620, format: 'png', stylesheets: parsed.stylesheets, fetchedResources }, this.signal)
  }
}
