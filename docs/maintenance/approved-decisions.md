# 已公开批准范围的决定索引

本页索引现有公开范围，不形成新批准，不改写正式决定或冻结设计。采集时间与工程／文档来源见[公开状态](public-status.md#来源快照)。

| 范围 | 已公开决定及状态 | 原始公开依据 |
| --- | --- | --- |
| B23 情报与协作 | 区分原件、转交及核实；共用处理席位，逐次下达现场阶段；取得 A／B 成果并送达合法回报。已合并；返程、交接及整局结局不在该交付内 | [SPEC #58](https://github.com/susansys/fogbound-command/issues/58)、[PR #63](https://github.com/susansys/fogbound-command/pull/63) |
| B23 保存兼容 | 使用独立 schema9，保留 schema4—8 身份及恢复分支；不静默迁移、删除旧记录 | [PR #63](https://github.com/susansys/fogbound-command/pull/63)、[固定 README](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/README.md) |
| B24 返程、结局与证据复盘 | 公开范围为四票／62 工程例；相关实现及测试前置修复已由 PR #73／#74 合并，当前来源 CI 通过；四票及 SPEC 已关闭，正式工程交付闭环已确认 | [SPEC #66](https://github.com/susansys/fogbound-command/issues/66)、[最终交付票 #70](https://github.com/susansys/fogbound-command/issues/70)、[实现 PR #73](https://github.com/susansys/fogbound-command/pull/73)、[修复 PR #74](https://github.com/susansys/fogbound-command/pull/74) |
| B24 保存与证据分层 | 已合并独立 schema10 分派；复盘证据保留当时所知、引擎事件、声明理由与事后推断的层次。源码存在不替代实际恢复与交付签收 | [固定恢复分派](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/src/core/snapshot.ts)、[固定复盘合同](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/src/outcome-contracts.ts) |
| B25 既有体验的有限修正 | 保留明确拒绝提示及原草案；只修正已识别的提示清空问题，不改变 Game 规则、不自动重试、不新增演练。三票／18 工程例是范围，不代表 18 项均为无保留通过 | [PR #81](https://github.com/susansys/fogbound-command/pull/81)、[固定工程记录](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/VERIFICATION.md) |
| B31 来源与时点 | 背景原文、递交记录和时间依据分开；未知不补成接收时间。关系仅依已收到的合法凭证，撤销不反推新的独立来源；各接收者只用自身已收证据 | [PR #92](https://github.com/susansys/fogbound-command/pull/92)、[固定合同](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/src/source-time-contracts.ts) |
| B31 存档 | 可选来源包使用独立 schema11；旧 schema4—10 及默认入口保持各自身份，不静默迁移 | [固定状态](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/src/core/source-time-state.ts)、[固定验证记录](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/VERIFICATION.md) |
| B32 冲突信息下行动 | 四票／24 工程例的有界薄片：原文与送达、工作判断与任务行动分别记录；仅本批范围，不代表完整第三阶段或新批次启动 | [PR #99](https://github.com/susansys/fogbound-command/pull/99)、[固定公开合同](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/src/conflicting-action-contracts.ts) |
| B32 存档身份 | 使用独立 schema12，既有任务与来源包保留原身份；不以工作判断改写过去记录 | [固定状态](https://github.com/susansys/fogbound-command/blob/f7ce7996be0fbe1bb6302172be1a27a77b91344d/app/src/core/conflicting-action-state.ts) |
| 工程验收边界 | 默认 Windows 真实浏览器／原生存档恢复与 Linux CI 各有证明范围；工程例不代签完整产品 244AT 或正式体验 | [B24 SPEC #66](https://github.com/susansys/fogbound-command/issues/66)、[PR #63](https://github.com/susansys/fogbound-command/pull/63) |

地图 C、真实图源、模型 API、文件备份、自由问答等后续能力，不因在路线或索引中出现而成为当前实施范围。新增取舍回到正式负责人处理；本目录只在有明确公开依据后更新索引。
