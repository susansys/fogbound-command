# 玄枢行动 完整产品需求与设计修改稿 V0.5.1（已审规格公开版）

公开版说明（2026-10-12）：现行 V0.5.1 产品规格已审（review_state=owner_review_passed），frozen=false、implementation_state=not_implemented、acceptance_state=not_run。六阶段小批方案仍为 plan-draft/not-authorized，尚未实施；244 项产品验收均未执行。公开同步只发布这八份设计与计划文档，不授予产品开发、冻结或运行验收权限。

日期：2026年10月12日。状态：现行规格已审、未冻结、未实现、244项运行验收未执行。读者：产品负责人、开发 Agent、测试与领域评审人员。

本版定义虚构军事题材情报/参谋娱乐游戏的完整信息与决定环境，涵盖地图、虚构组织、认知、抽象任务与资源。用途为游戏体验与软件一致性验证，不是现实行动规划工具。产品需求与分阶段实施分别管理：本文件及验收/场景/参数三个附录定义完整行为；[开发计划](../plans/product-development.md)只说明实施顺序、阶段覆盖与未交付能力。阶段未实现的需求仍是产品需求。

完整验收见[验收附录](product-v0.5.1-acceptance.md)，当前虚构场景与独立预期见[场景附录](product-v0.5.1-scenarios.md)。本稿为现行Markdown规格公开版；旧交付及历史附件不在本公开包内。虚构参数与规则见[参数附录](product-v0.5.1-parameters.md)。V0.1至V0.3和旧Demo任务保持历史，不作为当前产品范围上限。

## 1 产品定位与完整范围

### 1.1 玩家与模拟层级

玩家是架空联合特种作战任务指挥部的作战参谋，负责一个任务区域内多支能力不同的编组，协调上级、指挥官、情报、通信、保障、合作力量与支援单位。指挥官和其他席位由系统扮演；编组负责人依据本地信息自主执行。组织结构、指挥关系和任务权限是场景配置，不将某一国家的公开体系视为通用条令。

主要分辨率为编组及任务活动。行动区具有可度量空间、环境和地物；局部建筑或场所可用嵌套任务空间表达。行动区之外的空中、海上、空间、网络及上级行动通过具有自身能力、占用和限制的支援主体与外部过程影响本区。是否展开更细实体由任务所需分辨率决定，以几何、信息与规则一致性建立游戏可信感。

场景规模由数据及已验证能力包络决定，不固定七区、三编组、十时段或十保障点。完整产品支持研究模式和持续推进的指挥模式，任务可以并行、延期、中止、部分完成或失败。

### 1.2 十八项产品能力

| 系统 | 完整能力 | 权威章节 |
| --- | --- | --- |
| S01 | 模拟时钟与因果调度 | 3 |
| S02 | 组织权限与任务意图 | 4 |
| S03 | 任务包与阶段计划 | 5 |
| S04 | 空间地形与地物 | 6 |
| S05 | 天气水文与光照 | 7 |
| S06 | 编组人员与装备 | 8 |
| S07 | 补给医疗与人员成果回收 | 9 |
| S08 | 情报需求与采集生产 | 10 |
| S09 | 发现识别与独立认知 | 11 |
| S10 | 通信定位与消息确认 | 12 |
| S11 | 我方敌方与第三方自主行动 | 13 |
| S12 | 准备交战与任务效果 | 14 |
| S13 | 联合支援与协调 | 15 |
| S14 | 民事友军与行动约束 | 16 |
| S15 | 指挥部工作负荷与连续性 | 17 |
| S16 | 工作台地图与交互 | 18 |
| S17 | 原子保存历史与复盘 | 19 |
| S18 | 场景评价与模型验证 | 20 |

每项系统必须具备输入、状态、时间成本、行为效果、信息归属和可检查输出。环境变化可以同时影响多个过程；其他系统只能通过已定义因果和能力条件使用变化，不能再叠加同名脚本扣减。

### 1.3 完整性与拟真证据

完整覆盖表示系统与契约齐全，不表示参数已反映真实效能。ModelProfile必须记录用途、来源、参数、适用包络、误差和校准状态。公开成熟能力、试验能力、设计假设分别标记。本文不提供现实行动步骤或实装操作参数；架空场景可验收软件一致性；娱乐体验另由独立玩家评审，不评价现实作战效能。

## 2 共享字段与不变量

### 2.1 基础类型

所有实体使用id、run_id、object_revision及自身schema_kind。id为1至80字符的ASCII标识，所有跨对象引用校验存在、所属对局、类型及调用者可见权限。创建对象revision=1，修改成功加1；运行创建revision=0。用户标题不超过100字符、说明不超过2000字符，按纯文本展示。

SimTime为相对场景起点的非负整数毫秒，Duration为正整数毫秒；timestamp字段统一后缀_time_ms。场景另设start_datetime及display_timezone，仅用于显示。真实接收、观察、处理时间都用模拟时间；设备实际录制时间另存source_timestamp，不能未经转换参与排序。区间采用[from_time_ms,to_time_ms)，结束时点不再占用；历史选择operation_seq或sim_time_ms，二者互斥。

Quantity使用非负整数最小量纲及unit；FIC-BASE-01采用load_unit、space_unit、energy_unit、wear_unit、work_unit、item、person、seat。旧B01的milli_litre、watt_hour只用于冻结历史夹具，不混入FIC档。禁止二进制浮点作为账务量；比例耗费累积为有理数，在活动结算时向上取整一次，不按每tick重复取整。连续位置采用局部坐标系的fictional_metre，界面标“图上米”；空间误差使用同档单位。等级或归一化评分必须给量表与适用含义，不把所有状态压成战力或可信度百分比。

Required表示所有所属类型都必须提供；Conditional在所属kind时必须提供，其他kind不能携带；Optional允许缺失，缺失不等于0。null只用于契约明确的未形成时间或未知值；known_unknown用显式标签。嵌套列表的元素类型和约束在本章及系统表中定义。

### 2.2 共有证据与规则类型

| 类型 | 必须字段及含义 | 校验 |
| --- | --- | --- |
| EvidenceRef | kind=report/local_observation、record_ref、actor_scope、basis_time=KnowledgeTime | 只引用本主体合法已收到/观察记录；unknown无value，复盘另用DebriefEvidenceRef |
| ConditionExpr | field_ref、operator、typed_value、max_age_ms、unknown_policy | operator为eq/ne/lt/le/gt/ge/in；表达式用all/any/not组合，不执行任意脚本 |
| EffectRule | rule_id/version、input_refs、preconditions、output_fields、duration、provenance_id | 输出必须有明确所有者和量纲；同一损耗只结算一次 |
| Parameter | name、value/unit、allowed_range、source_type、source_ref、uncertainty、calibration_status | source_type为public_document/experiment/design_assumption；状态uncalibrated/reviewed/validated |
| SpatialScope | kind、crs_id、typed_geometry、precision、uncertainty、map_version | 按6章类型校验，未知范围不填真实坐标 |
| StateTransition | previous、next、trigger、cause_ids、actor_ref、effective_time_ms | 终态不能直接重新执行，重试使用原收据 |
| AssetReservation | asset_ref、capacity_kind、quantity/unit、from/to、owner_ref、state | held/committed/released；非空区间，不超过资产相同时间容量 |
| DecisionRecord | actor_id、knowledge_revision、view_digest、actual_intent、evidence_refs、selected_action、authority_ref、reason_status、declared_reason | 自动上下文不代表引用全部报告；理由可选，缺理由not_recorded；无记录不当违规 |

ConditionExpr的field_ref只能来自所属规则白名单。未知证据不能通过默认0满足安全门槛；硬约束默认unknown_policy=hold，明确禁止条件为deny。所有规则带版本，并支持可追溯的输入摘要与输出原因。KnowledgeTime为known(value_ms,source_ref)或unknown(无value)，事实依据不能用收到时点代替。

### 2.3 运行与信息归属

SimulationRun包含scenario_ref、model_profile_ref、sim_time_ms、clock_mode、status、revision、operation_seq、event_seq、seed、rng_states、scheduler_cursor、capability_manifest、world、actor_knowledge、messages、reservations、receipts、history_refs。status为created/running/paused/terminating/finished/faulted；WorldState只供规则及受限观测过滤读取。

PlayerView包含总部已收到报告、公开命令意图、消息状态、授权、任务已确认阶段、支援承诺、总部账务、用户研判和可读媒体。LocalActorView与ProviderView分别包含本主体合法本地观察、已收到消息、自身资源及记忆。正常接口、提示、错误、排序、计数和媒体均遵守同一可见性规则。

远端资源的实际消耗与总部最后已确认账务分别保存；未上传消耗不能作为全局数字泄露静默任务进度。总部已做的预留是公开行政事实。旧报告不会被新收到时间改写，终局真实对照不回填历史已知视图。

### 2.4 字段类型与缺省约定

系统表列出的字段默认Required；形成于未来过程的时间、回执、分配及成果引用在过程发生前为null，发生后必须非空。集合必填，尚无记录用空集合；scope、intent、授权等门槛缺失不能以空集合假装满足。declared_reason、parent、supersedes、alternate及伤情引用为Optional；所属kind要求的条件字段必须出现。未知事实使用KnowledgeValue，不用null同时表示未知、未发生和输入缺失。

表内时间简称统一展开为字段名后缀_time_ms；from/to展开为from_time_ms和to_time_ms。actor/subject_refs等并列简称展开为两个独立字段；report_id或local_observation_id、person或role_slot_id等替代类型用kind及唯一对应引用表达。mission/phase_ref用target_kind和target_ref，只能引用一种对象；一个申请需要两层关联时另提供parent_mission_ref。实现不得把斜线简称直接作为JSON属性名。

