# V0.5.1 虚构参数与独立预期（已审规格公开版）

公开版说明（2026-10-12）：现行 V0.5.1 产品规格已审（review_state=owner_review_passed），frozen=false、implementation_state=not_implemented、acceptance_state=not_run。六阶段小批方案仍为 plan-draft/not-authorized，尚未实施；244 项产品验收均未执行。公开同步只发布这八份设计与计划文档，不授予产品开发、冻结或运行验收权限。

status=owner_review_passed；frozen=false。FIC-BASE-01/version2，source_type=design_assumption、calibration_status=uncalibrated。数值只服务虚构娱乐游戏和软件一致性，不代表现实任务/人员/设备参数。

## 1 量纲、完整配置和统一参数

世界坐标fictional_metre（图上米），SimTime毫秒；load/space/energy/wear/work_unit及item/person/seat独立量纲，不能兑换。作者侧将基档及显式覆盖展开为完整resolved配置、parent_ref和hash；运行只加载一种完整档，不混档或隐含fallback。局内配置不可改；当前文档本身未冻结。

以下每行唯一ParameterRegistry.id；entry_version=2，owner_system为ID前缀，source_ref=本附录节号/ID，source_type=design_assumption，calibration_status=uncalibrated。实际类型按值/枚举/规则与单位定义；表中未写随机分布的值均常量。允许范围明确时只能范围内配置，否则取已列举值/规则，缺项拒绝。

