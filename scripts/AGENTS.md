# scripts 说明

适用范围：`scripts/`。同时遵守根 `AGENTS.md`；验收约定见 `tests/AGENTS.md`。

- 同步脚本仅依赖 Node 内置模块，用 node 直接运行；`CHATLUNA_V2_ROOT` 指定宿主，目标固定为 `external/bilibili-videolink-card`。
- 同步保护源码与目标独立，拒绝符号链接；忽略 .git、.env、浏览器临时目录、依赖、数据和构建产物。只在本插件副本清理已删源码。
- 沙盒测试凭证只通过环境变量提供，测试写操作只能在本次创建的独立测试空间执行；不能清空或重置主场景。
- 验收结果区分真实公网解析与确定性回归，不把模拟 HTTP 成功描述成公网 API 成功。
