# AGENTS.md — chatluna-plugin-bilibili-videolink-card

ChatLuna v2 的 B 站视频链接解析插件，使用 Cordis 4 生命周期、宿主消息适配层与 ui-kit。MIT 协议。

## 开发与验证

- 当前目录是唯一源码，单向同步到 ChatLuna v2 的 `external/bilibili-videolink-card`；禁止直接编辑运行副本。
- 源码不安装依赖、不生成锁文件。执行 `node scripts/sync-to-v2.mjs --once`；宿主默认 `../../chatluna-v2-mirror`，可通过 `CHATLUNA_V2_ROOT` 指定。
- 首次同步或依赖变化后在宿主执行 `yarn install`；构建执行 `yarn yakumo build bilibili-videolink-card`。在宿主插件目录执行 `yarn typecheck`、`yarn test`。
- 新增前端类名后完整停止并重启宿主 launcher/worker，不能只停 worker；共享开发环境须先协调。
- 不修改用户真实聊天数据，端到端测试只使用独立 onebot-sandbox 测试空间。令牌只从环境变量传入，不写进源码或测试报告。
- 不自行创建分支、提交或发布。

## 跨领域约定

- 配置使用 `@chatluna/schema`，经 `Config` 进入 `apply`；不使用 Zod、环境变量或读取宿主配置来绕过配置契约。
- 不保留旧配置别名或废弃实现。迁移决策记录在 `.agents/notes/implemented/feature/2026-11-10-bilibili-v2.{zh,en}.md`。
- 必需服务声明在 `inject`，可选 UI 通过 `ctx.inject` 子作用域安装。监听器、队列和网络取消绑定当前 fiber。
- 无 `any`、常规类型断言或用户可控任意目标的网络请求；使用明确类型与输入边界校验。
- README 面向使用者，说明功能、配置与限制；实现过程只进入 Agent Notes。

## 子目录说明

- `src/AGENTS.md`：消息监听、链接解析、网络边界、队列与 PNG 卡片。
- `client/AGENTS.md`：ui-kit 表单扩展及双语文案。
- `scripts/AGENTS.md`：单向同步和沙盒验收脚本。
- `tests/AGENTS.md`：网络、队列、渲染和规范守卫测试。