| 字段族 | 固定类型与取值 | 必填与边界规则 |
| --- | --- | --- |
| 引用与版本 | EntityRef{kind,id}；VersionRef{kind,id,version}；版本为正整数 | 引用存在、同run、类型合法；外部注册版本不可被运行中改写 |
| 时间与窗口 | SimTime、Duration；TimeWindow{from_time_ms,to_time_ms} | 窗口from<to；deadline必须晚于提交时点，逾期返回公开状态而非倒置窗口 |
| 属性与事实 | AttributeValue{name,value_type,value,unit,parameter_ref}；KnowledgeValue{status,value,evidence_refs,as_of_time_ms} | value_type限boolean/integer/decimal/enum/text/reference/geometry；status为known/unknown/conflicting/estimated；unknown无value |
| 范围与误差 | SpatialScope、fictional_metre制坐标，长度及误差为非负十进制定点数 | route长度>0；corridor宽度>0；定位误差≥0；带质量范围的数字含min/max且min≤max |
| 库存与容量 | Quantity{amount,unit}；ItemAllocation{item_kind,quantity,owner_ref,reservation_ref} | amount非负整数；一次reserve/consume/transfer数量>0；同账项只能同单位相加 |
| 能力与配置 | kind引用版本化能力目录；profile引用Parameter集合；capacity、limits为有名称有单位的属性集合 | 未注册属性拒绝；没有资格或缺少所需能力不得自动回落为通用编组 |
| 状态与原因 | 系统枚举；Reason{code,text,evidence_refs,cause_ids} | state必填且只能合法转换；拒绝、hold、过期、取消及失败均有reason |
| 质量与等级 | quality、reliability、confirmation等分别引用具名量表；等级值为量表enum | 各量表必须有定义及unknown；不会从low/medium/high自动计算伪精确概率 |
| 人员与环境量 | 伤情、压力、熟练度用具名量表；FIC环境用calm/impaired/severe及虚构等级；旧物理量仅legacy档显式注册 | 量纲及有效范围由场景所用Parameter固定；环境属性未注册拒绝，unknown不当正常；人数非负 |
| 工作与进度 | WorkQuantity{amount,unit}；WorkProfile{rate,conditions,model_ref} | required_work>0，0≤remaining_work≤required_work；阻断时不增加进度；预计到达是估计字段 |
| 预约与承诺 | ReservationRef集合、Window、capacity_kind、quantity、conditions、version | 同时预约总量不超容量；释放记录原预约及实际结束，不倒改已执行窗口 |
| 媒体 | MIME字符串、sha256、Duration、字节大小、recorded/live | hash为64位十六进制；不接受客户端指定私有storage_ref；录制片段有起止，直播有帧时点 |
| 条件与效果 | ConditionExpr、EffectRule；依赖引用列表 | 条件非空；未知硬条件hold；效果有目标、量纲和cause；图无环 |
| 策略与目录 | 各activity、support、source、payload kind为版本化目录项；规则参数为类型化属性 | 新目录项须同时登记字段、前置条件、消耗、状态及AT，不能仅添加UI名称 |

跨主体事件保存实际effective_time_ms，已知对象另保存observed_time_ms和received_time_ms。对任意字段的修改必须产生新object_revision；报告原文、已完成效果和保管事件不可原地重写。补正通过新记录及supersedes_ref连接。

### 2.5 合法状态转换与触发

状态机下表定义共同转换骨架；系统章节定义条件和可见性。表内终态不能回到执行态，需创建新版本或新活动；完成活动仍可被后来报告修正判断，但不能撤销已发生事实。未列出的跳转拒绝且没有物资、队列或版本副作用。部分结果存实际数量和未完成原因。

| 对象 | 主转换与合法例外 | 触发及完成证据 |
| --- | --- | --- |
| SimulationRun | created→paused/running；running↔paused；running/paused→terminating→finished；无收尾义务可直接finished；running→faulted→paused | 用户模式操作、结束条件、故障与恢复；恢复只能从已提交批次 |
| Activity | planned→ready→executing→completed；executing→blocked/suspended→ready/executing；非终态→aborted/failed | 条件复核、进度、能力变化、合法中止；失效generation不再完成 |
| DecisionProposal | draft→submitted→under_review→approved/denied；非终态→expired/withdrawn | 有权限审查及冻结版本答复；撤回不能抹去已生效授权 |
| MissionPackage | draft→proposed→authorized→preparing→ready→active→assessing→completed/partial/failed；active↔suspended；非终态→withdrawing→assessing/aborted | 各阶段门槛与已确认成果；实际执行及KnownExecution分别维护 |
| Order与Execution | Order draft→issued→withdraw_requested/closed；Execution not_received→accepted→preparing→executing→completed，执行中可blocked/suspended，非终态可aborted/failed | 到达消息、接收端接受、现场检查、工作完成及回执；接收拒绝不创建accepted执行 |
| EquipmentState | available↔degraded；available/degraded→unserviceable→repairing→available/degraded；非lost→lost | 有原因的故障、维修、恢复及丢失；lost终态，替换创建新设备 |
| SupplyRequest | submitted→approved→allocated→in_transit→delivered/partial；未执行可denied/cancelled；执行中止进入partial/failed | 分配、运输、接收数量确认；运送中取消是协调请求，保留已完成交付 |
| CasualtyCase及MedicalTask | 病例care_state由评估、救治、稳定/恶化、移交及死亡事件改变；任务queued→ready→treating→completed，或blocked/cancelled/failed | 病例与任务两条状态，不将运输自动视为救治完成；死亡不回到稳定 |
| RecoveryExecution | requested→confirmed→ready→assembling→boarding→in_transit→arrived→handed_over；非终态可blocked→重新评估，或aborted/failed | 双方会合、容量、登载清单、到达及接收交接确认 |
| MissionArtifact | lifecycle declared→collected→in_transit→delivered；非lost→lost；verification not_requested→pending→verifying→verified/inconclusive/rejected | 保管双方签认；验证单独作业，inconclusive/rejected重核须新验证记录 |
| IntelligenceRequirement | open→tasking→collecting→processing→answered/inconclusive；非终态→expired/cancelled | 问题、采集、处理和合法答复；无法判断仍保留原问题及证据 |
| CollectionTask与ProcessingJob | 采集planned→allocated→collecting→collected；处理queued→processing→completed；非终态可failed/cancelled | 资产与席位工作，原始资料产生及分析完成，不以时间到达替代条件 |
| ContactTrack与Assessment | 接触可由indication推进到detected/identified/confirmed/tracked；证据失效→lost，新观察重新建立跟踪；判断draft→active→superseded/archived | 识别门槛和证据；track丢失保留身份假设，拆分合并不改原始观察 |
| Message | queued→transmitting→sent→delivered→accepted→effective；接收拒绝rejected，未送达expired，queued可cancelled；已发撤回是新控制消息；MessageAck为独立确认记录 | 送达/接受/生效分开，取消不删旧事实；每类别政策及链路限制 |
| PositionFix与Link | 定位valid/degraded/unavailable及链路available/degraded/unavailable允许按新证据转移 | 每次变化有时间、质量和原因；旧精确位置不会因链路恢复自动变新 |
| Engagement | proposed→authorized→active→ended；active→interrupted→新检查后active/ended | 授权、感知、准备、条件及同时效果；结束不等于总部效果已确认 |
| SupportRequest | draft→submitted→acknowledged→reviewing→approved→allocated→preparing→ready→executing→completed；就绪前后变更→renegotiating→reviewing/allocated/preparing；非终态可denied/failed/expired | 每一步有相应审查、分配、门槛和执行事件；cancel_requested到cancelled须提供方安全结束确认 |
| AssetReservation | held→committed→released；held→released | 正式分配、实际结束或安全撤销；不立即释放执行中的占用 |
| StaffWorkItem | queued→assigned→processing→completed；preemptible允许processing→suspending→suspended→resuming→processing；awaiting_input可恢复；非终态可failed/cancelled | 切换成本占席位，进度/耗用/原票保留；non_preemptible不挂起，overdue只标记 |
| CommandPostState | operational→degraded/relocating/offline→recovering→operational/degraded | 条件与连续性计划，处理和联络的实际可用容量随阶段变化 |
| CapabilityManifest | not_implemented→partial→implemented→verified；变更或证据失效可退回 | 实现证据、行为验收及用途限制；阶段编号不是验证证据 |

所有转换保存StateTransition和Reason，连同预约变化、账务及事件同事务。UI操作必须选择当前允许动作，并提供状态、时点、依据及确认主体；异步接收后以原operation_id核对结果。按对应S系统八条验收检查主流程、异常、边界与私有状态，最终五族场景及全量复验覆盖跨系统转换。

## 3 S01 模拟时钟与因果调度

### 3.1 模式、管理暂停和恢复

默认command，开局可选research，clock_mode在本局锁定；改变模式须新开独立局并保留来源。command速率仅1/2/4，普通阅读、编辑、任务弹窗不暂停。research允许明确暂停及advance(Duration>0)。两模式共用同一规则和事件时间，区别只在时间控制及记录的玩家阅读成本。

管理暂停允许手动请求及窗口失焦/隐藏；原因限manual/focus_lost/application_hidden/system_fault/restore。请求经Game单写批次形成ControlReceipt，Workbench收到确认前不伪装世界已停；不得仅冻结画面。返回或恢复进入paused，必须明确continue。Application关闭期间墙钟不补算，崩溃从最后已提交点恢复。该政策是可用性设计，不是现实任务标准。管理暂停计次、原因及墙钟时长单列，不与当时证据四维评价混成惩罚分。

Clock含mode/rate/sim_time_ms/status、wall_anchor、sim_anchor、pause_reason、control_revision。ClockRequest含run_id、operation_id、expected_revision、action=pause/continue/set_rate/advance、typed_payload；mode变更拒绝MODE_LOCKED。UI只显示公开时间、模式、暂停及下一合法待办，不显示隐藏事件。

### 3.2 批次相位与时间一致性

相同时点按环境/设备→到达消息及本地接受→观测与认知→权限审查及角色决定→活动推进和支援意图→同时效果→人员物资控制→本地记录与总部处理→已知投影及目标评价→原子提交处理。同期有效效果同时应用，ID只用于同级容量平局。新生成反馈最早进入下一决策批次；完成必须严格晚于start，失效generation不执行。

所有到期事件均拆入大步推进，确定规则或同一已记录模型输出日志在相同输入时间线下大小步一致。两次新的实时外部调用不承诺相同返回或采纳集合；其差异必须由InvocationRecord说明，不能据此修改时间规则。浏览器不自行增加SimTime；后台与用户意图进入同一单写序列，过期版本拒绝且不产生半状态。墙钟卡顿不跳过到期事件；暂缓发布时显示正在同步，不以丢弃事件追赶。

验收：V051-AT001–008、211–213；恢复/并发另见129–136、239/244。

## 4 S02 组织权限与任务意图

### 4.1 字段与关系

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| Organization | org_id、parent_org_id、role、command_relationship、area_scope、capability_refs | 指挥链无环；行政隶属、指挥权、支援关系分别保存 |
| ActorRole | actor_id、org_id、role=commander/staff/team_leader/intelligence/communications/logistics/provider/partner | 玩家默认为staff；角色不自动赋予全部权限 |
| AuthorityGrant | issuer、holder、mission_scope、action_kinds、spatial_scope、valid_from/to、risk_limits、delegation_allowed、revocation_message_id | 按对象、行动、空间和时间共同判断；不把撤销直接写入尚未收到消息的编组认知 |
| MissionIntent | intent_id/version、purpose、desired_end_state、key_tasks、priorities、constraints、acceptable_risk、delegation_ref | 目的及结果必须非空；风险使用有解释的等级，不宣称真实概率 |
| DecisionProposal | proposer、kind、frozen_payload、evidence_refs、required_authority、submitted/deadline_time、state | draft/submitted/under_review/approved/denied/expired/withdrawn |
| AuthorizationDecision | proposal_ref、decider、decision、scope、conditions、valid_from/to、reason、evidence_refs、message_id | 批准绑定冻结版本；改变提案需重新审查 |