| Registry.id | 类型/单位 | 默认/允许值 | 规则或独立预期 |
| --- | --- | --- | --- |
| S01 clock.quantum | Duration/ms | 1000ms；按所有到期事件拆批次 | 100至5000ms；步长不改变同时间线结果 |
| S01 clock.rates | enum set/simulation_rate | research暂停或显式推进；command速率1/2/4 | 只取已注册速率；离线墙钟不补算 |
| S01 activity.min_duration | Duration/ms | 1000ms | 1000至60000ms；完成晚于开始 |
| S02 authority.review_work | WorkQuantity/work_unit及WorkProfile | 2 work_unit；一个席位每10000ms处理1 | 1至20；积压增加等待不自动批准 |
| S02 authority.window | TimeWindow/ms | 每条授权显式from/to及action目录 | 无默认无限授权；半开窗口 |
| S02 risk.scale | enum/ordinal | ordinary/caution/restricted/unknown | 只定义虚构约束，hard不被风险接受覆盖 |
| S03 objective.deadline | Duration/ms及receipt_grace_ms | G01为600000ms；宽限10000ms | 300000至1800000ms；宽限只收旧成果确认 |
| S03 phase.work | typed template/work_unit | record=4、repair=6、handover=2 work_unit | 各1至20；活动资格、时间与物资先复核 |
| S03 setup.duration | Duration/ms | 5000ms，每个新的作业活动一次 | 1000至20000ms；同cause不重复准备 |
| S04 map.extent | rectangle/fictional_metre | [0,1200]×[0,900]fictional_metre | 单边300至3000；所有几何在extent内 |
| S04 map.precision | fixed decimal/fictional_metre | 0.01fictional_metre；容差0.1 | 精度固定；世界坐标与画面分开 |
| S04 hierarchy | acyclic typed hierarchy | world→district→site；最多3层 | 层级无环；入口link非空、同坐标系 |
| S04 movement.base | fixed decimal/fictional_metre per second | 4 fictional_metre/second | 1至8；图上长度决定基本工作，不是现实速度 |
| S04 terrain.factor | enum-indexed rational multiplier | plain=1、rough=1.5、closed=不可通行 | 1至3；相同环境cause不重复倍率 |
| S04 occlusion.rule | registered geometry predicate | opaque相交→occluded；partial相交→partial；缺几何→unknown；否则clear | 确定规则；只用于观测，非武器模型 |
| S05 environment.level | enum | calm/impaired/severe | 目录固定；变化由注册过程产生 |
| S05 work.factor | enum-indexed rational multiplier | calm=1、impaired=1.25、severe=1.5 | 1至2；每消费者一次；变化不清除已完成工作 |
| S05 observation.effect | enum-indexed result | clear→正常；partial→limited；occluded→inconclusive | 非所有采集方式同一失效规则 |
| S05 report.validity | Duration/ms | 当前环境60000ms，预报显式窗口 | 30000至300000ms；过期不恢复正常 |
| S06 team.slots | integer/person | 每队3虚构岗位；role目录见第2节 | 1至6；资格按岗位与设备同时满足 |
| S06 team.capacity | Quantity/load_unit和space_unit | 20 load_unit、12 space_unit | 8至40、6至24；总量按单件计算 |
| S06 fatigue.scale | ordinal integer及WorkProfile倍率 | 0至4；每完成4 work_unit加1，休整30000ms减1 | 不能低于0或超过4；>=3工作率×0.75 |
| S06 stress.scale | enum及WorkProfile倍率 | steady/strained/unknown；只用已记录条件 | strained处理工作率×0.8；不任意违反hard |
| S06 equipment.condition | wear threshold/rate rule | durability>=40工作率1；1至39工作率0.75；0失效 | 初始上限100wear_unit；退化只影响对应能力 |
| S07 stock.items | enum/item_kind | record_pack、repair_pack、maintenance_pack、care_pack各item独立 | 无兑换；数量非负；转交两端原子 |
| S07 supply.work | typed template/work_unit | 分配1work、交接1work；运输另登记 | 不把approved当入库 |
| S07 care.rule | registered typed template | 类别none/limited/urgent；care需资格、1care_pack和3work | 缺能力blocked；不作为真实医疗方案 |
| S07 recovery.rule | registered ConditionExpr及work_unit | 接收方确认＋person/seat容量＋交接2work | 人员移交与成果验证分别形成事件 |
| S08 collection.work | typed template/work_unit | record观测2work；处理1work | 1至10、1至10；采集、处理、收到分开 |
| S08 freshness | enum-indexed Duration/ms | position=45000、facility=120000、analysis=90000ms | 30000至300000ms；不同类型不同年龄 |
| S08 reliability.scale | enum | reliable/variable/unknown | reliable不保证内容正确 |
| S08 quality.scale | enum | clear/limited/inconclusive | failed空范围不能not_detected |
| S09 confirmation.scale | enum及evidence predicate | indication/supported/confirmed/disputed | supported需2独立相容有效源；confirmed需注册识别条件 |
| S09 identity.rule | registered evidence predicate | record_key在clear观测中被核对且匹配登记别名→confirmed | 无识别证据只indication；后台ID不参与认知 |
| S09 position.error | error_radius/fictional_metre | clear半径10、limited半径40fictional_metre；inconclusive无位置 | 0至100；正误差不能画确定点 |
| S09 memory.growth | growth rule/fictional_metre per Duration | 过期后每30000ms扩展20fictional_metre，最大300 | 0至300；身份假设与当前位置分开 |
| S10 link.text | enum-indexed Duration/ms | 正常1000ms，退化5000ms，断开不送达 | 明确payload类型；不凭内部完成改总部状态 |
| S10 link.media | integer/byte per second | 1000byte/second；文本优先，媒体可分帧 | 100至10000；排队计数对外只合法摘要 |
| S10 message.expiry | Duration/ms | 默认120000ms，明确到期时点 | 10000至300000ms；过期不开始活动 |
| S10 silence.policy | enum及send/receive policy | normal/receive_only/silent/emergency_allowed | send/receive独立；定位可继续 |
| S11 rule.preference | enum及stable candidate ordering | confirm_first/task_first/conserve；仅合法候选间的固定优先序 | 角色档冻结；平局稳定request_seq；非现实对抗政策 |
| S11 hold.limit | Duration/ms | 60000ms，之后按已注册fallback | 30000至180000ms；新授权不凭空产生 |
| S11 ai.slot/cooldown | typed Duration/pending limits | 逻辑决策槽5000ms；每角色冷却10000ms | 单角色1在途、全局4；按槽裁决 |
| S11 ai.wall_timeout | duration/ms | 10000；1000–60000 | 只终止外部调用，不改变SimTime或角色时间规则 |
| S11 ai.input/output | integer/text_unit | 8000/1500 text_unit上限，实际token另记录 | 目录限制；不承诺text_unit等于token |
| S12 abstract_effects | enum/effect_kind | work_progress、temporary_unavailable、access_contested、device_wear | 不配置真实武器、杀伤概率或射界 |
| S12 effect.duration | Duration/ms | temporary_unavailable=30000ms，需新条件复核恢复 | 10000至120000ms；同时作用同时结算 |
| S13 provider.capacity | integer/asset,seat及work_unit | 一提供方1预约执行资源、6seat；ready需2work | 容量按半开窗口；审批、就绪、完成分开 |
| S13 commitment.expiry | Duration/ms | 120000ms；条件改变renegotiating | 不用批准时间推断就绪 |
| S14 constraint.directory | enum及ConditionExpr | 保管完整、受保护虚构设施不改写、场景区域授权、容量 | hard未知hold，明确违规deny；非现实法律裁决 |
| S15 desk.capacity | WorkProfile及integer/concurrency | 各席位1work/10000ms；每席位1执行项 | 优先级0至3；相同级FIFO，未开始可重排 |
| S15 handover.work | WorkQuantity/work_unit | 1work；未确认内容保持未决 | 不删除在途撤销或假设 |
| S16 map.scale_bands | fixed decimal thresholds | low<0.8、medium=[0.8,2)、high>=2 | 世界不受缩放影响；文字等价与图例可查 |
| S16 marker.aggregate | registered geometry rule/pixel | 同层同类屏幕距离<=18px才聚合 | 只合法记录；来源、年龄、误差仍可展开 |
| S17 snapshot.interval | Duration/ms | 每30000ms或重大操作建立可恢复点 | 10000至120000ms；提交仍每批次原子 |
| S17 save.schema | positive integer/version | 4，保存AI请求、生成Manifest、复盘引用及所有原状态 | 旧schema3只读回归另注册，不能默默载入 |
| S18 outcome.priority | ordered enum/predicate set | fault暂停→hard_end→success→合法deadline/abort或可验证不可恢复阻塞 | 同一批次稳定；partial规则显式 |
| S18 visible_progress.warning | duration/ms | 120000；60000–300000；只reminder | 私有实际活动不被判停工，重复读报/同源转发不重置 |
| S18 partial.rule | registered ConditionExpr | 至少一主要成果verified且人员交接有确认，主目标未全满足 | G01固定；其他场景必须明确自己的组合 |
| S18 decision.quality | ordinal integer或not_evaluable | 证据/权限/协调/版本四项，各0/1/2或not_evaluable | 不以结果或未来信息打分；默认不求总分 |
| S18 generation.attempts | integer/attempt_count | 20次派生尝试；pass才能正常开局 | 拒绝率目标<=20%；不是现实真实性指标 |
| S18 batch.seeds | typed unsigned seed ranges | 100个初检seed、1000个独立seed及边界组合 | 已放行局硬不变量失败0；统计全部尝试 |
| S18 review.players | count及exploratory plan | 初轮探索招募目标8，实际数如实记录，未保证招齐 | 成对顺序交换探索反馈；正式门槛以后预登记，无6/8达标线 |
| S01 clock.default_mode | enum | command；开局research/command，局内locked | 模式变更拒绝MODE_LOCKED |
| S01 pause.policy | enum set | manual/focus_lost/application_hidden/system_fault/restore | 普通阅读编辑不触发；恢复需continue |
| S03 first_play.session_target | duration/minute | 有效游玩20–30；管理暂停另记 | 待实测目标，不改回归deadline或声称现实任务时长 |
| S03 first_play.load_target | integer/activity | 3–5并行任务活动、约3关键未决 | 待实测负荷，性能20主体另档 |
| S03 cleanup.limit | duration/ms | 120000；1000–300000，必须<=本场景剩余截止 | 中止只作公开必要收尾，不新增主目标作业 |
| S03 preparation.template | enum | record/repair/handover的registered_setup | 完成/过期/替代有记录，不由文字自动完成 |
| S04 movement.path_mode | enum | first_play=corridor；full=free_surface | 两项是版本范围承诺，free_surface不能永久剔除 |
| S04 movement.rule | fixed rule | 逐段length/base_speed×terrain×environment×允许的load_factor，累积有理时间最后ceil(ms) | plain100/4=25000ms，rough100×1.5/4=37500ms，总62500ms；不按屏幕像素计时 |
| S08 time.knowledge | tagged union | known(value_ms,source_ref)或unknown(无值) | 已知链序合法，未知不伪造0/收到时点 |
| S08 provenance.visible_kinds | enum set | copy_of/forward_of/revision_of/derived_from/possible_common_source/possible_same_event | confirmed关系需合法凭证，其他只能suspected/unknown |
| S08 dedupe.policy | enum | confirmed_copy_fold_preserve_all | 同内容不同独立来源不折叠；隐藏关系不进入投影 |
| S08 independence.rule | registered rule | 凭合法可见采集凭证建立独立关系，不以渠道/署名数自动判定 | 已知同源三转发=1；未知三报告的独立数未知，不自动3或1 |
| S08 report.schedule | finite catalog | on_activity_receipt/on_state_change/on_request/periodic_declared | periodic必须给period_ms及validity；无目录项不自行发送 |
| S09 belief.update | finite catalog | observed_known_time_latest/equal_time_conflict/unknown_time_hold_history | 迟到旧报不回滚，来源修订不改旧known |
| S10 message.task | typed policy | queue_until_expiry、priority=1、expiry=120000ms | 未送达可撤销/替代，到期作废 |
| S10 message.withdrawal | typed policy | 独立control_message、priority=3、expiry=120000ms | 收到/接受/有效分离，未送达不撤远端 |
| S10 message.authority_update | typed policy | 独立control_message、priority=3、expiry=120000ms | 总部/远端版本分别更新，不越过send/receive限制 |
| S10 control.channel | typed policy | 复用已注册合法Link，不另有无延迟魔法通道 | 高优先级也不能突破不可用链路 |
| S11 control.takeover | finite policy | headquarters_view_message_only | effective_mode=player_controlled仅在接收生效后；返还同样有消息 |
| S11 role.error_policy | enum | evidence_load_preference_only | 无额外随机怠工/迟疑目录；flavor_text不改行为 |
| S11 ai.slot_rule | fixed rule | request提交时预登记严格未来slot，默认提前5000ms | 同槽使用统一提交前快照；暂停不偷偷推进，迟到不得替后备 |
| S11 ai.budget | typed attributes | 100calls/run、4global_pending、1pending/actor、10000ms冷却、8000/1500 text_unit | calls只计真实发起一次；公平票序；input/output非token保证 |
| S11 ai.price_policy | tagged config | unknown或用户提供的price_config/version；currency/cost_limit显式 | 无价格不虚算费用；要求金额上限而缺价格时不启用该外部配置 |
| S15 work.interruptibility | enum | analysis/paperwork=preemptible；maintenance/handover_check=non_preemptible | 仅显式合法挂起，non_preemptible须等或终止 |
| S15 work.switch_cost | duration/ms | 每次挂起/恢复5000；1000–30000 | 占席位，工作/耗用保留，不产出提前完成 |
| S15 work.max_interruptions | integer/count | 3；1–10 | 达上限拒绝再挂起，不能无限切换 |
| S15 queue.aging | typed rule | 等待60000ms后每30000ms升1级，最大priority3；原ticket FIFO | 仅未开始/挂起项，不自动抢占当前工作，不越权 |
| S17 save.contract_version | version | 0.5.1，schema4，规则/媒体/参数hash和能力清单 | 只schema相同不兼容，旧0.5不静默迁移 |
| S17 restore.intents | enum | resume_latest/restore_copy | 继续最近同run；旧点新run，不覆盖，rng来源命名空间保留 |
| S17 truth.exposure | tagged record | not_observed_in_app/observed_in_app/unknown | 已知真相重玩显著标识，不与首次局混作公平比较 |
| S18 visible_progress.wait_exemption | finite rule | 公开已接受工作/承诺的完成窗<=deadline | 过时承诺需新合法消息，最终deadline仍有界 |
| S18 irreversible_block | typed predicate | 当前合法已知证据＋所有必需能力/替代均永久不可恢复＋场景允许 | 未证明只unknown，不看未来/隐藏来源来提前结束 |
| S18 score.cutoff | time/ms | 主要实际动作<=deadline，宽限只收旧结果回执 | 期后验证/交接不补成功；中止收尾另外独立评价 |
| S18 witness.rule | finite contract | 每个必须区分决定有合法证据路径arrival<=latest_legal_decision | 决定后才可得证据的标准局拒绝 |
| S18 generation.difficulty | enum | first_play固定、standard presets easy/standard/hard，seed/profile开局冻 | 自定义和强不可知风险以后另类型，不混standard通过 |
| S18 generation.statistics | typed counters | attempt_rejected/attempt_total为20%工程门槛；root_exhausted/root_total另报 | 两分母不能偷换，全部attempt保留；无运行不能称通过 |
| S18 generation.diversity | declared signature | 几何拓扑/目标DAG/证据到达窗/资源竞争/角色偏好 | 记录分布重复率；体验门槛待探索后预登记，不以改名当变化 |
| S18 review.exploratory | tagged plan | 招募目标8、actual_count真实填写，未保证招齐 | 探索只收问题，无6/8达标；正式门槛尚待提出审阅 |

