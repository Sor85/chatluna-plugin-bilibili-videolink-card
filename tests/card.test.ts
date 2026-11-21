import { afterEach, describe, expect, it } from 'vitest'
import { Context } from 'cordis'
import Takumi, { Config as TakumiConfig } from 'chatluna-plugin-takumi'
import { cardHtml, CardRenderer, escapeHtml, formatDuration, formatNumber, videoUrl } from '../src/card'
import { details, info } from './fixtures'

const hosts: Context[] = []
afterEach(async () => {
  for (const ctx of hosts.splice(0)) await ctx.fiber.dispose()
})

describe('卡片渲染', () => {
  it('格式化统计、时间和分 P URL', () => {
    expect(formatNumber(9999)).toBe('9999')
    expect(formatNumber(12345)).toBe('1.2万')
    expect(formatNumber(123456789)).toBe('1.2亿')
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(videoUrl({ ...info, page: 2 }, 'av')).toContain('/av170001?p=2')
  })
  it('转义所有外部文本并保留时长、在线人数、五项统计、评论与表情', () => {
    expect(escapeHtml('<script>"a" & \'b\'</script>')).toBe('&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;')
    const html = cardHtml({ ...info, title: '<script>alert(1)</script>' }, details, 'sans-serif')
    expect(html).not.toContain('<script>')
    for (const label of ['1:36', '123+ 人正在看', '弹幕', '热门评论', 'Lv.6', '2023-11-15', '06:13:20']) expect(html).toContain(label)
    // 五项统计、在线人数与评论点赞均带图标。
    expect(html.match(/<span class="stat"><img class="icon"/g)).toHaveLength(5)
    expect(html).toContain('<span class="online"><img class="icon"')
    expect(html).toContain('<span class="comment-like"><img class="icon"')
    expect(html).toContain('class="emote"')
    expect(html).not.toContain('cursor:')
  })
  it('Takumi 服务实际生成中文 PNG，图片只经 B 站客户端下载，失败时仍可渲染', async () => {
    const ctx = new Context()
    hosts.push(ctx)
    await ctx.plugin(Takumi, TakumiConfig.parse({}))
    const requested: string[] = []
    const renderer = new CardRenderer(ctx.takumi, {
      image: async (src) => {
        requested.push(src)
        throw new Error('Fixture resource unavailable')
      }
    }, new AbortController().signal)
    const result = await renderer.render(info, details)
    expect(result.subarray(1, 4).toString()).toBe('PNG')
    expect(result.readUInt32BE(16)).toBe(620)
    expect(result.readUInt32BE(20)).toBeGreaterThan(500)
    expect(requested).toContain(info.cover)
  })
})