### 4.2 权限与交互规则

权限矩阵至少覆盖任务目的变更、区域扩展、任务签发、撤出、采集安排、支援申请、效果授权和硬约束变更。参谋可在有效授权内签发；超范围转提案。系统指挥官有自己的信息和工作队列，不能读取后台未来预测作答。

界面预览显示允许直接处理、需上报、明确禁止及依据。已获批准不等于编组已收到命令。授权到期或总部收到撤销后拒绝新签发；在途命令接收端再次复核。硬保护要求不允许通过普通风险接受覆盖；最高权限对这些要求的变更是否允许必须由场景事先定义。

批准、否决、附条件批准与超时均为可见答复。尚无答复显示待决，不自动批准。紧急行为只能使用预先授予的明确条件；不能因玩家点击“紧急”获得无限权限。运行中组织变更走消息传播，保留各主体实际收到版本。

验收归属：S02，V051-AT009至016。

## 5 S03 任务包与阶段计划

### 5.1 对象字段

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| MissionPackage | mission_id、intent_ref/version、objective_refs、phase_refs、assigned_actor_refs、support_refs、constraints、status、version | 生命周期draft/proposed/authorized/preparing/ready/active/suspended/withdrawing/assessing/completed/partial/failed/aborted |
| Objective | objective_id、purpose、success_expr、failure_expr、deadline_time_ms、verification_requirements、priority、dependencies | 实际效果、成果交付和确认是不同条件；主要任务可为多个目标的逻辑组合 |
| PhasePlan | phase_id、kind=analysis/preparation/insertion/execution/extraction/handover/assessment、dependencies、entry_gate、exit_gate、earliest_start/latest_finish、activities | 依赖图无环；可并行阶段明确互斥资源 |
| PlanVersion | plan_id/version、mission_ref、actor_assignments、routes、support_windows、assumptions、evidence_refs、decision_points、estimated_times | 保存无执行和预留；估计时间显示区间及假设 |
| GateEvaluation | gate_id、evaluated_by、knowledge_revision、conditions、result=met/not_met/unknown、evidence_refs、expires_at | 总部、编组和支援方各自判断，不能共用真值结论 |
| Order | order_id、parent_order_id、origin=staff/local_delegate、frozen_plan、intent_ref、authority_ref、message_id、execution_ref、supersedes_id | 公开签发与本地执行分离；换令须接收与切换确认 |

Order行政状态为draft/issued/withdraw_requested/closed；发送状态由Message维护，实际Execution状态为not_received/accepted/preparing/executing/blocked/suspended/completed/aborted/failed。KnownExecution只记录已确认状态、证据时点和待反馈，不直接复制内部状态。

### 5.2 阶段与任务变更

每个任务卡展示目的、阶段、下一门槛、缺口、估计、支援承诺与授权。ready只在该评估主体的门槛全部满足时成立；结果过期退回准备。总部认为ready不保证现场仍满足条件，执行主体必须复核。

一个编组可以有多个已安排任务，但同一时段互斥执行资源只能服务一个活动；通信、传感和医疗等独立能力允许并行，能力表决定占用。旧版“每编组只能有一条任何类型有效命令”不再作为总规则。

活动模板包括调动、观察、值守、维修、准备、任务执行、现场调查、成果交接、撤出和近域压制等。模板引用可验证规则，不规定现实行动步骤。任务可经授权修改、挂起、撤出或中止；前阶段成果保留，新版本不能追溯修改已发生行为。硬中止触发撤出阶段，任务效果与人员安全分别评价。

验收归属：S03，V051-AT017至024。

## 6 S04 空间地形与地物

### 6.1 同一连续几何

MapDefinition含map_id/version、crs_id、coordinate_unit=fictional_metre、extent、terrain_patches、service_features、building_features、route_corridors、space_nodes、space_links、baseline_time_ms、provenance_refs。TerrainPatch含合法geometry、surface_class、height_band、mobility_rule_ref、occlusion_class、condition_ref。Feature含feature_id/map_version、kind=service_marker/access_marker、Point geometry、public_properties及condition_ref；service_features可为空。BuildingFeature含稳定feature_id、footprint、height_band、nested_space_ref、access_link_refs、public_properties、condition_ref。SpaceNode含id、parent_ref、geometry、level及公开/已知标记；BuildingFootprint只是BuildingFeature.footprint，不另建重复实体。

SpatialScope支持point/area/region_set/edge/corridor/unresolved；定点坐标及误差均用fictional_metre。未知不填真实坐标，polygon合法且在extent内；hole、层级及入口明确。后台MovementState的连续position与总部收到的定位分别维护，不按图标或像素计算移动。

### 6.2 第一版与完整地图路径

path_mode=corridor：第一可玩在有几何宽度的合法通行走廊选择/调整连续路径，位置持续变化，不是节点瞬移。path_mode=free_surface：完整版必须允许在所有合法通行面画连续折线，经合法入口切换嵌套空间；不得将其永久裁为范围外或not_applicable。

自由路径逐段与已注册通行面、障碍、入口和容量求交；不合法段明确指出合法可见缺口，后台未知障碍不提前泄漏。耗时按各段图上长度、资格、地形、环境及该活动允许的载荷因素累积，最后按1ms取整。路径校验是虚构游戏几何规则，不提供现实路线优化。图面、观测和活动均引用同一geometry_version。

Preview只用PlayerView的地图资料与已确认能力，未知边标unknown，预计给范围和假设；现场按本地资料复核及授权应变。拖图或画线只改草案，不改世界。相邻不等于可见；clear/partial/occluded/unknown由注册遮挡规则产生，来源未知只提示观察限制。层级转换保持同一SimTime、库存与证据链。

验收：V051-AT025–032、145–152、216/217；完整自由路径归I04/C2，首可玩只声明corridor子集。

## 7 S05 天气水文与光照

### 7.1 字段与状态

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| WeatherField | scope、effective_from/to、environment_level、registered_attribute_refs、model_ref | FIC使用虚构calm/impaired/severe；物理属性只在明确legacy档注册，不作隐含默认 |
| HydroState | feature_ref、virtual_level_band、trend、flow_class、flood_scope、effective_from/to、cause_refs | FIC用虚构等级及注册因果，不加载真实水文参数 |
| InfrastructureCondition | feature_ref、state=open/restricted/closed/unknown、capacity、inspection_state、effective_from/to、cause_refs | 检查、受损和恢复各有过程；预测恢复时间不是已恢复 |
| EnvironmentalProduct | kind=observation/forecast/advisory、observed或issued_time、valid_from/to、scope、uncertainty、source_refs | 预报不直接写World事实；实际环境过程才产生状态变化 |
| ImpactEvaluation | environment_refs、consumer_activity、rule_ref、mobility/collection/link/support/health_effects、reason | 同一影响不被消费者二次重复扣减 |

### 7.2 行为与交互

场景配置环境演化模型及参数；同一条件可对虚构影像型、记录型观察、岗位和不同抽象运输方式产生不同影响。不能把降雨等同于全部遥感失效，也不能把全天候类别等同于完整识别。

界面并列显示当前已知观察、预报区间和来源年龄，支持叠加水文与道路因果。条件过期显示未知或最后记录，不恢复默认正常。环境恶化后活动重新估计，保持已完成进度，必要时受阻；恢复不自动恢复已中止任务。

验收归属：S05，V051-AT033至040。

## 8 S06 编组人员与装备

### 8.1 字段与状态

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| Team | team_id、organization_ref、leader_ref、member_refs、capability_refs、equipment_refs、local_status、position、assignment_refs | 特战编组能力不同；角色与装备共同决定任务资格 |
| Capability | kind、qualification、performance_profile、capacity、concurrency_group、limits、readiness_conditions | 基础任务能力、并行占用及准备条件可核查 |
| PersonnelState | person或role_slot_id、role、proficiency、fatigue、stress、injury_ref、availability、cause_refs | 人员级与岗位聚合级为场景分辨率；人数不能用战力值代替 |
| EquipmentState | equipment_id、kind、condition、energy_quantity、consumables、failure_profile、repair_requirements、assignment | available/degraded/unserviceable/repairing/lost；能源和消耗品独立记账 |
| TeamReadiness | evaluated_time、personnel/equipment/logistics/preparation_checks、capability_limits、evidence_refs | local结果与总部confirmed结果分别保存 |
| LoadoutPlan | required_capabilities、equipment_allocations、carried_quantities、transport_load、assumptions | 不超过编组和运输容量，装备挪用会改变其他任务条件 |

### 8.2 行为与交互

疲劳、压力、伤情和训练状态影响行动速度、处理时间、错误倾向及可承担任务，具体关系由ModelProfile给出。休整和维修消耗时间与资源，恢复有上限，不用等待自动恢复所有状态。失能只表示某类行动能力丧失，不等于人员死亡或不可运输。

编组页显示已确认能力、状态年龄、当前与未来占用。玩家可以匹配任务、更换力量、安排休整、调整装备和申请补充。后台的伤情或设备故障先经本地记录与通信进入总部，不能通过任务列表灰掉按钮泄露未收到结果。

验收归属：S06，V051-AT041至048。

## 9 S07 补给医疗与人员成果回收

### 9.1 字段与守恒

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| Inventory | owner_ref、item_kind、quantity_unit、on_hand、reserved、available、location、confirmed_at | 本地实际和总部已确认库存分别维护；on_hand=reserved+available |
| LedgerEntry | entry_id、kind=reserve/release/consume/transfer/loss/replenish、quantity、from/to、cause_ref、time | 各item按期初+入库-出库-消耗-损失=期末核对；重试不重复记账 |
| SupplyRequest | requester、items、needed_by、destination、priority、status、allocation_refs、transport_ref | submitted/approved/allocated/in_transit/delivered/partial/denied/cancelled/failed |
| CasualtyCase | subject_ref、injury_class、observed_time、care_need、mobility_limit、urgency、care_state、evidence_refs | 待评估/等待救治/救治中/稳定/恶化/移交/死亡；参数为有来源或标明假设的模型 |
| MedicalTask | provider_ref、case_refs、care_capability、required_stock、start/end、state | queued/ready/treating/blocked/completed/cancelled/failed；排队、资源和处理时间可追踪，安全运输与救治不是同一完成条件 |
| RecoveryPlan | mission_ref、personnel_refs、artifact_refs、primary/alternate_windows、rendezvous_scope、provider_request_refs、abort_conditions | 进入执行前核对回收可行性；窗口变更需要重新协调 |
| RecoveryExecution | plan_version、boarding_manifest、capacity_reservations、rendezvous_confirmations、state、location、handover_refs | requested/confirmed/ready/assembling/boarding/in_transit/arrived/handed_over/blocked/aborted/failed |
| MissionArtifact | artifact_id、kind、origin_event、custody_holder、condition、lifecycle_state、verification_state、custody_events、verification_events | lifecycle_state为declared/collected/in_transit/delivered/lost；verification_state为not_requested/pending/verifying/verified/inconclusive/rejected；转交双方确认，交付不等于验证 |