条件字段白名单由实际类型决定，不接受自由脚本或未注册属性。所需工作、资格、能源及物品在模板同时列明；没有资格先blocked。账务整数、工作比例有理累积、结算取整一次，磨损只在首次实际工作事件扣一次。Capability.concurrency_group、Reservation和EquipmentTransfer分别建模，不复用状态枚举。

StaffWork独立夹具W01：单席位A=4work、B=1work，速率1work/10000ms；A从0做到20000时剩2work，挂起切换5000，B于25000–35000完成；恢复切换5000，A于40000–60000完成。总代价两次切换10000ms，A既有工作不重做。non_preemptible输入相同挂起应拒绝且A原状态/进度无副作用；aging只影响待处理顺序。

观测目录OBS-IMAGE/OBS-RECORD是虚构影像型/记录型来源：calm均可采集；impaired中前者inconclusive、后者limited；severe依已注册条件受阻，未采不能产生not_detected。它们只为两种不同环境依赖的游戏规则，不提供真实光学、雷达或卫星参数。FIC使用environment_level及虚构height_band；旧温度/风速等属性仅在B01历史档明确注册，不作新档隐含默认。

DecisionQuality量表示例：缺视图/权限版本/动作记录则对应项not_evaluable；完整记录表明引用未收到证据、越权、跳过公开必须协调或签旧版本，则对应项0；存在可定位的非硬缺口则1；满足该局预先声明检查项则2。没有书面理由不记0，不以成功/失败或事后真值推分。正式体验达标门槛与该软件量表分别管理。


