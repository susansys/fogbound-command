# 已知限制与下一步

本页只列[固定公开来源](public-status.md#来源快照)支持的事项；本地开发细节与未公开故障不进入公开摘要。

| 事项 | 当前可确认边界 | 下一步与归属 |
| --- | --- | --- |
| B24 交付后的维护边界 | 相关实现及测试前置修复已合并，固定来源 main CI 成功；四票及 SPEC 已关闭，正式工程交付闭环已确认 | 依据 [#66](https://github.com/susansys/fogbound-command/issues/66)、[#70](https://github.com/susansys/fogbound-command/issues/70) 与正式交付记录维护；本目录同步不新增工程事件，后续批次不因此获得实施授权 |
| 浏览器 CI 时间余量 | 现有 [工作流](https://github.com/susansys/fogbound-command/blob/757e4eb6b535c9bedf9ff870f94ae8cd6bdc4f4c/.github/workflows/fb01.yml) browser-contract 上限为 30 分钟；旧成功不能保证下一 SHA 成功 | 每个候选保留自己的 CI 结果；后续 CI 控制调整按正式实施记录更新，批准计划不写成已生效，维护文档不修改预算或断言 |
| 暂停队列回归 | [PR #64](https://github.com/susansys/fogbound-command/pull/64) 已修正测试前置；失败 main [38991799740](https://github.com/susansys/fogbound-command/actions/runs/38991799740) 与后续成功工程 main [38994765725](https://github.com/susansys/fogbound-command/actions/runs/38994765725) 分列 | 保留失败及修复范围，不将其推断为所有未来时钟问题已经解决 |
| 测试前置修复与历史失败 | [PR #74](https://github.com/susansys/fogbound-command/pull/74) 已修复不确定暂停证明的启动时钟冲突前置；当前来源 CI 成功；不外推所有未来时序问题已解决 | 保留历史失败及修复范围；不以同 SHA 重跑成功冒称根因修复 |
| 本机存档与备份 | 存档按浏览器配置和来源隔离，当前没有独立文件备份或跨浏览器迁移；部分显示数据库故障不能保证页内修复 | 使用[当前恢复说明](https://github.com/susansys/fogbound-command/blob/757e4eb6b535c9bedf9ff870f94ae8cd6bdc4f4c/README.md#本地运行)；后续备份能力另有批准范围 |
| 正式体验与完整验收 | 现有工程演练不能签收完整 244AT、正式玩家信息压力或现实拟真 | 待对应正式标准和实际证据，不由文档整理补填通过 |