### 9.2 行为与交互

撤出计划同时考虑人员、伤员、物资和成果的容量，人员不能超过运输座位或保障能力。不能自行移动的人员可以由已分配救援能力回收；尚无此能力时显示等待或任务失败，不自动消失。

接应方与编组分别确认位置、窗口和准备。任一方缺少确认显示未满足，不用真实坐标自动完成会合。boarding时复核容量与约束，途中状态继续演化；取消已开始运输转协调撤销，不立即释放正被使用的资产。到达指定位置后仍需人员与成果交接事件。

玩家在保障板申请补给和医疗、预约回收、查看承诺及缺口。任务目标、人员回收、医疗移交和成果验证分别评价；成功取得成果但没有撤出不能自动标完整成功。

验收归属：S07，V051-AT049至056。

## 10 S08 情报需求、加工与分析

### 10.1 原件、递交与不同时间

IntelligenceRequirement含question、mission_ref、scope、priority、needed_by、precision、confirmation_need及open/tasking/collecting/processing/answered/inconclusive/expired/cancelled。CollectionTask经合法资源预约和能力条件生成RawObservation；失败空覆盖无not_detected。ProcessingJob将资料加工或形成分析，消耗明确席位工作；Report原件、Assessment判断分别保存。

Report含id、type、content_category、原始陈述、source_descriptor、typed_payload、source_event_time、source_observed_time、source_reported_time、quality/reliability/claimed_confirmation、provenance_evidence_refs、attachment_refs。前三项为KnowledgeTime{status=known/unknown,value_ms,source_ref}：known必须有值及依据，unknown无value，不能置0或拿收到时间代替。内部engine_generated_time_ms不自动成为玩家可知源时点。预报单独用issued_time及未来validity，不伪造未来事实。

ReportDelivery含report_ref、recipient_ref、message_ref、received_time_ms、公开来源元数据及visible_provenance_refs；接收时点来自该接收方的实际消息事件。同一原件不同递交分别记Delivery，原件不因再次收到改写。原Report.received_time简称统一指该主体的Delivery字段。对已知时间做合法顺序检查；未知时间不参与虚假排序或新鲜度确认，资料可收录但相关门槛保持unknown。原始RawObservation的引擎观察时点已知，不等同于被描述事件发生时点。

### 10.2 去重、来源关系与印证

引擎完整来源图为私有；PlayerView仅含已合法递交的来源关系。KnownLineageLink含from/to、kind=copy_of/forward_of/revision_of/derived_from/possible_common_source/possible_same_event、certainty=confirmed/suspected/unknown、supporting_evidence_ref及received_time_ms。确认关系必须由可见原件引用、递交标识或明示转发凭证支持，不能根据隐藏origin_lineage_id向玩家揭示未知关系。

确定重复副本和明确转发可自动折叠为PresentationGroup，保留每一原件、Delivery、时间和来源链，点击可展开。内容相同、地点相近或措辞相似只提示疑似同源/同事件，不自动定论、合并身份或删报。只有已知凭证支持不同独立采集时，才计已证独立证据；未确认关系显示unknown，不把三个未知报告自动算三独立来源，也不因内部同源自动显示一源。

独立印证、相互矛盾及解释选择属于分析/研判。系统可列合法证据、冲突、过期和待核实项，最终解释及下一步由玩家选择。来源可靠不保证内容正确；重复三转发不升级confirmation。后来递交的来源关系或纠正仅生成新的投影/Assessment版本，历史已知态势不回填。

### 10.3 覆盖、媒体和工作负荷

Coverage含planned_scope、actual_scope、quality、observed/received_time及实际范围内outcomes；空覆盖或遮挡不能表示整区空无。Attachment按报告已递交、资产归属及帧时间授权；录制与直播分离，媒体缺失保留文字，未递交缩略图/数量不泄漏。玩家提出期限、精度及核实请求；采集、加工、分析、实际递交各有容量和时延，原文可读不代表分析完成。

验收：V051-AT057–072、200、218–222；已知来源关系与独立源夹具另见场景。

## 11 S09 发现识别与独立认知

### 11.1 字段与状态

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| SensorCapability | methods、field_of_view、resolution_profile、environment_limits、processing_need、energy_need、model_ref | 能力限定采集范围与质量；不自动识别全部可见对象 |
| PerceptionResult | observer_ref、time、actual_scope、detected_features、visibility_limit、evidence_refs | 过滤器可读World，输出白名单；策略不能持World句柄 |
| ContactTrack | public_alias、candidate_refs、track_state、latest_observed_time、scope_candidates、identity_candidates、lineage_refs | indication/detected/identified/confirmed/tracked/lost；失去跟踪不删除历史 |
| ActorKnowledge | actor_ref、knowledge_revision、received_message_refs、local_observation_refs、facts、beliefs、memory_limits | 各主体独立，总部只有其渠道送达信息 |
| Assessment | subject_ref、conclusion、evidence_refs、alternative_explanations、open_questions、author、version、status | draft/active/superseded/archived；支持并存判断 |
| KnownProjection | actor_ref、as_of_time/operation_seq、confirmed_entity_states、uncertainty、fact_times、provenance | 对象更新时间按观察时点而非送达顺序；同时间冲突保留 |

### 11.2 判断与交互

接触状态只由对应证据和识别条件推进，不保证线性晋级。低质量新观测可以保持未知或失去跟踪；不得因内部真实身份自动确认。视线、传感方式、环境和目标可观测特征共同决定结果，邻接只是几何候选。

视频展示镜头内证据，图像识别结果另有来源、误差与确认状态。被遮挡或采集失败不能当“没有对象”。玩家可关联、分拆接触候选，操作改变研判不改RawObservation或真实实体。系统建议必须列证据与不确定项。

总部、编组、支援方和敌方可以同时持有互相矛盾的判断。共享由实际消息形成，不能直接合并所有阵营友方知识。过时记忆只支持不确定范围，不能精确引导后台目标。

验收归属：S09，V051-AT065至072。

## 12 S10 通信、消息与控制确认

PositionFix由本地能力产生，定位与上传独立；Link的available/degraded/unavailable与send/receive静默政策分别存。Message含message_id、sender/receiver、kind、payload_ref/version、issued/expiry_time_ms、attempts、delivery/acceptance/effective_time_ms、state；网络送达、接受及生效不能合并。

普通任务命令默认queue_until_expiry，可在未生效前撤销/替代；过期不执行。withdrawal和authority_update作为独立控制消息，用控制通道优先级及各自有效期，也受合法send/receive和实际链路限制，不因“高优先级”穿越断链或静默。总部收到撤销后立即拒绝新签发，远端仍依自己已收到版本，直到控制消息接受并按安全切换条件生效。任务/撤销/授权更新分别展示queued/transmitting/sent/delivered/accepted/effective/rejected/expired，不以单一绿灯代替。

迟到旧任务、授权和控制版本不得覆盖新已接受版本；接收重复message_id只回原收据，不重复活动或耗用。未发送消息可本地cancelled；已发送/已接受的撤销是新消息，不删除原送达事实；正在执行的占用须安全结束后释放。不可递交错误只含总部可知事实，不露私有队列。

角色接管先登记ControlRequest与正常控制消息。远端接受后effective_mode=player_controlled，撤销该角色在途自主请求；总部此前仅显示requested，不假装已接管。接管界面始终为PlayerView，玩家意图仍经正常消息，不能读取未上报LocalActorView或绕过预授权。返还也有请求/确认记录；不允许接管敌方。

验收：V051-AT073–080、168/172、223/226。

## 13 S11 我方敌方与第三方自主行动

### 13.1 字段与决策

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| ActorGoal | actor_id、intent_ref、priority、completion_conditions、risk_policy、deadline、relationship_refs | 我方、敌方、合作方及支援主体都有自身目标 |
| DelegationPolicy | allowed_actions、trigger_rules、hold_limit_ms、abort_conditions、fallback_refs、report_requirements、expiry | 明确授权范围；未知条件按hold/ask/abort配置 |
| LocalExecutionPlan | actor_id、mission/order_ref、selected_activities、routes、phase_state、assumptions、version | 根据LocalActorView而非总部草案或World生成 |
| AutonomyDecision | actor_id、time、knowledge_revision、trigger_evidence、candidate_actions、selected_action、authority_ref、reason | continue/adapt/hold/request_guidance/withdraw/abort/cooperate；候选须合法 |
| ActorMemory | contact_refs、last_observed_time、confidence_label、uncertainty_growth、received_intents、last_feedback | 按类型衰减，不强制所有记忆同时过期 |

### 13.2 决策约束与交互

硬约束、人员关键状态和授权到期先于普通任务优化；中止具体采用等待、撤出或移交由预先规则决定。恢复通信后报告原决策时点、依据、意图与实际结果，不以当前状态覆盖当时理由。

敌方策略可以侦察、等待、机动、执行任务、支援、重整和撤退；行为受其组织、信息、准备、资源与风险限制。策略不固定两次攻击预算或单一战力撤退阈值；场景可为基准给具体任务时限。学习和适应只用已获得经验，不读玩家输入或随机种子预测未来。

角色差异只来自已注册信息、负荷、偏好和能力约束；本版不增加随机怠工或独立迟疑目录，不随机覆盖硬约束。中立主体按自身安全与活动目标行动。玩家可看到已收到的应变报告，越权行为在复盘中单独评价；正常界面不读敌方内部理由。

验收归属：S11，V051-AT081至088。

## 14 S12 准备交战与任务效果

