# scripts 说明

适用范围：`scripts/`。同时遵守根 `AGENTS.md`；验收约定见 `tests/AGENTS.md`。

- 同步脚本仅依赖 Node 内置模块，用 node 直接运行；`CHATLUNA_V2_ROOT` 指定宿主，目标固定为 `external/bilibili-videolink-card`。
- 同步保护源码与目标独立，拒绝符号链接；忽略 .git、.env、浏览器临时目录、依赖、数据和构建产物。只在本插件副本清理已删源码。
- 沙盒测试凭证只通过环境变量提供，测试写操作只能在本次创建的独立测试空间执行；不能清空或重置主场景。
- 验收结果区分真实公网解析与确定性回归，不把模拟 HTTP 成功描述成公网 API 成功。
- `publish.mjs` 在本机发布到 npm，用 node 直接运行；`--dry-run` 只演练，两步验证用 `--otp=<验证码>` 传入（无交互终端时 npm 直接以 EOTP 退出）。要求工作区干净、提交已推送、npm 已登录、`v<版本>` tag 不存在。不在 CI 发布：`@chatluna/*` 只在私有 v2 仓库中。
- 发布前必须清空副本 `lib`、`dist` 与 `tsconfig.tsbuildinfo`：同步不清理旧产物，且 tsbuildinfo 残留时 tsc 不再生成类型声明。用 `yarn pack` 改写 `workspace:*`，解压后从目录 `npm publish`，否则 npm 元数据缺少 `readme`，插件市场显示「暂无说明」。
- `package.json` 的 `repository` 指向 `Sor85/chatluna-plugin-bilibili-videolink-card`；改用 Trusted Publishing 时 provenance 要求两者一致。
