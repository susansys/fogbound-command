# 已发布实现的技术导航

本页仅导航到[来源快照](public-status.md#来源快照)中文档基线 `ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08` 的公开文件。B24 未合并实现不进入本页；接口或数据结构实际合并变化后再定向更新。

| 边界 | 实际入口 | 阅读目的 |
| --- | --- | --- |
| 工作台与 Transport | [`transport.ts`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/app/src/transport.ts) | Request／Response、请求关联与 Worker 通信；不把行政回执当作远端任务完成 |
| Worker | [`worker.ts`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/app/src/worker.ts) | Game／Persistence 组装、串行队列、时钟与浏览器单写者锁 |
| Game 公共入口 | [`core/game.ts`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/app/src/core/game.ts) | 场景与存档版本分派、公共操作及恢复路径 |
| 情报规则与合法所知 | [`intelligence-game.ts`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/app/src/core/intelligence-game.ts)、[`intelligence-knowledge.ts`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/app/src/core/intelligence-knowledge.ts) | 分开规则执行与合法视图投影；来源、递送和核实各有身份 |
| 持久化 | [`core/persistence.ts`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/app/src/core/persistence.ts) | Dexie／IndexedDB 事务、已提交记录与恢复；B23 独立 schema9 保留旧版本分支 |
| 依赖与命令 | [`package.json`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/app/package.json)、[`package-lock.json`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/app/package-lock.json) | React／TypeScript／Vite、PixiJS、Dexie 及锁定依赖；实际启用与仅安装分开核对 |
| 验证与 CI | [`VERIFICATION.md`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/app/VERIFICATION.md)、[`fb01.yml`](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/.github/workflows/fb01.yml) | 区分历史检查点、Vitest 核心检查、Playwright 浏览器合同与实际 CI SHA |

浏览器存档保存在本机浏览器记录区域。当前没有服务器账号或云存档；恢复须使用相同浏览器配置和访问来源，关闭后不补算墙钟，指挥模式明确继续。[固定运行与恢复说明](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/README.md#本地运行)

公开完整产品设计是规划来源；它不替代当前实现导航，也不说明其中全部技术候选已经选用或通过验证。
