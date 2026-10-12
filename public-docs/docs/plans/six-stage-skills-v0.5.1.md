# 六阶段计划的skills方法与上游参考（公开版）

公开版说明（2026-10-12）：现行 V0.5.1 产品规格已审（review_state=owner_review_passed），frozen=false、implementation_state=not_implemented、acceptance_state=not_run。六阶段小批方案仍为 plan-draft/not-authorized，尚未实施；244 项产品验收均未执行。公开同步只发布这八份设计与计划文档，不授予产品开发、冻结或运行验收权限。

2026-10-12。以下只记录规划方法和公开上游参考，不包含个人工具路径、安装配置、锁文件或执行审计；也不承诺任何技能已在读者环境安装。六阶段路线和244项映射见[计划](six-stage-plan-v0.5.1.md)、[映射](six-stage-acceptance-map-v0.5.1.md)。

## 技能参考与职责边界

表内上游参考固定到mattpocock/skills的公开提交49dd158d1076134a641b33efb035946536778336，只用于追溯方法；本包不复制技能源码，也不自动安装或升级。技能默认副作用受当前获准范围约束。

| 技能 | 公开上游参考 | 规划用途或未来触发 | 职责及当前约束 |
| --- | --- | --- | --- |
| code-review | [skills/engineering/code-review/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/code-review/SKILL.md) | 未来有指定baseline及非空代码diff | 固定base/HEAD，Standards与Spec独立双轴审阅；原文并行两个审阅agent。本计划无代码diff，不调用或宣称通过。未来重构建议限真实scope。 |
| codebase-design | [skills/engineering/codebase-design/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/codebase-design/SKILL.md) | 本计划词汇参考/未来接口形状变化 | Module/Interface/Implementation/Seam及深模块；参考而非自动会话，不为每实体引入服务/空转Adapter。 |
| diagnosing-bugs | [skills/engineering/diagnosing-bugs/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/diagnosing-bugs/SKILL.md) | 未来本批反例/回归实际失败 | 真实复现后定位窄故障，必要bug独立修复；不顺带加功能。本计划无应用故障，不调用诊断循环。 |
| domain-modeling | [skills/engineering/domain-modeling/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/domain-modeling/SKILL.md) | 本计划消费既有词汇/未来真实模型决策 | 主动领域澄清、GLOSSARY/必要ADR；现在已审批模型保持原样，新实质变化先另行提出，不由技能默认更新覆盖。 |
| grill-with-docs | [skills/engineering/grill-with-docs/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/grill-with-docs/SKILL.md) | 本计划补实施缺口/未来新决策 | 官方胶水技能：调用grilling与domain-modeling；本计划不重问已审产品，不改原GLOSSARY/ADR，新增澄清只在独立计划供审。 |
| grilling | [skills/productivity/grilling/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/productivity/grilling/SKILL.md) | 仅存在未定实施决策时 | 按依赖frontier分轮并给建议，不固定一题；本计划可预见实施问题一次汇总，方向已认可，不拉回24题产品访谈。 |
| handoff | [skills/productivity/handoff/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/productivity/handoff/SKILL.md) | 未来跨会话真实交接 | 引用权威文档/证据和未完成状态，不重复大设计；原文OS临时目录，临时产物使用获准的临时目录。当前不因保存计划自动启后续任务。 |
| implement | [skills/engineering/implement/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/implement/SKILL.md) | 本计划禁止调用 | 默认执行spec/tickets，调用tdd/code-review并commit；与当前只规划冲突。未来获准批需限定scope，不让整包顺带执行。 |
| prototype | [skills/engineering/prototype/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/prototype/SKILL.md) | 本计划禁止调用 | 会创建throwaway代码/HTML/UI变体并按规则留分支；工程薄片将来走正式可验证链，不以该技能免掉保存/测试要求。 |
| setup-matt-pocock-skills | [skills/engineering/setup-matt-pocock-skills/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/setup-matt-pocock-skills/SKILL.md) | 将来明确改变配置时 | 配置tracker/领域/入口，本计划禁止重跑安装/升级或重写配置。 |
| tdd | [skills/engineering/tdd/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/tdd/SKILL.md) | 未来获准实现/必要bug | 在预先认可Seam逐行为red→最小green；不批量先写所有测试；重构不属于循环，留review。不能以本计划映射检查冒充TDD运行。 |
| to-spec | [skills/engineering/to-spec/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/to-spec/SKILL.md) | 本计划只整理批范围与测试Seam原则 | 用已讨论上下文综合规格，默认发布tracker并ready-for-agent；本计划取其范围/测试格式，关闭发布步骤，不重写已审全套需求。 |
| to-tickets | [skills/engineering/to-tickets/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/engineering/to-tickets/SKILL.md) | 本计划拟议窄纵向小批 | 一批跨输入/规则/API/UI/测试完整链，列blocking edges。技能默认每ticket一文件且ready-for-agent；本计划只有3份plan-draft文档，不创建tickets、不激活实施。 |
| writing-for-agents | [skills/productivity/writing-for-agents/SKILL.md](https://github.com/mattpocock/skills/blob/49dd158d1076134a641b33efb035946536778336/skills/productivity/writing-for-agents/SKILL.md) | 本计划写可供后续Agent读取的计划 | 触发清楚、完成准则可检查、步骤/参考分层；只写本计划入口，不扩张常驻AGENTS或整套规格。 |

## 规划方法与执行授权

已审需求 → grill-with-docs只补实施决策 → to-spec归纳小批范围/Seam → to-tickets形成窄纵向切片和blocking edges。六阶段产物仍为plan-draft/not-authorized，不是ready-for-agent任务；默认发布、创建任务和自主执行均须对应新授权，不因公开文档同步而启用。

计划按目标、依赖、验证和回退组织。领域、接口与Agent文档方法分别参考domain-modeling、codebase-design、writing-for-agents；产品规则的实质变更须另行审阅，不能由技能默认动作覆盖。

## 浏览器验证与结构改进

- 上表14项不提供专用浏览器验收能力。后续需使用实际可用的浏览器验证工具完成快照、交互、再次快照及证据记录；工具通过不等于真实用户体验通过。缺运行时或依赖时记录阻塞，按授权处理。
- 只有真实代码出现结构摩擦时才另提受控架构改进候选，不自动安装工具或全库重构。
- 整包执行、原型、并行集成等副作用不在当前规划授权中；未来只执行明确获准且可演示的小批。

## 小批未来技能顺序

批范围/Seam已认可且获准启动 → tdd逐行为red→green → 实际Game/SQLite/HTTP/浏览器/人工证据 → 非空最终SHA代码diff上的独立code-review双轴 → 必要窄修复/审查阶段重构及受影响复验 → 对应授权下的draft PR/最终SHA CI/merge/本地同步。前批未closed不启动依赖批；bug单独修，不用技能默认动作扩大范围。

正式体验仍需真实参与者、已审范围/版本和预登记标准，技能不能自动认证。本计划不提供现实军事战术或训练建议，全部场景/模型为虚构娱乐抽象规则。

公开范围说明：本包保留产品规则、参数、场景、244 项验收及原七阶段十四任务对照。历史版本、逐题讨论、审批原始记录、私有任务单、执行日志、工具配置和技能源码不在公开范围。涉及 V0.5/B01-LEGACY 历史夹具的条目只保留引用含义；历史输入未随本包公开，后续验证须另行取得获准且完整的版本化输入，不用当前 FIC 档替代。
