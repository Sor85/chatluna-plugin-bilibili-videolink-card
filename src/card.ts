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
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' })
const timeFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
// Filled glyphs match the original card's B 站 style; each is tinted via the injected fill.
const icons = {
  play: '<svg viewBox="0 0 16 16"><path d="M4 3.5v9l9-4.5z"/></svg>',
  online: '<svg viewBox="0 0 24 24"><path d="M12 5c5.5 0 9.3 5.1 9.5 5.3.4.4.4 1 0 1.4C21.3 11.9 17.5 17 12 17S2.7 11.9 2.5 11.7a1 1 0 0 1 0-1.4C2.7 10.1 6.5 5 12 5Zm0 2c-3.6 0-6.5 2.9-7.4 4 .9 1.1 3.8 4 7.4 4s6.5-2.9 7.4-4c-.9-1.1-3.8-4-7.4-4Zm0 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"/></svg>',
  like: '<svg viewBox="0 0 24 24"><path d="M13.9252 3.04546C13.6432 3.01258 13.382 3.13521 13.2422 3.29868C12.9774 3.60848 12.8705 3.86276 12.7384 4.23799C12.7234 4.28037 12.7082 4.32422 12.6925 4.36961C12.5611 4.74857 12.3929 5.23391 12.044 5.85187C11.446 6.91117 10.8882 7.55173 10.2013 8.154C9.63865 8.6473 9.06639 8.98294 8.5 9.14275V19.7248C9.28689 19.7417 10.1287 19.7525 11 19.7525C13.2468 19.7525 15.1529 19.6812 16.4372 19.615C17.3477 19.5681 18.1379 19.1176 18.5497 18.3851C19.1274 17.3574 19.8396 15.8503 20.2712 14.0753C20.6734 12.4212 20.8569 11.0615 20.9392 10.1025C20.9774 9.65797 20.6256 9.25003 20.08 9.25003H15.0977C14.8476 9.25003 14.614 9.12542 14.4748 8.91775C14.3355 8.71015 14.3089 8.44684 14.4037 8.21557L14.4046 8.21341L14.4085 8.20377L14.4249 8.16256C14.4395 8.12573 14.4609 8.07081 14.4874 8.00089C14.5404 7.86084 14.6131 7.66185 14.6909 7.42856C14.8489 6.95439 15.0177 6.36917 15.0941 5.85681C15.2109 5.07451 15.1824 4.44592 14.8757 3.86439C14.5461 3.23954 14.1724 3.07429 13.9252 3.04546ZM16.164 7.75003H20.08C21.4037 7.75003 22.5555 8.81291 22.4337 10.2309C22.3455 11.2583 22.1508 12.6941 21.7288 14.4297C21.2555 16.3758 20.4798 18.0127 19.8573 19.1201C19.1594 20.3616 17.8654 21.0435 16.5144 21.113C15.21 21.1802 13.2777 21.2525 11 21.2525C8.7933 21.2525 6.77664 21.1846 5.34776 21.1195C3.73985 21.0461 2.39101 19.8517 2.21798 18.2152C2.1042 17.1391 2 15.7467 2 14.2525C2 12.8835 2.08746 11.6418 2.18985 10.6567C2.36874 8.93544 3.84615 7.75003 5.50754 7.75003H7.75C8.06896 7.75003 8.56382 7.59478 9.21241 7.02612C9.77509 6.53279 10.2246 6.0235 10.7378 5.11442C11.0177 4.61868 11.146 4.24973 11.2753 3.87788C11.2913 3.83198 11.3072 3.78604 11.3235 3.73981C11.4791 3.29802 11.6602 2.84083 12.1021 2.32398C12.5582 1.79047 13.3077 1.4633 14.0989 1.55555C14.9248 1.65186 15.6866 2.18668 16.2024 3.16456C16.7233 4.15177 16.5199 5.21045 16.3262 6.09633C16.2307 6.53324 16.1766 6.98591 16.164 7.75003Z"/></svg>',
  coin: '<svg viewBox="0 0 28 28"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.045 25.5454C7.69377 25.5454 2.54504 20.3967 2.54504 14.0454C2.54504 7.69413 7.69377 2.54541 14.045 2.54541C20.3963 2.54541 25.545 7.69413 25.545 14.0454C25.545 17.0954 24.3334 20.0205 22.1768 22.1771C20.0201 24.3338 17.095 25.5454 14.045 25.5454ZM9.66202 6.81624H18.2761C18.825 6.81624 19.27 7.22183 19.27 7.72216C19.27 8.22248 18.825 8.62807 18.2761 8.62807H14.95V10.2903C17.989 10.4444 20.3766 12.9487 20.3855 15.9916V17.1995C20.3854 17.6997 19.9799 18.1052 19.4796 18.1052C18.9793 18.1052 18.5738 17.6997 18.5737 17.1995V15.9916C18.5667 13.9478 16.9882 12.2535 14.95 12.1022V20.5574C14.95 21.0577 14.5444 21.4633 14.0441 21.4633C13.5437 21.4633 13.1382 21.0577 13.1382 20.5574V12.1022C11.1 12.2535 9.52148 13.9478 9.51448 15.9916V17.1995C9.5144 17.6997 9.10883 18.1052 8.60856 18.1052C8.1083 18.1052 7.70273 17.6997 7.70265 17.1995V15.9916C7.71158 12.9487 10.0992 10.4444 13.1382 10.2903V8.62807H9.66202C9.11309 8.62807 8.66809 8.22248 8.66809 7.72216C8.66809 7.22183 9.11309 6.81624 9.66202 6.81624Z"/></svg>',
  star: '<svg viewBox="0 0 28 28"><path d="M19.8071 9.26152C18.7438 9.09915 17.7624 8.36846 17.3534 7.39421L15.4723 3.4972C14.8998 2.1982 13.1004 2.1982 12.4461 3.4972L10.6468 7.39421C10.1561 8.36846 9.25639 9.09915 8.19315 9.26152L3.94016 9.91102C2.63155 10.0734 2.05904 11.6972 3.04049 12.6714L6.23023 15.9189C6.96632 16.6496 7.29348 17.705 7.1299 18.7605L6.39381 23.307C6.14844 24.6872 7.62063 25.6614 8.84745 25.0119L12.4461 23.0634C13.4276 22.4951 14.6544 22.4951 15.6359 23.0634L19.2345 25.0119C20.4614 25.6614 21.8518 24.6872 21.6882 23.307L20.8703 18.7605C20.7051 17.705 21.0339 16.6496 21.77 15.9189L24.9597 12.6714C25.9412 11.6972 25.3687 10.0734 24.06 9.91102L19.8071 9.26152Z"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12.5 4.2c-.7-.5-1.7 0-1.7.9v3.4C6.2 9 3.1 12.2 2.1 17.2c-.2 1 .9 1.6 1.6.8 1.8-2.2 4.2-3.4 7.1-3.7v3.4c0 .9 1 1.4 1.7.8l8.4-6.4c.6-.5.6-1.4 0-1.9z"/></svg>'
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function clipped(value: string, length: number): string {
  const chars = Array.from(value)
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : value
}

export function formatNumber(value: number): string {
  if (value < 10000) return String(value)
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

function icon(name: keyof typeof icons): string {
  const svg = icons[name].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="#61666d" ')
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

export function cardHtml(info: VideoInfo, details: CardDetails, fontFamily: string): string {
  const stats: [keyof typeof icons, number][] = [
    ['play', info.stat.view], ['like', info.stat.like], ['coin', info.stat.coin], ['star', info.stat.favorite], ['share', info.stat.share]
  ]
  const comments = details.comments.map((comment) => `
    <article class="comment">
      <img class="avatar" src="${escapeHtml(comment.avatar)}" />
      <div class="comment-body">
        <div class="comment-user">${escapeHtml(clipped(comment.name, 36))}${comment.level === undefined ? '' : `<span class="level">Lv.${comment.level}</span>`}</div>
        <p>${commentMessage(comment.message, comment.emotes)}</p>
        <small><span>${dateFormat.format(comment.published * 1000)}</span><span class="comment-time">${timeFormat.format(comment.published * 1000)}</span><span class="comment-like">${icon('like')} ${formatNumber(comment.likes)}</span></small>
      </div>
    </article>`).join('')
  return `<style>
* { box-sizing: border-box; }
.card { width: 620px; overflow: hidden; border-radius: 20px; color: #18191c; background: #fff; font-family: ${fontFamily}, sans-serif; font-size: 16px; line-height: 1.5; }
.cover { position: relative; aspect-ratio: 16 / 9; background: #f1f2f3; }
.cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-meta { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: flex-end; padding: 28px 16px 12px; color: #fff; font-size: 15px; background: linear-gradient(transparent, rgba(0, 0, 0, .68)); }
.main { padding: 22px 24px 28px; }
.title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
h1 { flex: 1; min-width: 0; margin: 0; font-size: 25px; line-height: 1.38; font-weight: 750; word-break: break-word; }
.online { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 5px; margin-top: 9px; color: #9499a0; font-size: 15px; white-space: nowrap; }
.part { margin-top: 8px; color: #61666d; }
.icon { width: 16px; height: 16px; object-fit: contain; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.tags span { padding: 5px 9px; border-radius: 6px; color: #61666d; background: #f1f2f3; font-size: 14px; }
.stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.stat { display: inline-flex; align-items: center; gap: 5px; padding: 7px 11px; border-radius: 18px; color: #61666d; background: #f1f2f3; font-size: 15px; }
.stat .icon { display: block; flex: 0 0 16px; }
.owner { display: flex; align-items: center; gap: 12px; margin-top: 20px; }
.owner-name { font-size: 20px; font-weight: 700; }
.publish-date { margin-top: 4px; color: #9499a0; font-size: 14px; }
.avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; background: #f1f2f3; flex-shrink: 0; }
.desc { margin-top: 20px; padding: 14px 16px; border-radius: 12px; color: #61666d; background: #f6f7f8; font-size: 16px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
section { margin-top: 24px; }
h2 { margin: 0 0 12px; font-size: 22px; }
.section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
.section-title > span { color: #9499a0; font-size: 15px; }
.danmaku { display: flex; flex-wrap: wrap; gap: 8px; }
.danmaku span { padding: 8px 11px; border-radius: 8px; color: #61666d; background: #f1f2f3; font-size: 15px; }
.comment { display: flex; gap: 12px; margin-top: 16px; }
.comment-body { flex: 1; min-width: 0; }
.comment-user { display: flex; align-items: center; gap: 6px; color: #61666d; font-size: 16px; }
.level { padding: 2px 6px; border-radius: 4px; color: #4190d9; background: #e8f3ff; font-size: 12px; font-weight: 600; }
.comment p { margin: 5px 0 8px; font-size: 17px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; }
.emote { display: inline-block; width: 24px; height: 24px; object-fit: contain; vertical-align: -6px; }
.comment small { display: flex; align-items: center; color: #9499a0; font-size: 14px; }
.comment-time { margin-left: 8px; }
.comment-like { display: inline-flex; align-items: center; gap: 4px; margin-left: 16px; }
.comment-like .icon { width: 14px; height: 14px; }
.empty { margin: 0; color: #9499a0; font-size: 16px; }
</style>
<main class="card">
  <div class="cover"><img src="${escapeHtml(info.cover)}" /><div class="cover-meta"><span>${formatDuration(info.duration)}</span></div></div>
  <div class="main">
    <div class="title-row"><h1>${escapeHtml(clipped(info.title, 200))}</h1>${details.online ? `<span class="online">${icon('online')} ${escapeHtml(details.online)} 人正在看</span>` : ''}</div>
    ${info.part ? `<div class="part">P${info.page} · ${escapeHtml(clipped(info.part, 100))}</div>` : ''}
    ${details.tags.length ? `<div class="tags">${details.tags.map((tag) => `<span>${escapeHtml(clipped(tag, 30))}</span>`).join('')}</div>` : ''}
    <div class="stats">${stats.map(([name, value]) => `<span class="stat">${icon(name)} ${formatNumber(value)}</span>`).join('')}</div>
    <div class="owner"><img class="avatar" src="${escapeHtml(info.owner.avatar)}" /><div><div class="owner-name">${escapeHtml(clipped(info.owner.name, 40))}</div><div class="publish-date">${dateFormat.format(info.published * 1000)} 发布</div></div></div>
    <div class="desc">${escapeHtml(clipped(info.description || '暂无简介', 1000))}</div>
    ${details.danmaku.length ? `<section><h2>弹幕</h2><div class="danmaku">${details.danmaku.map((item) => `<span>${escapeHtml(clipped(item, 100))}</span>`).join('')}</div></section>` : ''}
    <section><div class="section-title"><h2>热门评论</h2><span>${formatNumber(info.stat.reply)} 条评论</span></div>${comments || '<p class="empty">暂无可用热门评论</p>'}</section>
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

  async render(info: VideoInfo, details: CardDetails): Promise<Buffer> {
    this.signal.throwIfAborted()
    const { renderer, fontFamily } = this.getEngine()
    const parsed = fromHtml(cardHtml(info, details, fontFamily))
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
