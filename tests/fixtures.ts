import { vi } from 'vitest'
import type { CardDetails, Log, VideoInfo } from '../src/types'

export const info: VideoInfo = {
  aid: 170001, bvid: 'BV17x411w7KC', cid: 279786, page: 1, part: '',
  title: '【B 站视频卡片】迁移测试 · 中文与 emoji 🎉',
  description: '视频简介与热门评论独立渲染。\n包含 & < > 与多语言 ABC 한글。',
  cover: 'https://i0.hdslb.com/bfs/archive/cover.jpg', duration: 96, published: 1700000000,
  owner: { name: '测试 UP 主', avatar: 'https://i0.hdslb.com/bfs/face/avatar.jpg' },
  stat: { view: 1234567, like: 23456, coin: 7890, favorite: 19876, share: 321, reply: 1234 }
}

export const details: CardDetails = {
  tags: ['测试', 'Bilibili', '卡片'], online: '123+', danmaku: ['前方高能', '测试弹幕 & < >', '🎉'],
  comments: [{
    name: '测试观众', avatar: 'https://i0.hdslb.com/bfs/face/comment.jpg', level: 6,
    message: '评论内容与自定义表情 [测试] 🎉', emotes: { '[测试]': { url: 'https://i0.hdslb.com/bfs/emote/test.png' } },
    likes: 123, published: 1700000000
  }]
}

export function logger(): Log {
  return { warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}

export const apiVideo = {
  aid: info.aid, bvid: info.bvid, cid: info.cid, title: info.title, desc: info.description,
  pic: info.cover, duration: info.duration, pubdate: info.published,
  owner: { name: info.owner.name, face: info.owner.avatar }, stat: info.stat,
  pages: [{ cid: info.cid, page: 1, duration: info.duration, part: '第一 P' }, { cid: 222, page: 2, duration: 25, part: '第二 P' }]
}