### 14.1 字段与效果

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| ActionIntent | actor_id、activity_ref、kind、target_alias/scope、desired_effect、authority_ref、evidence_refs、start/end | 准备、压制、保护、抽象交战或作业意图；目标不接后台秘密编号 |
| PreparationState | actor_id、mission_ref、completed_checks、missing_checks、valid_until、scope | 准备针对任务与条件，不是固定免伤点 |
| Engagement | participant_refs、perception_evidence、time_window、environment_refs、constraint_checks、model_ref、state | proposed/authorized/active/interrupted/ended；双方知识与实际效果分开 |
| ActionEffect | actor_ref、target_ref、effect_kind、quantity/unit或grade、duration、cause_refs、model_ref | suppression/capability_loss/damage/control/work_progress等分型，不合成单一血条 |
| DamageAssessment | observer_ref、observed_time、scope、reported_effect、confirmation、limits、evidence_refs | 实际损伤不自动成为总部已确认效果 |
| ControlState | place_ref、controller、contested、basis_events、known_control_reports | 无发现不是控制；实控与各方认为的控制独立 |

### 14.2 结算与交互

按感知、授权、准备、环境和能力条件形成有效意图，再由ModelProfile计算效果。人员、装备、任务进度和控制分别更新；受损后可能继续、受阻、失去部分能力或撤出，不能只减战力再自动继续。压制可影响行动及信息质量，持续与恢复有条件；值守不自动伤害看不见的攻击者。

同一事件时点有效效果同时应用，并记录因果。完成任务所需的能力在效果后复核；能力已经失去不能仍然生成调查成果。对象已移动且无有效跟踪时不得自动命中后台位置，未确认效果不得透露隐藏新位置。

玩家安排所需任务效果和支援依赖，查看已确认影响、未确认影响和能力缺口。各类效果规则、参数来源与适用包络必须在仿真模型登记，不把旧版准备、突入、还击数值当现实常量。

验收归属：S12，V051-AT089至096。

## 15 S13 联合支援与协调

### 15.1 字段与状态

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| SupportAsset | asset_id、provider_org、kind、capabilities、capacity_by_kind、readiness、location、calendar、constraints、known_status | reconnaissance/transport/fires/communications/engineering/medical/space/cyber等能力目录；成熟与试验标记独立 |
| SupportRequest | requester、mission/phase_ref、kind、desired_effect、scope、window、priority、evidence_refs、authorization_ref、dependency_refs、expiry、state | draft/submitted/acknowledged/reviewing/approved/allocated/preparing/ready/renegotiating/executing/completed/denied/cancel_requested/cancelled/failed/expired |
| SupportCommitment | request_ref、asset_refs、reservation_refs、promised_window、conditions、version、provider_evidence | 承诺有条件和版本，资产未分配不能显示ready |
| CoordinationConstraint | participants、scope、window、conflict_kind、required_confirmations、status | 友军、空间活动、网络作用和时段互斥等冲突以类型化条件表达 |
| SupportExecution | commitment_ref/version、provider_plan、local_gate、actual_start/end、effects、feedback_refs | 支援方有自身受限认知；执行前再次复核条件 |

### 15.2 承诺与交互

申请确认不等于批准；批准不等于资源分配；资源分配不等于就绪；完成不等于效果确认。各状态由对应事件推进，指挥部不能直接设ready。窗口采用半开区间，相邻预约可连续，重叠超容量须拒绝或提出替代。

条件变更使承诺进入重新协调或失败，向各方递交通知；未来任务门槛转unknown/not_met，不强行继续。已开始执行的取消请求保留占用直至确认安全结束，释放仅剩余未使用资源。支援优先级平局使用公开规则，不读玩家未提交草案。

玩家在支援板申请、比较替代窗口、接受调整、取消或上报冲突。预约日历只显示玩家有权知道的占用摘要，不透露其他秘密任务。支援方的效果与总部报告由正常消息产生。

验收归属：S13，V051-AT097至104。

## 16 S14 民事友军与行动约束

### 16.1 字段与规则

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| CivilEntity | entity_id、kind、scope、activity_schedule、needs、relationship、knowledge_scope、behavior_profile | 人口、机构、重要设施及中立主体具有自身活动，不是固定障碍图标 |
| PartnerForce | org_ref、capabilities、command_relationship、shared_information_policy、liaison_refs、constraints | 可共享内容与实际共享分别保存；不同组织不默认互知 |
| MissionConstraint | constraint_id、issuer、kind、severity=hard/soft、scope、valid_from/to、predicate、required_evidence、override_policy | 对象确认、保护、地理和时间权限、冲突限制均类型化 |
| ConstraintEvaluation | subject_activity、actor_ref、knowledge_revision、result=pass/hold/deny、evidence_refs、expires_at | 不明硬约束hold，已知违规deny；后台不得用隐藏状态帮助总部判断 |
| ConstraintIncident | event_id、actual_violation、responsible_action、available_evidence_at_time、mitigation、review_status | 实际后果与当时可知程度分别评价 |

### 16.2 交互与可见性

签发、接收及执行分别检查对应主体所知约束，动态变化可中止进行中的活动。总部未知的保护对象不会凭空出现在签发错误；现场发现后现场阻止并报告。硬约束不得因“接受风险”跳过；允许改变的约束必须走有权限、有传播过程的版本变更。

界面显示允许、待确认、禁止及证据；禁止确认不足的活动必须说明可核实的问题。民事变化可影响任务价值和支援条件，评价包含民事与第三方后果。场景法律与权限设置是架空规则，不能从一般公开资料自动生成具体法律裁决。

验收归属：S14，V051-AT105至112。

## 17 S15 席位工作与连续性

StaffDesk按资格、容量、疲劳和公开授权处理工作。StaffWorkItem含id、kind、input_refs、priority、required/remaining_work、interruptibility、switch_cost_ref、interruptions、queue_ticket、assigned_desk、state、overdue。原始报告已到即可读，分析产品只在相应工作完成后产生；不重复收取人工阅读时间。

只有目录声明preemptible的任务允许显式挂起/恢复：processing→suspending→suspended→resuming→processing，切换时间占席位，保留已做工作、耗用、原队列票及历史。不可中断任务拒绝挂起；用户可等待或按合法终止规则显式取消，保留实际耗用，不提前恢复设备/产出。未开始工作可重排，优先级不自动抢占正在处理项。

未开始/已挂起项按目录aging有限提升优先级，相同级按原ticket FIFO；提升不越权、不打断non_preemptible工作。每项挂起次数有明确上界，达到后只能等候或终止，防无限切换。超期保留overdue及underlying_state，不清除历史延误。工作队列实际/总部已确认分开，隐藏工作不通过busy或容量错误露出。

指挥所退化与交接按公开连续性计划改变席位/链路，未决提案、在途撤销与假设保留。提醒只用合法收到证据；确定重复副本折叠但疑似同源不丢弃。验收：V051-AT113–120、224/225。

## 18 S16 工作台地图与交互

### 18.1 界面数据与交互契约

| 对象 | 字段 | 规则 |
| --- | --- | --- |
| WorkbenchState | selected_refs、layers、viewport、active_workspace、history_selector、drafts、pending_operations | 界面状态与运行状态分开；历史读缓存与当前分开 |
| DecisionItem | mission_ref、question、required_by、known_conditions、missing_evidence、allowed_actions、evidence_refs | 只从PlayerView生成，不能把秘密触发器当待办 |
| MapMarker | kind、scope、observed_time、received_time、freshness、source_label、uncertainty、linked_refs | 报告、判断、计划、执行反馈分别表达；计划线不作实际轨迹 |
| PreviewResult | view_revision、editing_seq、estimated_min/max、assumptions、warnings、required_authority、resource_conflicts | 陈旧响应丢弃；输入变更后签发必须重新保存明确版本 |
| MediaSession | report_ref、asset_id、mode、captured/received_time、playback_state、authorized_url | 正常入口禁止未递交附件、缩略图、文件名或私有队列计数泄露 |

### 18.2 工作流程

五个主要工作区为地图、任务板、情报中心、支援保障板、决策日志。任务卡显示缺少的条件及证据，不仅显示颜色。报告与地图双向定位；不同坐标误差、范围、道路和待定位有不同图形与文字。可查看最后确认情况与假设推演，两者明确区分。

提交失败保留表单；不确定结果用同operation_id查询或重试。自动刷新不会覆盖脏编辑，版本冲突要求重新核对。运行时未知状态显示未知，不因真实状态变化自动隐藏任务按钮。

1366×768及1920×1080均可访问主要任务与关键按钮；颜色不是唯一提示，支持键盘选择、文字等价说明及缩放。视频失败不阻止读报告或操作任务。历史模式禁止所有写入，返回当前先刷新；finished真值入口有明确标识。

验收归属：S16，V051-AT121至128。

## 19 S17 保存、恢复与证据复盘

SimulationRun的世界、角色知识、授权/消息、库存/预约、队列/切换、rng、原件/Delivery、收据、进度提醒、cleanup和控制记录共同原子提交。Snapshot不递归包含全部历史；schema_version=4，contract_version=0.5.1，scenario/profile/registry/capability及hash完整。只同schema不足以兼容，V0.5/contract0.5包不得静默装成0.5.1。当前没有实际游戏存档或迁移软件。

resume_latest继续同一局最后已提交状态；restore_copy将旧点克隆为新run_id并保留parent_run_digest/fork_selector和稳定逻辑实体ID，所有所属run引用重映射，不覆盖原局。规则、参数、资源及已采纳模型输出必须兼容且hash通过；缺能力明确拒绝，损坏原件保留。两种恢复都paused，不补墙钟、不重抽已提交rng、不重发已提交效果。rng命名空间保留原逻辑来源，不以新run_id改变已冻结抽样。

未终局只读当时known，truth仅终局授权入口。已通过应用查看同场景真值的重开局标truth_exposure及source_run，不能混为首次公平局；这只记录应用内已知暴露，不声称能测玩家全部记忆。旧点重开不是改写历史。

共同复盘覆盖全部实际有活动/消息/决定/效果的角色，不为零记录者补经历。DebriefEvidenceRef允许kind=report/local_observation/event/decision/ledger/receipt，包含layer、actor_scope、record_ref、record/received_time与digest；这不扩大正常EvidenceRef的战时权限。层为known_then/engine_event/declared_reason/retrospective_inference，声明理由不等同引擎因果。

首版结构化追问选角色、事件和when_known/evidence/when_delivered/why_wait/cost/contradiction；回答仅引用授权已有记录并可跳转。完整版可增加自由文字解析，无法解析返回可选主题/unsupported，不制造事实。反事实默认改单个合法已记录决定，固定起点与可比较随机策略，角色输入仍当时所知；标事后因果实验，原局只读。新上下文不匹配的旧模型候选不能强行复用；新模型/多因素分支标不可单因子归因。

验收：V051-AT129–136、175–184、203、237–240/244。

## 20 S18 场景评价与验证范围

ScenarioDefinition包含冻结组织、地图、profile、初始世界/各方认知、公开简报、目标、授权、条件过程、来源政策和OutcomePolicy。未来事件、完整来源关系和生成解法不下发正常客户端。CapabilityManifest按每项requirement与evidence标not_implemented/partial/implemented/verified，不随阶段编号升级。