## 2 虚构角色与抽象设备目录

角色record_keeper具有记录资格，link_keeper具有联络资格，work_keeper具有作业资格，care_keeper具有保障资格；maintainer具有检修资格。每个角色只表示虚构岗位和游戏能力，不对应真实编组。岗位缺席时失去该资格，其他岗位不变。

| 设备 | 能力与占用 | 载荷与容积 | 能量与磨损 |
| --- | --- | --- | --- |
| EQ-REC 记录盒 | record；独占record_group | 4load、3space | 容量20energy，每次记录4energy、3wear |
| EQ-LINK 联络盒 | link；独占link_group | 3load、2space | 容量16energy，每次完整消息1energy、1wear |
| EQ-WORK 作业包 | repair；独占work_group | 6load、4space | 容量24energy，每次完整作业6energy、5wear |
| EQ-STORE 储能块 | energy_transfer；独占maintenance_group | 5load、3space | 初始20energy；转入目标不超容量，两端守恒 |
| EQ-MAINT 检修包 | maintain；需maintainer资格 | 2load、1space | 初始10energy；维修耗2energy及1maintenance_pack，恢复10wear |

每件初始durability=100。供应品每item为1load、1space。工作开始预留完整能量及用品，按已完成工作比例累积，结束/取消时最小整数向上取整一次，释放未耗；任何正工作比例的1item用品结算为消耗1。磨损在首次实际作业事件记账，不能重复重试再磨损。同类装备不是堆叠倍率，重复件只增加备用数量或独立容量。record每次需1record_pack，repair每次需2repair_pack；maintenance需4work、2energy、1maintenance_pack，只有完成才恢复10wear，半段取消消耗1energy和1包、恢复0。record/repair/handover的load_affects_work=false；movement/energy_transfer及F03专用作业为true。record与repair资格分别要求record_keeper与work_keeper。

