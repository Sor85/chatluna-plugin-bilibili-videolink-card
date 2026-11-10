import { describe, expect, it } from 'vitest'
import { cardHtml, CardRenderer, decodeCardNode, escapeHtml, formatDuration, formatNumber, videoUrl } from '../src/card'
import { details, info, logger } from './fixtures'

describe('卡片渲染', () => {
  it('格式化统计、时间和分 P URL', () => {
    expect(formatNumber(12345, true)).toBe('1.2万')
    expect(formatNumber(123456789, true)).toBe('1.2亿')
    expect(formatNumber(12345, false)).toBe('12345')
    expect(formatDuration(3661)).toBe('1:01:01')
    expect(videoUrl({ ...info, page: 2 }, 'av')).toContain('/av170001?p=2')
  })
  it('转义所有外部文本并保留时长、在线人数、五项统计、评论与表情', () => {
    expect(escapeHtml('<script>"a" & \'b\'</script>')).toBe('&lt;script&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/script&gt;')
    const html = cardHtml({ ...info, title: '<script>alert(1)</script>' }, details, { formatNumbers: true }, 'sans-serif')
    expect(html).not.toContain('<script>')
    for (const label of ['1:36', '123+ 人正在看', '弹幕', '热门评论', 'Lv.6', '2023-11-15', '06:13:20']) expect(html).toContain(label)
    // 五项统计、在线人数与评论点赞均带图标。
    expect(html.match(/<span class="stat"><img class="icon"/g)).toHaveLength(5)
    expect(html).toContain('<span class="online"><img class="icon"')
    expect(html).toContain('<span class="comment-like"><img class="icon"')
    expect(html).toContain('class="emote"')
    expect(html).not.toContain('cursor:')
  })
  it('解析后解码实体，文本不会变成 HTML 标签', () => {
    expect(decodeCardNode({ type: 'text', text: '&lt;script&gt; &amp; &amp;lt; &#39;' })).toEqual({ type: 'text', text: "<script> & &lt; '" })
    expect(decodeCardNode({ type: 'image', src: 'https://i0.hdslb.com/a?x=1&amp;y=2' })).toEqual({ type: 'image', src: 'https://i0.hdslb.com/a?x=1&y=2' })
  })
  it('Takumi 实际生成中文 PNG，资源失败时仍可渲染', async () => {
    const renderer = new CardRenderer({ image: async () => { throw new Error('Fixture resource unavailable') } }, logger(), new AbortController().signal)
    const result = await renderer.render(info, details, { formatNumbers: true })
    expect(result.subarray(1, 4).toString()).toBe('PNG')
    expect(result.readUInt32BE(16)).toBe(620)
    expect(result.readUInt32BE(20)).toBeGreaterThan(500)
  })
})