软件证据、因果/守恒证据和虚构娱乐体验分别记录。固定模型/已记录输出应可复现；参数敏感性只检本游戏关系，不拟合现实效能。五族各需完整成功、合法调整/中止和失败分支。B01是冻结合成回归，PLAY-G01-01才是首个信息取舍可玩契约；没有运行任一场景。

参考工程包络仍为20主体、10资产、2000地物、每模拟小时10000事件、8模拟小时，Windows11参考机四核/16GB/SSD、读写P95≤500ms、反馈≤2s、初图≤3s，测试时记录型号版本；它们不是普通局负荷或现实效能。安装后的基础局、结构化操作与模板复盘可离线；外部模型仅可选，成功采纳及失败后备分别取证。

普通首轮体验目标为20–30分钟有效游玩、3–5并行任务活动及约3项关键未决，均待实测，不包括管理暂停，不强迫将回归参数调成目标。完整标准局拒绝必要区分证据无法在关键决策截止前通过合法渠道获得的配置；只保证存在这样的路径，不保证玩家取得或必胜。更强不可知风险与自定义参数是以后单独标记类型，不偷换标准局保证。

首轮探索试玩记录真实招募数、每局完成/误解/负荷/解释/重复感和原始意见；8人只为未承诺的招募目标，不是已招到或通过阈值。删除无依据6/8线，不把收齐意见当体验达标。探索后再提出正式门槛、产品负责人审阅并预登记，再做独立正式评审；未有正式依据前experience_goal_met=unknown，experience_reviewed=false。软件/探索完成不声称完整娱乐体验达标或军事拟真证明。

验收：V051-AT137–144、154/194/208、214/241。

## 21 公共模块契约

公共写信封为run_id、operation_id、expected_revision、actor_context和typed_intent；修改对象另带expected_object_revision。actor_context由应用会话解析，调用者不能自选指挥官身份。内部发送消息、审批和主体决策由调度生成，不暴露能直接改真实位置、ready或效果的入口。

| Interface | 输入与行为 | 前置条件及错误 |
| --- | --- | --- |
| create_run | scenario/version、model/version、seed、clock_mode、operation_id；返回公开简报和能力清单 | 配置、模型、能力不足拒绝，不能静默使用简化替代 |
| get_view | 当前或历史时点、工作区筛选；返回PlayerView | 可见性与历史权限；不接受任意actor切换偷看 |
| preview_plan | 草案、view_revision、editing_seq；返回估计、假设和权限缺口 | 只读已知资料，不保证最终执行 |
| save_plan/update_assessment | 明确版本和证据；保存草案或研判 | 不执行、不预留，证据必须已收到 |
| propose_decision | 冻结提案、意图、证据、期限 | 权限审查进入工作队列，不直接伪造批准 |
| issue_order/request_withdrawal | 冻结计划、授权或预授权、接收方、expiry | 登记消息与总部预留，实际接受另有回执 |
| request_collection | 情报问题、范围、期限、精度、候选资产 | 资源与授权冲突不绕过预约 |
| request_support/change_support | 类型、窗口、任务依赖、证据、承诺版本 | 变更走重新协调，不直接设ready |
| request_supply/medical/recovery | typed需求、数量、对象、窗口、确认要求 | 容量、库存和接应条件分别检查 |
| prioritize_work/record_handover | 工作项、优先级、分派或交接快照 | 席位权限及工作状态校验 |
| control_clock | research推进或command速率/管理暂停 | 模式权限与时间单调；原子批次 |
| save_run/restore_run | 已提交状态导出或完整包恢复 | schema、hash、能力与同ID冲突 |
| get_media/get_replay | 报告附件或终局known/truth对照 | 媒体归属、消息已递交、truth权限 |

基础错误为INVALID_REQUEST、NOT_FOUND、VERSION_CONFLICT、OBJECT_VERSION_CONFLICT、OPERATION_ID_REUSED、HISTORY_READ_ONLY、RUN_FINISHED、AUTHORITY_REQUIRED、AUTHORITY_DENIED、EVIDENCE_REQUIRED、CONSTRAINT_HOLD、CONSTRAINT_DENIED、CAPACITY_CONFLICT、INSUFFICIENT_STOCK、MESSAGE_NOT_DELIVERABLE、MESSAGE_EXPIRED、COMMITMENT_STALE、STATE_CONFIRMATION_REQUIRED、MEDIA_NOT_AVAILABLE、TRUTH_FORBIDDEN、SAVE_INCOMPATIBLE、SAVE_CORRUPT、RESTORE_CONFLICT、CAPABILITY_UNAVAILABLE、STORAGE_RETRYABLE。细节只含合法已知事实；隐藏对象查询统一不可用。

成功写返回operation_id、resulting_revision、operation_seq、result和当前PlayerView；重复请求返回原结果并要求刷新当前，避免旧结果覆盖新视图。HTTP结构400、公开资源404、业务409、暂时存储503，媒体隐藏统一404。界面收到成功只表示对应行政操作成功，不把“申请成功”显示为支援到位。

## 22 完整验收与阶段范围

本稿244项V051验收均not_run，编号001–208对应V0.5相同序号但行为有明确修订，209–244为新增；旧V05通过不继承。每项唯一主任务，完成阶段复验不是第二归属。七阶段、14任务仍planned，首可玩C0必须跨最小真实规则、消息、连续地图、证据选择、目标/收尾、保存和模板复盘的垂直链；局部无移动算术夹具只能叫工程回归。

I01先实现该场景所需的有限契约，I02–I13补全各系统状态与边界，不以“后面任务没做”为由在I01直写success、假反馈或绕过原子性。第一版corridor路径不是完整版free_surface范围上限；后者为I04完整出口必验。阶段只声明实际覆盖，不用not_applicable遮掩必需能力。现行规格已审；冻结和产品实施仍须产品负责人另行明确授权。

## 23 通用依据与来源限制

以下仅用于一般信息加工、分析表达及来源数据模型，不证明真实特种作战有统一先去重流程。以下公开来源只作通用方法参考，不导入现实战术或行动步骤。