独立算术F01：记录盒＋联络盒＋两份record_pack合计9load、7space，适配20/12容量。再加作业包与两份repair_pack合计17load、13space，因容积超限拒绝，载荷仍未超限。去掉一份repair_pack后16load、12space可登记，但repair需2份用品的任务仍有公开缺口；容量可行不等于任务可行。

独立算术F02：记录盒20energy，预留4；完成半工作消耗2，取消释放2，stored=18，reserved=0。另一次完整记录后stored=14，磨损从100降97再94（每次已开始实际记录各一次）。转入储能块6energy时记录盒回20，储能块20降14，两端合计保持34。维修恢复不得超过100；新增energy_transfer不是凭空补充。

## 3 G01 局部工程回归与第一可玩区别

G01“雾谷交接”是完全虚构的协作任务。玩家需收集两处设施状态记录，其中一处设备受阻需要抽象作业修复，完成来源核对与成果交接。对立虚构角色可以暂时占用信息窗口，联合方有独立承诺与队列；场景不提供现实行动步骤或攻击方案。

地图包含3地形多边形、1水域、1坡地区域、12建筑轮廓、6合法通行连接和两个嵌套任务空间，统一Extent与几何版本。静态图仅展示设计示例，不是可运行原型。关键对象为FAC-01记录站、FAC-02登记站、HUB交接席位、BLD-07遮挡建筑。真实状态与已知地图独立保存。

