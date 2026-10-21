# 已知限制与下一步

本页只列[固定公开来源](public-status.md#来源快照)支持的事项；本地开发细节与未公开故障不进入公开摘要。

| 事项 | 当前可确认边界 | 下一步与归属 |
| --- | --- | --- |
| B24 交付后的维护边界 | 相关实现及测试前置修复已合并，固定来源 main CI 成功；四票及 SPEC 已关闭，正式工程交付闭环已确认 | 依据 [#66](https://github.com/susansys/fogbound-command/issues/66)、[#70](https://github.com/susansys/fogbound-command/issues/70) 与正式交付记录维护；本目录同步不新增工程事件，后续批次不因此获得实施授权 |
| 文档与运行时 CI 分流 | [PR #76](https://github.com/susansys/fogbound-command/pull/76) 已合并；固定工作流移除了 browser-contract 显式整体 timeout，quality 仍为 15 分钟。只有六个既有普通维护文档的非空修改可走 docs-only；混合、新删或身份不明走 full | 本目录只用现行文档路由，runtime 明记 not_run；分类不检查正文、链接或隐私，这些检查仍由维护流程实际执行。意外 full 时停下，不为文档启动浏览器矩阵 |
| 暂停队列回归 | [PR #64](https://github.com/susansys/fogbound-command/pull/64) 已修正测试前置；失败 main [38991799740](https://github.com/susansys/fogbound-command/actions/runs/38991799740) 与后续成功工程 main [38994765725](https://github.com/susansys/fogbound-command/actions/runs/38994765725) 分列 | 保留失败及修复范围，不将其推断为所有未来时钟问题已经解决 |
| 测试前置修复与历史失败 | [PR #74](https://github.com/susansys/fogbound-command/pull/74) 已修复不确定暂停证明的启动时钟冲突前置；当前来源 CI 成功；不外推所有未来时序问题已解决 | 保留历史失败及修复范围；不以同 SHA 重跑成功冒称根因修复 |
| 界面改进的验证边界 | 后续工程已改善当前行动布局、拒绝原因及来源返回上下文；实时版本冲突政策仍在，自然观察有学习与顺序效应，未签完整人类体验改善 | 按[固定工程记录](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/VERIFICATION.md)保留限制，后续改善另按正式范围推进 |
| B25 首次 CI 与 Windows 证据 | 首次 [39151352610](https://github.com/susansys/fogbound-command/actions/runs/39151352610) 为 278 浏览器通过／1 前置失败；后续修正及成功 CI 分列。14 项 Windows 义务由 8 项通过加原 6 项前置失败后重采成功、同源绑定复用，不是新一轮干净 14/14 | 旧失败及未覆盖项保留；该批自然 hidden／blur 未重新签收，不用通用回归代签完整自然覆盖 |
| 旧文档 main CI 失败 | [39137902456](https://github.com/susansys/fogbound-command/actions/runs/39137902456) 在 fingerprint 的 fetch 顶层 await 退出 13；未报文档内容或 hash mismatch，具体生命周期根因未证明 | 保留历史失败，不以新文档路由漂绿旧结果，不重跑旧浏览器 CI 作为文档验收 |
| 本机存档与备份 | 存档按浏览器配置和来源隔离，当前没有独立文件备份或跨浏览器迁移；部分显示数据库故障不能保证页内修复 | 使用[当前恢复说明](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/README.md#本地运行)；后续备份能力另有批准范围 |
| B31 证据与恢复边界 | 289 可移植浏览器执行与 16 项 Windows 义务分别记录；最终来源、160 项运行输入与 58 项制品一致性支持见证复用，不是新一轮完整 16 项运行 | 以[固定工程记录](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/VERIFICATION.md)及对应 CI 为准，旧失败和审查限制保留；不据工程交付签收整个阶段 |
| CI 组织优化 | [维护 PR #87](https://github.com/susansys/fogbound-command/pull/87) 已调整重复检查与核心文件调度；它是独立维护，不新增玩法或工程交付事件 | 保留实际覆盖映射、失败及适用环境，不把本地耗时改善外推所有远端运行 |
| B32 实际验证边界 | main 的 872 核心／293 可移植浏览器成功与 Windows 18 项候选见证分开；main 按完整来源／构建绑定复用，不称再跑 18 项 | [候选 CI](https://github.com/susansys/fogbound-command/actions/runs/39301408530)、[main CI](https://github.com/susansys/fogbound-command/actions/runs/39311064383)及[验证记录](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/VERIFICATION.md)分别归属 |
| B32 保留的观察限制 | 真实隐藏／恢复见证披露一次显示空闲计时重置；旧失败及历史启动异常根因未唯一确定。Agent 路线受既有学习影响，不代表真人 PLAY | 保留原失败和环境边界，不倒签修复或完整体验通过；主事件登记依正式负责人记录，不由文档填预期序号 |
| 正式体验与完整验收 | 现有工程演练不能签收完整 244AT、正式玩家信息压力或现实拟真 | 待对应正式标准和实际证据，不由文档整理补填通过 |

## B33 交付后的保留边界

[PR #116](https://github.com/susansys/fogbound-command/pull/116) 已完成工程交付，主事件已正式登记为第 10 次工程交付；文档不重复计数，也不启动下一批。985 核心／313 可移植浏览器结果只归属实际候选及 main CI；本机 Windows 恢复和真实隐藏／继续证据另列，不用 Linux skip 代签。

[固定验证记录](https://github.com/susansys/fogbound-command/blob/274d105c621c9cb52380409fbaa50e42722b90bb/app/VERIFICATION.md) 的 S12 段落是交付前快照，文中当时待验项须与最终 PR／CI／交付记录区分；原克隆、曝光元数据、窄屏及验证前置失败保持历史记录，不能据后续成功倒签全部旧根因已修。受控逻辑时钟不是同等时长的真实墙钟体验；原 244AT 与正式 PLAY 仍未签收。