| 来源 | 采用的通用原则 | 不作的推断 |
| --- | --- | --- |
| [How the IC Works](https://www.intelligence.gov/how-the-ic-works)的Processing/Analysis段 | 加工整理与分析判断是不同活动 | 不推出递交给所有使用者前已彻底去重 |
| [2005 WMD Commission历史报告](https://www.govinfo.gov/content/pkg/GPO-WMD/pdf/GPO-WMD-1-6.pdf)，第135/137页PDF | 重复、未知来源及循环转述可导致虚假印证 | 历史失败案例不是现代统一任务流程 |
| [ICD203](https://www.dni.gov/files/documents/ICD/ICD-203.pdf)，PDF第3–5页 | 区分信息、假设、判断及来源不确定性 | 不导入真实任务门槛或概率作为游戏效能 |
| [W3C PROV-DM §5.2](https://www.w3.org/TR/prov-dm/) | 区分派生、引用、修订及原始来源关系 | 关系存在不表示独立来源或内容真实 |

原V0.5引用的NASA-STD-7009B、PCG教材第12章及arXiv:2404.11891v3只保留用途/验证方法参考；本稿不声称符合整套标准或移植研究效果。已审地图范围保留“第一版A、完整版B”；数值仍为设计假设或待实测目标。原始讨论及审批记录不在公开范围。

## 24 用途、审阅状态与版本

本稿是单人、中文、虚构军事题材情报/参谋娱乐游戏的V0.5.1已审规格公开版。拟真来自一致世界规则、不确定性、角色认知和可解释后果，不承诺现实任务预测、军事训练或真实器材参数。教学延期；操作说明和复盘不等同教学产品。保留十八系统、六Module。

review_state=owner_review_passed、frozen=false、implementation_state=not_implemented、acceptance_state=not_run。原V0.5文件及Word/PDF保留为历史基线，本稿完整修改各权威正文，不靠另附解释覆盖矛盾。参数使用FIC-BASE-01/version2或FIC-PLAY-01/version1的完整resolved注册，旧v1只供原V0.5历史参照；B01另为B01-LEGACY-01。不同档不在运行中混用。

## 25 地图表达、路径和可见性

几何定点精度0.01fictional_metre，允许容差0.1；height_band为flat/low/high虚构等级，occlusion_class为transparent/partial/opaque。观测线与注册遮挡几何求交，结果clear/partial/occluded/unknown；不表达武器射界或现实路线。SpaceNode/SpaceLink明确父子/入口/时长/容量，同一世界时钟。

MapPresentationProfile含缩放档、图层默认、标记样式/聚合/文字优先级、图例。默认公开地形、最新合法已知、玩家研判与确认反馈；草案线仅计划工作区。低缩放仅已知区域及合法聚合，中缩放轮廓/误差，高缩放仅授权已知嵌套空间。隐藏设施没有数量、面积占比、空白占位或缩略图。

误差范围不吸附到建筑中心；旧报告保留观察/报告/收到时点及unknown标签，过期降低强调不删原件。确定副本的显示聚合与地图空间聚合分别命名，后者只统计可见记录，不等于独立证据数量。历史模式用当时合法几何知识，不把当前建筑变化回填过去。

第一版必须已有连续corridor地图、合法路线预览与实际位置过程；完整版free_surface的可通行面折线、跨地形成本和入口检查必须补齐。规则与渲染同geometry_version，资料陈旧明确标注。显示退化可保留文字，不能换成不同世界规则。

## 26 虚构角色与装备资源

### 26.1 能力目录与资源类型

| 对象 | 必须字段 | 校验与行为 |
| --- | --- | --- |
| FictionalRoleProfile | role_kind/version、capability_refs、slot_count、qualification_scale、permitted_activity_kinds | 使用虚构岗位；目录仅定义记录、联络、作业、检修与保障等抽象能力，不提供真实队伍配置 |
| AbstractEquipmentProfile | id/version、capability_refs、load_units、space_units、energy_capacity、durability_max、use_rules、maintenance_ref、exclusive_group | load_unit、space_unit、energy_unit和wear_unit为本游戏不可互换的抽象量纲；参数不得来自真实装备清单 |
| LoadState | holder_ref、equipment_refs、supplies、load_capacity、space_capacity、computed_load、computed_space、confirmed_time | 总量由物品数量与目录单件属性计算，不接受客户端提交汇总值；人员与运输容量另算 |
| EnergyAccount | equipment_ref、capacity、stored、reserved、source_refs、ledger_refs | stored不超过capacity；执行预留与消耗有独立账项；能源不能兑换维修用品 |
| WearState | equipment_ref、durability、condition、last_use_event、maintenance_event_refs | durability为0至durability_max；每次合法使用有wear_cost；同事件不重复磨损 |
| EquipmentTransfer | id、from/to、item_refs、quantity、request_time、handover_time、acceptance_time、state | proposed/approved/in_transit/received/rejected/cancelled；received事件完成两端原子转交，途中仍属原持有方责任 |
| MaintenanceActivity | subject_ref、provider_capability、required_items、work、restoration_amount、state、cause_refs | 维修消耗时间及专用品，恢复不超过目录上限；未完成不会提前恢复能力 |

所有动态值按主体实际与总部已确认两份维护。角色与装备共同赋予能力；角色不可用、设备失效或缺能源只使对应能力不满足，不自动抹去其他独立能力。已安排活动用capacity/concurrency_group预约，不按“一个人只能做所有事情中的一件”全局锁定。

### 26.2 任务变更与联动

保存装备草案只校验目录与已知容量，不转交、不启用、不预留。批准后执行真实转交或装载过程；完成确认才更新总部能力。移动途中或能力被占用时，装备变更必须走可见的延迟与冲突规则，不通过修改清单瞬间完成。

改变任务或移走装备会重新检查受影响活动的能力、载荷、能源、耐久和预约。新草案显示已知缺口；现场按本地状态再检查，真实差异通过反馈传回。耗时受载荷影响的函数在参数档明确，只用于虚构游戏节奏。传感或联络设备损坏不应暗中改变其他岗位资格；维修用品不足时保持受阻且列明缺口。

库存守恒按品类、所有者与单位检查；装备数量、能源账、磨损事件和能力变更一并提交。损耗与天气、疲劳等同名原因共享cause_id，防止重复叠加。具体目录和独立算术在参数附录，不要求玩家了解现实装备知识。

## 27 有限信息 AI 角色

### 27.1 角色权限与表达

AI包含离线规则Adapter和可选外部模型Adapter；二者输出相同CandidateIntent契约。Game负责合法性和状态变更，AI负责候选意图或表达。外部模型不是基础离线游戏的依赖，不向模型开放World、未来事件、其他角色私有记录、随机流状态或文件读取工具。

| 角色 | 允许读取 | 允许提交 | 需要Game裁决的事实 |
| --- | --- | --- | --- |
| 系统指挥官 | 自己收到的提案、意图、授权及席位摘要 | approve/deny/request_evidence的审查候选与解释 | 授权范围、冻结版本、约束和审查工作是否实际完成 |
| 情报席位 | 已分配资料与来源链、自身队列 | analyze/request_clarification的候选及带引用文字 | 是否形成合法分析产品；模型不能生成新的观察 |
| 通信及保障席位 | 合法链路、确认账、承诺和工作项 | prioritize/notify/request_confirmation候选 | 传输、转交、准备和库存的实际结果 |
| 我方编组负责人 | LocalActorView、本地任务与预授权 | continue/hold/request_guidance/adapt/abort等目录内候选 | 活动范围、能力占用、时间与约束 |
| 敌方虚构角色 | 自身目标、独立观察、收到消息及记忆 | 目录内通用游戏活动候选及有限信息表达 | 不能查询玩家草案、全图或隐藏身份；规则不提供现实对抗政策 |
| 友军及联合方 | 自身目标、授权与实际共享记录 | cooperate/ask/decline及支援承诺候选 | 协调、占用和确认必须经真实游戏消息产生 |

各角色分歧来自所知、目标、工作负荷与目录内性格参数；不能用随意失败覆盖硬约束。AI的理由是声明，客观因果由引擎事件提供。语言层只有被验证的Claim可以陈述为事实；推断附不确定标签，无证据时回答未记录或无法确认。

### 27.2 候选与调用字段

| 对象 | 必须字段与类型 | 状态和限制 |
| --- | --- | --- |
| ActorDecisionPolicy | role_ref、allowed_intent_kinds、trigger_kinds、cooldown_ms、priority、adapter_mode、fallback_ref | 触发仅新合法证据、期限、活动受阻、协调请求；禁止每帧调用；策略版本冻结 |
| DecisionRequest | id、actor_ref、knowledge_revision、view_digest、request_seq、logical_slot_time_ms、valid_until_time_ms、allowed_intents、evidence_refs、model_profile_ref | queued/dispatched/responded/timed_out/cancelled；身份由Game生成；只传合法快照 |
| CandidateIntent | request_id、actor_ref、knowledge_revision、kind、typed_payload、evidence_refs、declared_reason、claim_refs | kind必须在白名单，所有引用已在该请求视图；无任意世界patch、外部工具或脚本 |
| DecisionValidation | request_ref、payload_digest、result、reason_codes、validated_revision、accepted_intent_ref | accepted/rejected/stale/duplicate；校验结构、身份、版本、证据、权限、资源、状态和时限 |
| ModelInvocationRecord | id、model/version、prompt_template_hash、sanitized_input、input_digest、raw_output、parsed_candidate、usage、latency_ms、failure_kind、validation_ref | 完整保存本局输入输出；密钥不入记录；实际用量可未知但必须显式标记 |
| AIControlRecord | actor_ref、requested_mode、effective_mode、control_message_ref、requested/accepted/effective_time_ms、pending_request_refs、changed_by | 请求与生效分离；友方控制经正常消息，不新增总部视图；敌方不可接管 |

外部调用最多每角色一条在途请求，全局最多四条。请求冷却为参数档规则；高优先级不绕过权限。模型响应的数值只作候选，预估时间、能力和效果由引擎重新计算。语义拒绝不会改世界，也不增加授权。

### 27.3 异步裁决与失败

调用在后台执行，不阻塞Game单写批次。所有决策在预定logical_slot_time_ms裁决；在相同时点前到达的有效响应依请求序号处理，迟到、旧knowledge_revision、旧任务版本或已取消请求记录stale。所有角色在该批次使用同一提交前快照形成候选，不能因网络返回先后获得额外信息。

到逻辑决策时点仍无有效响应，使用本槽统一提交前的合法角色快照运行离线规则后备并记录fallback；请求仍有效时与其快照一致，请求陈旧时记录新的受限输入摘要，不应用旧候选。墙钟超时、断网、格式错误、越权、证据缺失、超预算均产生明确记录，不制造任务失败或新事实。规则后备只提交合法的等待、请求确认、按已授权安排继续或中止候选；实际结果仍由Game裁决。旧响应到达后不能替换已采纳后备。

外部服务恢复不自动重做过去决策；从下一合法触发继续。控制消息生效后才取消该友方角色在途自主请求，保留日志；接管仍只用总部视图并经正常消息签发意图，返还同样需显式请求和确认。模型模式切换、外部失败和后备使用在复盘可查，不能伪装模型独立决定。

### 27.4 重放与预算

recorded_replay直接重放已采纳CandidateIntent与ModelInvocationRecord，不调用模型。regenerate_branch建立独立分支，记录新模型配置、输出和起点；不承诺相同seed可重现外部模型回答。确定规则Adapter用独立命名随机流重现，随机流与文本表达相互隔离。

BudgetProfile包含calls_per_run、max_input_units、max_output_units、concurrent_limit、wall_timeout_ms、per_role_cooldown_ms、cost_limit及cost_unit。默认基础局rule_only；启用外部模型前显示联网依赖、用途、数据范围和用量上限。价格配置是用户选择的外部服务资料，不写入虚构能力参数；无价格资料显示未知，不推算虚假费用。

## 28 所有参与角色共同复盘

### 28.1 四种证据层与会话

每局结束后自动形成DebriefSession。首版追问为结构化主题；完整版自由文字若增加，也只查询授权已有记录，解析失败返回选题/unsupported。参与名单来自本局实际有活动、消息、决定或效果的角色；零记录角色列为未参与，不生成经历。指挥官、席位、我方编组、敌方虚构角色及联合方均可拥有独立陈述。复盘是终局只读工作区，战时权限不因此解除；重开未终局存档仍不能读复盘真值。

| 对象 | 必须字段 | 规则 |
| --- | --- | --- |
| DebriefSession | id、run_digest、finished_seq、participant_refs、agenda_items、evidence_policy、statement_refs、question_refs、schema_version | created/ready/viewing/archived；世界不可写；原局证据及版本固定 |
| DebriefEvidence | id、layer、actor_scope、record_ref、record_time、received_time、digest | layer为known_then/engine_event/declared_reason/retrospective_inference；各层不可相互覆盖 |
| RoleStatement | actor_ref、decision_ref、claim_list、declared_reason_ref、speaker_mode、source_refs、created_time | 陈述当时所知、选择和声明；speaker_mode为recorded/template/model；缺理由显示not_recorded |
| DebriefClaim | kind、text、evidence_refs、certainty_label、validation_result | observation/action/outcome/reason/inference；客观事实需事件或报告支持，推断单独标注 |
| DebriefQuestion | asked_by、target_actor_ref、topic_refs、answer_ref、state | queued/answered/insufficient_record/rejected；超出记录可回答不确定，不补写历史 |
| CounterfactualBranch | parent_run_digest、fork_selector、changed_decision_refs、model/seed_policy、invocation_records、branch_outcome | 原局只读；分支显著标识；后续知识不带回当时输入 |

议程固定为任务与结局、关键消息时间线、参与角色依次陈述、矛盾与协作断点、玩家问答、独立分支比较。玩家可以按角色或事件切换，而非必须播放所有长台词。地图同步显示该角色当时已知范围，真值对照另层标记。

### 28.2 陈述与评价

事实时间、收到时间和声明时间并列。角色的声明理由不证明引擎因果；客观因果来自cause_ids，未记录的心理活动不追认。复盘可以显示敌方当时认知，但必须标明这是终局已解锁记录。多个角色矛盾同时保留，不让AI根据真值替他们重写当时陈述。

模板与模型都只能将引用记录组织成表达。每个客观Claim由校验器检查来源、时点与层级；不存在记录、引用不匹配或把迟到信息带回早期时点时，删去客观声明并改为无记录提示。单纯语言相似不能替代证据验证。

玩家可追问“何时知道、依据什么、发出后何时收到、为何当时等待”。回答跳转到原始报告、消息、合法决定和账务，不提供现实行动建议。DecisionQuality按第30章仅使用当时合法可知证据，结果不佳与决定质量不合格分别显示。

无网络时用同一记录和模板完成全部复盘；可选AI只改变表达，不能改变评分、事件或参与名单。重复打开读取已保存陈述；主动重新表达生成新版本并保留旧版，同样引用固定记录，不重调模型改变历史。导出复盘同时保留来源链接与证据层文字等价说明。

## 29 受约束虚构场景生成

### 29.1 生成对象与顺序

| 对象 | 必须字段 | 规则 |
| --- | --- | --- |
| GenerationRequest | id、generator/version、seed、profile/version、family、scale_envelope、difficulty_band、external_text_mode | offline_default；请求不含真实地理数据、实际组织或行动目标 |
| GenerationManifest | request_digest、root_seed、attempt_seed、attempt_index、generator/version、profile/version、stream_algorithm/version、stream_states、parameter_hash、geometry_hash、world_hash、objective_hash、information_model_hash、asset_hashes、adopted_model_output_refs | 所有注册输出冻结；文本及模型输出另存；一个种子不是完整复播凭证 |
| GeneratedWorld | map_definition、abstract_actor_profiles、inventory、public_baseline、initial_private_state、external_processes | 实体、几何、能力、资源共享同一版本；公共简报只投影可公开部分 |
| PlayabilityContract | required_objectives、deadline_windows、capability_requirements、minimum_legal_evidence、allowed_partial_exit、witness_ref | 存在合法游戏完成路径，并在每个必须区分的关键决定截止前可通过正常渠道取得必要证据；不把隐藏答案当玩家提示 |
| GenerationCheck | geometry/references/units/resources/time/authority/evidence/termination结果、reason、witness_digest | pass/reject/unverified；未验证不可作为正常完整局发给玩家 |
| SeedBatchEvaluation | generator/profile/version、seed_set、accepted/rejected_counts、failure_reasons、diversity_metrics、playability_results、latency、review_records | 记录全部尝试，不挑选成功样本；设定阈值先于运行，未运行不写通过 |

顺序为生成合法几何与层级空间、配置虚构角色与抽象库存、绑定可验收目标及授权、配置环境与事件过程、建立各主体初始认知、安排观测与消息过程、生成文本与媒体引用、独立检查、冻结注册、最后公开简报。未来报告由实际观测、处理与传输产生；故事文本不得直接制造世界事件、身份或结局。

每局可改变地形组合、建筑布局、设施状态、任务目标组合、虚构岗位能力、抽象库存、来源链、报告延迟、错误机制及角色偏好。变化在参数档与约束内采样，不独立乱改互相依赖字段。固定B01和G01仍可选择，用于回归和比较；随机局不是把固定局改名称。

### 29.2 有效性与无解处理

Geometry合法、引用存在、单位相容、授权足够、库存与容量守恒、消息与观察时序合法、目标组合不互相排斥、结束条件可触发才可通过。可玩性检查还要形成至少一条合法游戏路径的witness及每个关键决定的证据到达时限证明；这只证明场景约束可满足，不证明玩家一定成功或足够有趣。解法见证为私有测试资料，不下发客户端或提供给角色AI。

采用有界生成检查：每个请求最多20次派生尝试；每次attempt_seed由根seed、generator_version和attempt_index稳定派生。拒绝保留原因；超过上限返回GENERATION_EXHAUSTED，不静默换难度、不伪造成功、不改原seed。可显式选另一seed或已注册固定场景，作为新请求记录。

正常局只接受GenerationCheck=pass；实验局unverified需独立标签，不计正式随机局通过。合法中止或有限成果是游戏内结束路径，不用于掩盖开局必定无解的主要目标。权限未知、证据不足或资料采集失败不能因生成器真值而被角色自动绕过。

### 29.3 随机流与评估

命名流至少包括geometry、roles、objectives、environment、observations、report_errors、messages、actor_choices和flavor_text。新增文字不能改变天气或误报抽样。流算法与版本记录在Manifest，不使用未记录的系统随机数。外部模型只可表达冻结世界或提出待验证的内容候选；被采纳输出随Manifest保存，不在恢复时重新调用。

首轮批量检查100个预登记seed，随后1000个独立seed及边界参数组合；这是游戏工程设计门槛而非统计真实性认证。所有已发给玩家的局硬不变量失败数必须为0；生成尝试拒绝率如超过20%必须修正或说明限制。评估地图几何差异、目标依赖差异、合法证据到达差异、资源竞争、角色分歧及结局分布，不只比较输入难度标签。文本差异不计结构多样性。

探索试玩使用明确版本场景的顺序交换和成对比较，记录地图可信感、角色一致性、信息解释与重复感；教学不纳入本轮目标。批量统计、探索反馈与以后正式体验评审分别报告，不能从低拒绝率推断有趣。数据档列出包络、样本、拒绝项和未测组合。

## 30 终局、总部进展提醒与决定质量

### 30.1 终局与收尾

OutcomePolicy含主要/可选目标、硬终局条件、deadline_time_ms、settlement_grace_ms、cleanup_required/cleanup_deadline_ms、partial_rules、evaluation_profile_ref。技术故障暂停无游戏评分；同批次按有效硬终局→主要目标及必须交接/验证全部完成确认→明确期限/合法中止条件结算。无可见进展不是强制结束条件。

success必须满足主目标实际动作、验证、交接及公开收尾义务；optional未满足不改变主成功。partial依本场景公开有限成果组合；aborted为合法中止生效而未达partial，无更高硬終局；failure为明确硬失败/期限/有证据的不可恢复阻塞且未达partial。评估列成果、回收、约束及代价，不抹去已得成果；faulted不是failure。

deadline是实际目标动作截止；每个必需作业、交接及验证必须在此前完成。宽限只收截止前已完成结果的迟到回执，不能继续补作业/验证/交接来凑成功。普通世界仍按规则演化，评分截止与之后发生的未计入成果分别记录；特殊结算窗必须开局明示。硬条件适用窗口由场景预登记，不以宽限期间新发生情况倒改已结束的评分窗口。

合法任务中止是消息，不立即改远端；接受后停止新增主目标工作。有公开收尾义务时run进入terminating，继续授权回收/交接至预定cleanup_deadline；无义务才可即finished。中止尾声可计独立回收向量及partial规定的人员交接，不补主目标成果。退出应用只是保存。终局冻结未完成活动/预约及原因，不假装资产已释放、人员已交接或安全；原局不再推进。

### 30.2 总部无可见进展仅提醒

NoVisibleProgressWarning使用本局主目标相关、总部已可见的新有效证据、已确认进度、接受的协调/承诺变化和公开长等待条件。120000ms静默只显示“暂无新增总部反馈/可核实待办”，不是“现场没有工作”，不能据此判失败。重复读报、同源转发和无关活动不重置。正常已接受长活动/承诺在公开时限内可免提醒；延期只依据新收到的合法承诺，deadline仍有界。

实际活动可能正在进行而未上报；引擎内部进度、未来消息及来源真值不进入提醒原因/精确计时。强制结束仅明确deadline、合法终局或当前证据可验证的不可恢复阻塞。标准局若不可恢复阻塞尚无总部合法依据，只保持未知/待反馈至合法条件，不通过提前失败泄漏隐藏原因。

### 30.3 留痕、量表及事后实验

关键签发/改令/中止自动记录合法视图摘要、实际操作/版本/权限及时间；玩家可选引用、理由和替代解释，重大决定提示补记但不阻断提交。理由未记显示not_recorded，不能事后补编为当时声明；可另存明显标注的retrospective_inference。

四维为证据纪律、权限合规、协调完整、版本一致，各0/1/2或not_evaluable，无默认总分/排名。缺评估必要记录则not_evaluable；有完整记录违反当时已公开对应规则可记0，部分满足记1，满足记2，每项引用规则及当时证据。仅仅没写理由不是违规，也不以最终成功补证据分；“能看到所有报告”不等于实际引用所有。

默认反事实改变单个合法决定，保留原局/起点及可比较随机策略，标事后因果实验。因观察过真值的玩家可有事后选择，不冒充首次公平再赛；角色输入仍当时所知。多因素或新模型配置不能作单因子归因。

## 31 不确定性、原始陈述与纠正

来源reliable/variable/unknown、质量clear/limited/inconclusive、confirmation indication/supported/confirmed/disputed分别表达。来源关系可见性和内容确认不是一回事。相同内容不证明同源；不同渠道或不同署名不自动证明独立；supported要求有合法凭证的两个独立相容有效观察，confirmed按注册可观察识别条件。未知来源关系保持unknown。

Report保存原始陈述，Assessment保存作者判断、假设、替代解释、已引用证据和版本；系统整理只作已知证据结构化提示。CorrectionRecord关联新报告、supersedes、字段、理由/依据和effective_knowledge_seq，改变之后投影，不改原报或旧判断。较新低质量与旧高质量并存，冲突不由隐藏真值择优。

ReportErrorProfile限定false_positive/false_negative/misclassification/spatial_offset/time_offset/omission，注册触发、独立流、率或固定schedule、quality影响、披露和纠正可获得性。角色差异来自合法信息、负荷、偏好与能力约束，不新增无记录的随机怠工或迟疑。标准局的必要区分证据须在关键决策截止前存在合法获得路径，错误可造成风险但不能把理论真值解法冒充可辨识玩法。

## 32 参数、判定与审阅闸门

ParameterRegistry每项有id/version、owner_system、type/unit、default、allowed_range、source_type=design_assumption、source_ref、intended_effect、sensitivity_relation、calibration_status=uncalibrated。运行仅加载完整resolved档及hash；继承/覆盖只是作者生成完整档的来源记录，不能在运行时混档或隐含fallback。类型缺失、量纲错、目录缺规则一律拒绝。

新档明确时间控制、KnownLineageLink/KnowledgeTime、消息分类、工作抢占/aging、接管消息、模型槽、提醒/尾声/评分、保存contract版本及生成见证策略，见参数附录。首可玩的完整输入和两条合理路径及独立时间预期见场景附录；每条验收有冻结前提、动作、可判定输出和唯一主任务。独立预期不从引擎结果复制。

文档核验只查当前文件、版本引用、244项唯一归属、14票真实依赖和语义一致性；软件/浏览器/批次故障/外部模型/生成seed实验均未运行。探索先收反馈再预登记正式体验门槛，8只是招募目标且实际可不同；不存在6/8达标线。当前design_defined只表示已审设计内容已定义，不等于frozen或体验达标，software_verified=false、experience_reviewed=false、experience_goal_met=unknown。

已审地图范围保留第一版A/完整版B；20–30分钟、3–5活动、约3未决及新增切换/aging值仍为待实测设计假设。冻结及第一可玩实施须另获产品负责人明确授权；当前产品未实现、未运行，公开同步不启动产品开发。

公开范围说明：本包保留产品规则、参数、场景、244 项验收及原七阶段十四任务对照。历史版本、逐题讨论、审批原始记录、私有任务单、执行日志、工具配置和技能源码不在公开范围。涉及 V0.5/B01-LEGACY 历史夹具的条目只保留引用含义；历史输入未随本包公开，后续验证须另行取得获准且完整的版本化输入，不用当前 FIC 档替代。
