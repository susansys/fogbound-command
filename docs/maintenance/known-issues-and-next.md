# 已知限制与下一步

本页只列[固定公开来源](public-status.md#来源快照)支持的事项；本地开发细节与未公开故障不进入公开摘要。

| 事项 | 当前可确认边界 | 下一步与归属 |
| --- | --- | --- |
| 完整第一可玩链未交付 | 已发布 B23 截止于 A／B 成果回报；B24 SPEC 及四票在采集时均开放 | 原实施负责人按 [#66](https://github.com/susansys/fogbound-command/issues/66) 与 [#70](https://github.com/susansys/fogbound-command/issues/70) 的正式证据完成交付；文档维护只在公开结果变化后同步 |
| 浏览器 CI 时间余量 | 现有 [工作流](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/.github/workflows/fb01.yml) browser-contract 上限为 20 分钟；旧成功不能保证下一 SHA 成功 | 每个实际候选保留自己的 CI 结果；维护文档不改变预算、断言或覆盖要求 |
| 暂停队列回归 | [PR #64](https://github.com/susansys/fogbound-command/pull/64) 已修正测试前置；失败 main [38991799740](https://github.com/susansys/fogbound-command/actions/runs/38991799740) 与后续成功工程 main [38994765725](https://github.com/susansys/fogbound-command/actions/runs/38994765725) 分列 | 保留失败及修复范围，不将其推断为所有未来时钟问题已经解决 |
| 本机存档与备份 | 存档按浏览器配置和来源隔离，当前没有独立文件备份或跨浏览器迁移；部分显示数据库故障不能保证页内修复 | 使用[当前恢复说明](https://github.com/susansys/fogbound-command/blob/ef7b5a66e72fcf63d5ac25bc1b71597ad1060f08/README.md#本地运行)；后续备份能力另有批准范围 |
| 正式体验与完整验收 | 现有工程演练不能签收完整 244AT、正式玩家信息压力或现实拟真 | 待对应正式标准和实际证据，不由文档整理补填通过 |