G01公开要求：两个record_artifact均verified且交接确认；截止600000ms；宽限10000ms。有限成果规则依参数档。所有有权操作使用FIC-BASE-01，初始公开可用资格及抽象库存。未知身份无需攻击或交战，核实仅处理信息候选。

固定消息时间线：0简报；30000来源R1观察BLD-02疑似迹象；32000递交；50000来源R2给出与R1不同的空间解释；53000递交；60000一次失败采集actual_scope为空；90000来源R3在合法范围明确识别并纠正环境反光；93000递交；120000联合方提交支援承诺，分配与ready另有事件。这组侧线索独立于局部基准A/B身份凭证，不把93000纠正提前供A使用。原始资料能否被使用取决于申请、处理队列及能力，时间线不直接写任务完成。

原G01工程链为简报与能力检查、报告进入地图、玩家保留候选并提出核实、分配虚构资格与抽象用品、消息接受后推进作业、接收延迟反馈、修订计划、成果交接及验证、终局、六类参与角色共同复盘。研究模式可在决策间暂停，command实际阅读耗时另记；不把教学加入本场景。

G01成功/有限成果/失败输入各另存DecisionScript，结果由规则结算：成功脚本满足两记录及交接；有限成果脚本只满足一记录且回收交接成立；失败脚本保持关键缺口至期限。第一可玩PLAY-G01-01必须以连续地图、两种合理选择及相关情报改变作业/结局，见场景新章节；原G01局部算术不再作为第一可玩出口。PCG/外部模型仍后续补足。

## 4 E01至E04 信息纠正夹具

| 夹具 | 冻结输入 | 独立预期 |
| --- | --- | --- |
| E01 误报纠正 | 30000观察R1，32000到达，报告BLD-02有对象迹象；真实是注册环境反光；90000R3在合法clear覆盖中核对record_key，93000新报告说明并关联R1 | 32000保持indication；93000之后旧候选superseded并有理由；原报告和早期known不改；模型不提前说反光 |
| E02 漏报后发现 | 60000采集被遮挡，actual_scope只含可见部分，结果inconclusive；110000新合法覆盖包含先前未观测区域，113000送达检测记录 | 60000不能给整个区域not_detected；113000只更新新覆盖范围；原因链包含遮挡，不称对象凭空生成 |
| E03 重复与冲突 | 两新lineage给不同范围，旧第三lineage转发3次，共5递交、3原始源；较新low-quality与旧clear同时存在 | 本夹具有合法三源凭证，已证独立源数3；未知来源变体不自动计3或1，冲突保持disputed；旧clear不被静默删除；追加核实在队列完成前无正确答案 |
| E04 晚到旧报 | 100000收到观察95000的新位置；130000收到观察40000旧位置；140000纠正旧报的时间字段 | 当前投影不倒退；40000时历史不含130000递交；纠正后仍保留原时点和更正来源 |

