#!/usr/bin/env node
import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const token = process.env.SANDBOX_TOKEN
if (!token) throw new Error('SANDBOX_TOKEN 环境变量未设置')
const base = (process.env.SANDBOX_URL ?? 'http://127.0.0.1:61901/api/v1').replace(/\/$/, '')
const runId = `bilibili-v2-${randomUUID()}`
let spaceId
const passed = []

async function call(name, args = {}) {
  const response = await fetch(`${base}/tools/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, testRunId: runId }),
    signal: AbortSignal.timeout(130000)
  })
  const result = await response.json()
  if (!response.ok) throw new Error(`${name}: ${result.code ?? response.status} ${result.message ?? ''}`)
  return result
}

async function sendAndWait(conversationId, content, operatorId, botId, expected = true) {
  const sent = await call('send_message', { spaceId, operatorId, conversationId, content, idempotencyKey: randomUUID() })
  const result = await call('wait_for_message', {
    spaceId, cursor: sent.cursorBefore, conversationId, authorId: botId,
    settleSeconds: 3, timeoutSeconds: expected ? 110 : 12
  })
  if (!expected) {
    assert.equal(result.outcome, 'timeout', '重复或无效目标不应再次发送消息')
    return []
  }
  assert.equal(result.outcome, 'matched', '等待真实机器人回复超时')
  const events = result.events ?? [result.event]
  const media = events.flatMap((event) => event.data.media ?? [])
  assert.ok(media.some((item) => item.type === 'image' && item.mimeType === 'image/png' && item.size > 1000), '缺少实际 PNG 卡片')
  assert.ok(media.some((item) => item.type === 'video' && item.size > 1000), '缺少实际 MP4 视频')
  return media.map(({ id, type, size }) => ({ id, type, size }))
}

try {
  const created = await call('create_test_space', { name: 'B站视频卡片 v2 自动验收', idempotencyKey: randomUUID() })
  spaceId = created.spaceId
  console.log(`测试空间：${spaceId}`)
  const id = randomInt(800000000, 899999990)
  const user = String(id)
  const bot = String(id + 1)
  const groups = Array.from({ length: 5 }, (_, index) => String(id + 2 + index))
  const snapshot = await call('get_scene_snapshot', { spaceId })
  assert.equal(snapshot.participants.length, 0, '只允许初始化本次创建的空白测试空间')
  await call('apply_environment_changes', {
    spaceId, expectedRevision: snapshot.revision, idempotencyKey: randomUUID(),
    changes: [
      { action: 'create-user', data: { id: user, name: '视频卡片验收用户' } },
      { action: 'create-bot', data: { id: bot, name: 'B站视频卡片验收机器人', implementation: 'napcat', enabled: true } },
      ...groups.map((group, index) => ({ action: 'create-group', data: {
        id: group, name: `B站卡片验收 ${index + 1}`,
        members: [{ participantId: user, role: 'owner' }, { participantId: bot, role: 'member' }]
      } }))
    ]
  })
  const cases = [
    ['独立 BV 号', groups[0], 'BV17x411w7KC', true],
    ['AV / BV 同视频去重', groups[0], 'av170001', false],
    ['完整链接与分 P', groups[1], 'https://www.bilibili.com/video/BV17x411w7KC?p=10', true],
    ['真实 b23 短链', groups[2], 'https://b23.tv/av170001', true],
    ['JSON 分享卡片', groups[3], `<json data='${JSON.stringify({ app: 'com.tencent.miniapp_01', meta: { detail_1: { qqdocurl: 'https://www.bilibili.com/video/BV17x411w7KC' } } })}'/>`, true],
    ['同条消息多个等价链接', groups[4], 'https://www.bilibili.com/video/BV17x411w7KC av170001 BV17x411w7KC', true],
    ['无效视频不发送', groups[0], 'av999999999999999', false]
  ]
  for (const [name, group, content, expected] of cases) {
    const media = await sendAndWait(`group:${group}`, content, user, bot, expected)
    if (expected) assert.equal(media.filter((item) => item.type === 'image').length, 1, '同一输入只产生一张卡片')
    passed.push({ name, media })
    console.log(`通过：${name}${media.length ? `（${media.map((item) => `${item.type} ${item.size} B`).join('，')}）` : ''}`)
  }
  await call('complete_test_space', { spaceId, idempotencyKey: randomUUID() })
  console.log(`验收完成：${passed.length} 项通过；空间 ${spaceId} 已停止，测试记录保留`)
  if (process.env.SANDBOX_REPORT) await writeFile(process.env.SANDBOX_REPORT, JSON.stringify({ runId, spaceId, passed }, null, 2))
} catch (error) {
  if (spaceId) {
    try { await call('fail_test_space', { spaceId, error: error instanceof Error ? error.message : '验收失败', idempotencyKey: randomUUID() }) }
    catch { console.error(`空间 ${spaceId} 未能自动停止，需要在沙盒中手动结束`) }
  }
  throw error
}