ReportErrorProfile在固定夹具用schedule而非概率。随机局rates为可选假设：false_positive=0.10、false_negative=0.10、misclassification=0.05，使用report_errors独立流且只在合法采集事件抽样。固定顺序false_negative→false_positive→misclassification，分别作用于已有可见对象、注册空候选、已保留分类；draw_index记录，新增文字不改变抽样。profile明确采集缺失、遮挡与随机误差是不同原因。参数增减的分布测试不推断真实传感性能。

## 5 独立边界与敏感性预期

载荷耗时模型为duration=base_work_time×terrain_factor×environment_factor×(1+0.02×carried_load)，再按1ms向上取整。它只作用于允许载荷影响的虚构活动；capability不足先blocked。相同cause重复出现只消费一次环境因子。

固定例F03：base_work_time=10000ms、terrain=1、environment=1、load=10，耗时12000ms；load=15耗时13000ms。environment改1.25后为15000ms。两次同环境cause仍15000ms，不是18750ms。按120次100ms或一次12000ms推进，同时间线累计工作和能耗相同。

| 比较 | 固定不变项 | 预定关系 |
| --- | --- | --- |
| 只增加载荷 | 资格、地形、环境、距离、能源 | 合法范围内耗时不减少；超容量拒绝，不自动删装备 |
| 只降低设备能源 | 其他库存、资格、初始资料 | 能力不凭空增强；低于预留需求blocked |
| 只增加消息延迟 | 观察、内容、所有行动与世界过程 | 观察时点不改，收到不更早；历史不回填 |
| 只移除遮挡 | 世界实体、观察范围、来源、错误流 | 清晰度按规则提高或不变；不自动识别身份 |
| 只增加分析队列 | 处理能力、优先级、原资料 | 同FIFO任务不更早完成；原文仍可读 |
| 同决定不同后续随机结果 | 当时合法证据、授权、声明及评分档 | 四项DecisionQuality相同，Outcome可不同 |
| 只改flavor_text流 | 几何、目标、消息、角色、错误流 | 世界、结果、证据与结构指纹全部不变 |

边界组合至少检查最低能源＋最高合法载荷、短期限＋消息退化、重复来源＋确认门槛、合法长等待＋无进展窗口、外部AI超时＋撤销在途、史视角＋纠正已送达。预期以不变量及明确条件为依据，不从被测规则输出复制。

本附录目前是夹具制作契约与独立算术核对；没有机器可运行场景、批量seed实验、AI调用或体验评审结果。




## 6 PLAY-G01-01 完整作者覆盖表

FIC-PLAY-01/version1，parent=FIC-BASE-01/version2；下表只供作者形成resolved档，不允许运行时拼档。所有未覆盖基档条目仍须逐项写入最终resolved配置。范围指此固定夹具的允许值，敏感性实验须新profile_revision及独立预期。每个PLAY键以对应Sxx归属登记，entry_version=1、source_type=design_assumption、calibration_status=uncalibrated。

| Registry.id | 类型/单位 | 固定值或明确范围 | 行为 |
| --- | --- | --- | --- |
| PLAY S04 map.extent | rectangle/fictional_metre | [0,400]×[0,300] | H(50,150)/A(150,150)/B(250,150)，几何在界内 |
| PLAY S04 corridor | geometry/fictional_metre | H-A/A-B各100长、20宽；plain；H/A/B为service_marker Point | path_mode=corridor，连续插值；完整free_surface另验 |
| PLAY S03 deadline | duration/ms | 默认900000；窄期限380000；grace10000 | 必要实体动作/移交/验证不晚于deadline，grace只receipt |
| PLAY S03 cleanup | duration/ms | <=120000且<=剩余公开终局期限 | 无义务可直接结束，否则terminating |
| PLAY S06 actors | typed roster | R在H、W在B，各3person，20load/12space/20movement_energy | 角色及资格从虚构目录，不是现实部署 |
| PLAY S06 loadout | equipment/item | R EQ-REC+EQ-LINK+2record_pack=9load/7space；W EQ-WORK+2repair_pack=8load/6space；设备REC20/LINK16/WORK24energy，各durability100 | W通信为固定基础设施，移动中没有便携链路 |
| PLAY S10 infrastructure | finite link catalog | B/H固定终端，HQ固定终端；R便携EQ-LINK；各消息1000ms、无丢包 | W在B维修及在H移交才发送；不凭空配便携设备 |
| PLAY S07 movement.energy | energy_unit/path | 每100图上米消耗1energy，比例累积后活动结算ceil | R总4energy、W返程2energy；消息发送能耗另记设备 |
| PLAY S07 work.supplies | item/activity | record每次1record_pack；repair共2repair_pack；handover无物品 | 消耗随实际工作，取消释放未耗，修复是B记录前置 |
| PLAY S15 initial_desk | capacity/time | 单processing席位，已接受公开不可抢占工作[0,85000) | 不能与准备/核实同占容量；后续队列票保留 |
| PLAY S15 source_validation | work/duration | 2work、20000ms，无setup | 将已收到原件形成verified Assessment，不创造观察 |
| PLAY S15 prep_request | work/duration | 6work、60000ms，无setup，已含审查不另加2work | 完成后发批准receipt，公开预留2repair_pack |
| PLAY S15 work.energy | energy_unit | 初始processing20，核实2/准备6/终局核对2 | 一套实际账务；partial按工作累积取整，非费用报价 |
| PLAY S08 source_records | typed fixture | PLAY-R1蓝原文，event=unknown、observed=10000/published=20000有可见元数据；三明示转发received21000/31000/41000；PLAY-R3观察/发布85000，收到86000 | 源凭证未知保持unknown；R1三转发非独立来源 |
| PLAY S08 credential | typed fixture | private actual=green；公开候选blue/green；合法R3原文为green | HQ到达前不知，来源核实完成才满足本局访问依据门槛 |
| PLAY S03 work.templates | work/duration | record4work、repair6、handover2，各setup5000；1work/10000ms | 两组calm、fatigue<3；load_affects_work=false；加载基档设备消耗 |
| PLAY S03 final_verification | work/duration | H串行核对2work/20000ms，无setup，receipt1000 | custody已完成才核对；全部截止前完成 |
| PLAY S13 receiver.capacity | person/seat | 6person/6seat，两组各3 | 人员与成果receipt分开，不复用物品状态 |
| PLAY S08 source_actor | typed source roster | ArchiveSource record_keeper、EQ-REC20energy/100durability、1record_pack、固定终端 | 开局已授权采集/递交，来源数据按合法投影 |
| PLAY S08 r3_collection | work/time及publication template | 65000—85000做2work；raw_record_publication直接发布原文，无ProcessingJob | 85000观察/源发布、86000收到；HQ analysis另做，不偷用默认加工 |
| PLAY S02 authority | typed AuthorityGrant | from0/to=deadline，R/W move/record/handover；W repair需prep_approved；HQ可提交核实/准备/任务 | 采集/终端权限另显式授予，范围是本虚构地图与对象 |

## 7 注册、错误与证据

每项条件/属性由类型白名单引用，未知不当正常，未登记拒绝CONFIG_PARAMETER_MISSING，单位错CONFIG_UNIT_MISMATCH；不得回退B01或用代码常量填缺项。活动实际时长>0；几何、工作和消耗累积有理数，仅结算取整一次。模板同时登记资格/库存/时间容量/interruptibility，没资格blocked。磨损在首次实际工作事件扣一次。

设备消息能耗为发送方每次成功完整payload1energy/1wear，接收不重复扣；基础设施按注册终端供能，移动中的W不传新报告。HQ预算/处理能耗与便携设备能量分开，不兑换为货币。

未来创建机器夹具时记录profile、完整resolved内容/hash、源版本及独立预期；当前没有运行100/1000seed、模型调用或试玩，参数均未校准。工程包络是测试目标而非已实现能力，正式体验标准待探索后提出供审。

公开范围说明：本包保留产品规则、参数、场景、244 项验收及原七阶段十四任务对照。历史版本、逐题讨论、审批原始记录、私有任务单、执行日志、工具配置和技能源码不在公开范围。涉及 V0.5/B01-LEGACY 历史夹具的条目只保留引用含义；历史输入未随本包公开，后续验证须另行取得获准且完整的版本化输入，不用当前 FIC 档替代。
