# 六阶段244AT首实现与回归映射（待审附录）

公开版说明（2026-10-12）：现行 V0.5.1 产品规格已审（review_state=owner_review_passed），frozen=false、implementation_state=not_implemented、acceptance_state=not_run。六阶段小批方案仍为 plan-draft/not-authorized，尚未实施；244 项产品验收均未执行。公开同步只发布这八份设计与计划文档，不授予产品开发、冻结或运行验收权限。

plan_version=1；plan-draft/not-authorized。权威合同来自[V0.5.1验收](../requirements/product-v0.5.1-acceptance.md)，本附录只分配批次，原条文/编号/主任务不改。路线与批的输入/范围/正反例/门槛见[六阶段计划](six-stage-plan-v0.5.1.md)。全部产品AT仍not_run。

首批=第一次按该AT前提完整实现并验证的计划批，更早子合同不算整条通过；回归=该Seam随后改变时必需复验，不新增主归属。B6.4/5标“启用时”的回归只在可选扩展进入发行范围时必须；延期不会自动变成已实现。最后B6.8包含全244复验，但不能替代此前小批证据。

分类：runtime_contract需Game/HTTP/SQLite或真实浏览器的实际行为证据；manual_or_experiment需实际实验/人工记录；declaration_plus_runtime_evidence要结合真实能力与声明；document_rule仅207/208，为文档成熟度负样本规则。当前的ID/hash/依赖检查是规划静态检查，不声称已运行任一AT，也不把产品负责人文档审批改回待审。

| ID | 原主任务（保持） | 分类 | 首实现批（唯一） | 必需后续回归 | 原动作/独立预期索引 | 当前验收 |
| --- | --- | --- | --- | --- | --- | --- |
| V051-AT001 | I02 | runtime_contract | B1.1 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 登记消息但不推进模拟时间 → message queued，Activity未开始；推进后按真实传输时延接受 | not_run |
| V051-AT002 | I02 | runtime_contract | B2.5 | B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 不操作推进按钮 → 世界、链路和工作项仍推进；阅读不冻结敌方 | not_run |
| V051-AT003 | I02 | runtime_contract | B1.2 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 分别一次推进120秒与120次推进1秒 → 最终状态摘要、事件因果和资源相同 | not_run |
| V051-AT004 | I02 | runtime_contract | B4.6 | B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 交换实体ID和遍历顺序 → 双方效果同时计入，不出现先执行者免伤 | not_run |
| V051-AT005 | I02 | runtime_contract | B1.3 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 恢复后等待墙钟一小时 → 恢复paused且sim_time不自动增加，无离线跳算 | not_run |
| V051-AT006 | I02 | runtime_contract | B1.1 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 提交请求 → INVALID_REQUEST或模式拒绝，无状态/队列变化 | not_run |
| V051-AT007 | I02 | runtime_contract | B1.2 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 推进到旧due time → generation过期事件不产生成果或重复消耗 | not_run |
| V051-AT008 | I02 | runtime_contract | B1.1 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 尝试零时延无限循环任务 → 新完成必须晚于start，反馈最早用于下一决策批次 | not_run |
| V051-AT009 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 预览并签发范围内任务 → 直接登记；范围外只允许提案或公开拒绝 | not_run |
| V051-AT010 | I03 | runtime_contract | B2.3 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 指挥官席位有积压 → under_review持续至审查完成，未答复不自动批准 | not_run |
| V051-AT011 | I03 | runtime_contract | B4.3 | B4.8, B5.3, B6.4（启用时）, B6.8 | 用v1授权签发v2 → AUTHORITY_REQUIRED且无资源/消息副作用 | not_run |
| V051-AT012 | I03 | runtime_contract | B4.2 | B4.8, B5.3, B6.4（启用时）, B6.8 | 查看双方并尝试新签发 → 总部拒绝新令，远端保留最后收到版本直到撤销到达 | not_run |
| V051-AT013 | I03 | runtime_contract | B4.2 | B4.8, B5.3, B6.4（启用时）, B6.8 | 传输到接收端 → 接收端rejected并回执，不执行过期许可 | not_run |
| V051-AT014 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 提交越限活动 → CONSTRAINT_DENIED，风险按钮不能覆盖硬要求 | not_run |
| V051-AT015 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 提交普通玩家请求 → 会话身份不变，越权拒绝，不产生批准记录 | not_run |
| V051-AT016 | I03 | runtime_contract | B4.8 | B5.3, B6.4（启用时）, B6.8 | 分别满足和不满足条件使用 → 只有满足且有本地证据时合法，完整记录授权依据 | not_run |
| V051-AT017 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 保存与预览 → 不占用资产、不开始执行，估计带假设 | not_run |
| V051-AT018 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 提交任务包 → INVALID_REQUEST指明公开依赖冲突，任务不可授权 | not_run |
| V051-AT019 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 编组接收后本地复核 → 现场hold/abort，不能直接开始；总部等待报告 | not_run |
| V051-AT020 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 安排并发 → CAPACITY_CONFLICT；独立通信能力允许同时工作 | not_run |
| V051-AT021 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 批准新计划版本 → 旧成果与历史保留，不追溯删除或改写 | not_run |
| V051-AT022 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 查看总部任务卡 → 保持assessing或待确认，不自动completed | not_run |
| V051-AT023 | I03 | runtime_contract | B2.4 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 切换撤出阶段 → 任务效果和回收结果分别保存，不立即完整失败或成功 | not_run |
| V051-AT024 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 推进或请求执行 → 阶段退回preparing、门槛unknown，显示需核实项目 | not_run |
| V051-AT025 | I04 | runtime_contract | B2.1 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 载入并定位 → 误差与几何保留；待定位无中心假点 | not_run |
| V051-AT026 | I04 | runtime_contract | B2.1 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 预览路径与移动 → 预览不利用秘密；本地发现后受阻并报告 | not_run |
| V051-AT027 | I04 | runtime_contract | B3.4 | B4.6, B5.2, B6.1, B6.6, B6.8 | 双方观测 → 邻接不等于发现，接触结果体现occluded证据 | not_run |
| V051-AT028 | I04 | runtime_contract | B2.1 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 用相同环境推进 → 耗时按各自能力计算，不能沿用统一一时段常量 | not_run |
| V051-AT029 | I04 | runtime_contract | B2.1 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 导入场景或保存范围 → INVALID_REQUEST且不产生非法地图实体 | not_run |
| V051-AT030 | I04 | runtime_contract | B4.1 | B4.6, B5.2, B6.1, B6.6, B6.8 | 编组依据本地资料选替代 → 新路线在授权范围内，真实变化不提前进入总部 | not_run |
| V051-AT031 | I04 | runtime_contract | B2.1 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 刷新地图 → 实际位置继续变化，标记保留最后确认与年龄 | not_run |
| V051-AT032 | I04 | runtime_contract | B2.1 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 再应用环境规则 → 同一rule/cause只计一次，不重复倍率 | not_run |
| V051-AT033 | I04 | runtime_contract | B4.6 | B5.2, B6.1, B6.6, B6.8 | 读预报并推进无实际事件 → 道路不因预报直接关闭，地图标预测 | not_run |
| V051-AT034 | I04 | runtime_contract | B4.6 | B5.2, B6.1, B6.6, B6.8 | 推进共同因果事件 → 桥状态改变且cause指向水文和检查，报告可追溯 | not_run |
| V051-AT035 | I04 | runtime_contract | B3.4 | B4.6, B5.2, B6.1, B6.6, B6.8 | 执行两类采集 → 按注册游戏能力产生inconclusive/limited差异，不外推真实传感性能 | not_run |
| V051-AT036 | I04 | runtime_contract | B4.9 | B5.2, B6.1, B6.6, B6.8 | 同一时段重估 → 三类过程使用相同环境版本并分别记录影响 | not_run |
| V051-AT037 | I04 | runtime_contract | B3.3 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 查看地图 → 保留最后记录并标unknown/expired，不恢复正常 | not_run |
| V051-AT038 | I04 | runtime_contract | B3.3 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 分别提交两类报告 → 合法预报接受，未来事实拒绝 | not_run |
| V051-AT039 | I04 | runtime_contract | B4.6 | B5.2, B6.1, B6.6, B6.8 | 推进 → 不自动复活任务，重新执行需合法新计划 | not_run |
| V051-AT040 | I04 | runtime_contract | B4.6 | B5.2, B6.1, B6.6, B6.8 | 加载参数 → 校验拒绝，不能将未提供值当0通过门槛 | not_run |
| V051-AT041 | I05 | runtime_contract | B2.3 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 分配同一任务 → 符合条件者可接受，不符合者显示已知能力缺口 | not_run |
| V051-AT042 | I05 | runtime_contract | B4.4 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 执行后休整 → 能力与耗时按模型变化，恢复不超量表上限 | not_run |
| V051-AT043 | I05 | runtime_contract | B4.4 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 刷新总部并本地继续 → 本地能力变化，总部保持旧确认；报告到达后更新 | not_run |
| V051-AT044 | I05 | runtime_contract | B2.3 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 执行需能源任务 → 按能源门槛受阻，不用其他资源点兑换 | not_run |
| V051-AT045 | I05 | runtime_contract | B4.9 | B4.11, B5.3, B6.1, B6.8 | 安排合法医疗运输 → 不标死亡；回收可由支援能力完成 | not_run |
| V051-AT046 | I05 | runtime_contract | B2.3 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 保存装备安排 → CAPACITY_CONFLICT且无资源挪用 | not_run |
| V051-AT047 | I05 | runtime_contract | B2.3 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 同时分配 → 只允许容量内预约，其他任务等待或调整 | not_run |
| V051-AT048 | I05 | runtime_contract | B4.5 | B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 启动并中途取消 → 保留实际耗用，未完成不恢复设备正常 | not_run |
| V051-AT049 | I05 | runtime_contract | B4.5 | B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 执行完整账务链 → 每品类守恒，转移两端原子，同ID不重复 | not_run |
| V051-AT050 | I05 | runtime_contract | B2.3 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 查询保障板 → 显示总部已确认库存及预留，不泄露实际任务消耗 | not_run |
| V051-AT051 | I05 | runtime_contract | B4.9 | B4.11, B5.3, B6.1, B6.8 | 检查任务门槛 → 库存不增加，门槛仍缺物资，delivered后入账 | not_run |
| V051-AT052 | I05 | runtime_contract | B4.9 | B4.11, B5.3, B6.1, B6.8 | 申请医疗并排队 → care_need未满足，不能直接stable；状态按模型变化 | not_run |
| V051-AT053 | I09 | runtime_contract | B4.9 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 确认boarding_manifest → CAPACITY_CONFLICT，未登载者不瞬移到后方 | not_run |
| V051-AT054 | I09 | runtime_contract | B4.9 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 尝试登载 → Recovery blocked、缺少会合确认，不用真值完成会合 | not_run |
| V051-AT055 | I09 | runtime_contract | B4.9 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 协调停止 → 占用保持至安全结束确认，未耗资源才释放 | not_run |
| V051-AT056 | I09 | runtime_contract | B4.9 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 推进至各节点 → custody事件完整，只有验证满足目标；人员交接独立 | not_run |
| V051-AT057 | I06 | runtime_contract | B3.4 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 申请采集 → 生成CollectionTask与处理需求，不能立即生成答案 | not_run |
| V051-AT058 | I06 | runtime_contract | B3.4 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 分配资产 → 超容量拒绝或替代，不重复使用资产 | not_run |
| V051-AT059 | I06 | runtime_contract | B3.4 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 查看情报需求 → 采集collected、需求processing，分析报告尚未出现 | not_run |
| V051-AT060 | I06 | runtime_contract | B3.4 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 显示Coverage → failed且无not_detected，不宣称区域安全 | not_run |
| V051-AT061 | I06 | runtime_contract | B3.1 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 校验时间与载荷 → 专属时间/字段正确，天气报告不含敌方规模 | not_run |
| V051-AT062 | I06 | runtime_contract | B2.3 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 核对可见lineage及独立证据 → 确认为一原始源，不提高独立数；隐藏或疑似关系不自动定论 | not_run |
| V051-AT063 | I06 | runtime_contract | B3.3 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 生成correction并查询历史 → 新记录关联旧版，原文与历史判断不改 | not_run |
| V051-AT064 | I06 | runtime_contract | B3.3 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 情报需求结算 → expired/inconclusive，可读实际已取得内容 | not_run |
| V051-AT065 | I06 | runtime_contract | B3.1 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 形成ActorKnowledge → 知识分离，友方不因同阵营自动共享 | not_run |
| V051-AT066 | I06 | runtime_contract | B3.2 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 处理接触 → 保持indication/detected，不自动confirmed | not_run |
| V051-AT067 | I06 | runtime_contract | B3.3 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 更新Track → 按observed_time保持最新，同时间冲突保留候选 | not_run |
| V051-AT068 | I06 | runtime_contract | B3.4 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 播放并建立研判 → 视频与识别结论分离，显示未确认 | not_run |
| V051-AT069 | I06 | runtime_contract | B3.3 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 继续决策 → 不当作精确当前位置，保留不确定范围与历史 | not_run |
| V051-AT070 | I06 | runtime_contract | B3.2 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 保存研判 → 只改Assessment，不改RawObservation或World身份 | not_run |
| V051-AT071 | I06 | runtime_contract | B3.1 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 重新生成策略输入 → 本期LocalActorView/Decision不变，无秘密字段或计数泄露 | not_run |
| V051-AT072 | I06 | runtime_contract | B3.2 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 系统建议与玩家判断 → 保留替代解释及证据，不调用真值择优 | not_run |
| V051-AT073 | I07 | runtime_contract | B4.2 | B4.9, B4.11, B5.3, B6.2, B6.8 | 读状态并推进 → issued/queued与delivered/accepted分开，不提前执行 | not_run |
| V051-AT074 | I07 | runtime_contract | B4.2 | B4.9, B4.11, B5.3, B6.2, B6.8 | 本地Fix并刷新总部 → 本地仍有定位，总部最后确认不变化；非真实卫星性能 | not_run |
| V051-AT075 | I07 | runtime_contract | B3.4 | B4.9, B4.11, B5.3, B6.2, B6.8 | 递交反馈 → 文字先到、视频排队，不能整份信息同步瞬移 | not_run |
| V051-AT076 | I07 | runtime_contract | B4.2 | B4.9, B4.11, B5.3, B6.2, B6.8 | 撤销尚未到达时推进 → 原任务继续；到达后按安全切换与回执处理 | not_run |
| V051-AT077 | I07 | runtime_contract | B4.2 | B4.9, B4.11, B5.3, B6.2, B6.8 | 接收 → expired/rejected，无新执行与预留消耗 | not_run |
| V051-AT078 | I07 | runtime_contract | B4.2 | B4.9, B4.11, B5.3, B6.2, B6.8 | 接收多次 → 不重复启动，旧版本不覆盖已接受新命令 | not_run |
| V051-AT079 | I07 | runtime_contract | B4.2 | B4.9, B4.11, B5.3, B6.2, B6.8 | 发送接收及紧急触发 → 分别按政策；紧急允许也可能因链路不可用失败 | not_run |
| V051-AT080 | I07 | runtime_contract | B3.5 | B4.9, B4.11, B5.3, B6.2, B6.8 | 当前和历史查看 → 原采集时点保留，当前位置不倒退，历史不回填 | not_run |
| V051-AT081 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 本地评估并调整 → 范围内adapt合法，Decision记录本地证据与授权 | not_run |
| V051-AT082 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 本地决策 → hold/abort/withdraw按政策，未收到前总部不知结果 | not_run |
| V051-AT083 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 请求指示或等待到hold_limit → 不自动获得权限，超时执行已定义fallback | not_run |
| V051-AT084 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 复盘 → 记录原决定时间与理由，不用后来知识评价当时输入 | not_run |
| V051-AT085 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 改变我方可观测行动 → 其候选与选择可能改变，非固定两次攻击脚本 | not_run |
| V051-AT086 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 对比决策 → 结果不变，策略无法查询World句柄 | not_run |
| V051-AT087 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 协同任务 → 须实际协调与消息，不能强制同步我方命令 | not_run |
| V051-AT088 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 重跑主体决策 → 可重现；无原因的随机失败不能覆盖硬约束 | not_run |
| V051-AT089 | I08 | runtime_contract | B4.6 | B4.8, B5.2, B6.2, B6.3, B6.8 | 尝试执行 → 重新检查缺口，不使用旧固定免伤点 | not_run |
| V051-AT090 | I08 | runtime_contract | B4.6 | B4.8, B5.2, B6.2, B6.3, B6.8 | 结算 → 分型Effect与各状态变化可追溯，不仅减血条 | not_run |
| V051-AT091 | I08 | runtime_contract | B4.6 | B4.8, B5.2, B6.2, B6.3, B6.8 | 改ID并重跑 → 同时结算，失能者无本期后续完成成果 | not_run |
| V051-AT092 | I08 | runtime_contract | B4.6 | B4.8, B5.2, B6.2, B6.3, B6.8 | 执行并推进 → 影响指定能力与持续过程，不固定无条件下一期恢复 | not_run |
| V051-AT093 | I08 | runtime_contract | B4.6 | B4.8, B5.2, B6.2, B6.3, B6.8 | 结算保护与回应 → 保护可按规则发生，不能自动对未知攻击者造成伤害 | not_run |
| V051-AT094 | I08 | runtime_contract | B4.6 | B4.8, B5.2, B6.2, B6.3, B6.8 | 执行旧范围行动 → 效果由实际条件决定，反馈不透露秘密新位置 | not_run |
| V051-AT095 | I08 | runtime_contract | B4.6 | B4.8, B5.2, B6.2, B6.3, B6.8 | 评估任务控制 → 不自动清除；actual与known_control分离 | not_run |
| V051-AT096 | I08 | runtime_contract | B4.6 | B4.8, B5.2, B6.2, B6.3, B6.8 | 总部查看 → 未确认效果不显示真值；新报告到达后更新 | not_run |
| V051-AT097 | I09 | runtime_contract | B4.7 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 查看支援卡 → acknowledged不等于approved/ready | not_run |
| V051-AT098 | I09 | runtime_contract | B4.7 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 推进任务门槛 → 保持缺口，分配后才有承诺和预约 | not_run |
| V051-AT099 | I09 | runtime_contract | B4.7 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 分别预约 → 相邻允许，超容量重叠CAPACITY_CONFLICT | not_run |
| V051-AT100 | I09 | runtime_contract | B4.7 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 用旧承诺执行 → COMMITMENT_STALE，须重新协调 | not_run |
| V051-AT101 | I09 | runtime_contract | B4.7 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 支援方本地复核 → 延期/受阻/失败并通知，不强行完成脚本 | not_run |
| V051-AT102 | I09 | runtime_contract | B4.7 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 查看任务卡 → 执行与效果确认分开，不自动过阶段 | not_run |
| V051-AT103 | I09 | runtime_contract | B4.7 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 查看日历与申请 → 显示合法可用性摘要，不泄露秘密任务身份 | not_run |
| V051-AT104 | I09 | runtime_contract | B4.9 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 编组转撤出阶段 → 使用承诺与RecoveryExecution，不能靠普通move自动交接 | not_run |
| V051-AT105 | I09 | runtime_contract | B4.8 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 总部签发与本地执行分别检查 → hold并列缺失证据，不能用未知值当0 | not_run |
| V051-AT106 | I09 | runtime_contract | B4.8 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 执行前复核 → 现场deny/hold并报告，总部错误不预先泄露对象 | not_run |
| V051-AT107 | I09 | runtime_contract | B4.8 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 提交风险接受 → 仅软约束按权限处理，硬要求仍生效 | not_run |
| V051-AT108 | I09 | runtime_contract | B4.8 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 在到期及越界执行 → 拒绝或中止，半开区间边界一致 | not_run |
| V051-AT109 | I09 | runtime_contract | B4.8 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 进行协同确认 → 保持冲突未解决，不能默认为安全 | not_run |
| V051-AT110 | I09 | runtime_contract | B4.8 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 推进 → 影响目标价值或限制，结果有因果记录 | not_run |
| V051-AT111 | I09 | runtime_contract | B4.8 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 检查本地执行 → 使用本地已收版本；传播到达后更新 | not_run |
| V051-AT112 | I09 | runtime_contract | B4.8 | B4.11, B4.12, B5.1, B5.3, B6.1, B6.8 | 评价决定 → 实际后果与当时可知程度分别列示，不用终局真值倒责 | not_run |
| V051-AT113 | I10 | runtime_contract | B4.3 | B4.11, B5.3, B5.4, B6.2, B6.8 | 处理队列 → 按优先级与实际工作推进，有积压和期限 | not_run |
| V051-AT114 | I10 | runtime_contract | B4.3 | B4.11, B5.3, B5.4, B6.2, B6.8 | 玩家读原文和分析区 → 原文可读，分析产品未出现，不重复扣人工阅读时间 | not_run |
| V051-AT115 | I10 | runtime_contract | B4.10 | B4.11, B5.3, B5.4, B6.2, B6.8 | 显式挂起/恢复或调整优先级 → 只合法可中断任务付切换成本；其余仅排队或显式终止，进度/耗用保留 | not_run |
| V051-AT116 | I10 | runtime_contract | B3.5 | B4.11, B5.3, B5.4, B6.2, B6.8 | 刷新告警 → 合并提醒并保留来源，不扩大独立证据数 | not_run |
| V051-AT117 | I10 | runtime_contract | B4.11 | B5.3, B5.4, B6.2, B6.8 | 交接并确认 → 未决事项完整保留，未确认交接明确标记 | not_run |
| V051-AT118 | I10 | runtime_contract | B4.11 | B5.3, B5.4, B6.2, B6.8 | 推进 → 席位容量与链路受影响，备用计划决定恢复 | not_run |
| V051-AT119 | I10 | runtime_contract | B3.5 | B4.11, B5.3, B5.4, B6.2, B6.8 | 检查告警 → 不能提前提醒隐藏事件 | not_run |
| V051-AT120 | I10 | runtime_contract | B4.3 | B4.11, B5.3, B5.4, B6.2, B6.8 | 继续处理 → 保留overdue事实与原因，不能清除历史延误 | not_run |
| V051-AT121 | I11 | runtime_contract | B4.12 | B5.6, B6.1, B6.6, B6.8 | 双向点击 → 定位一致且只显示PlayerView，待定位无假精度 | not_run |
| V051-AT122 | I11 | runtime_contract | B2.5 | B3.5, B4.12, B5.6, B6.1, B6.6, B6.8 | 旧响应后来到达 → 按editing_seq/view_revision丢弃，不覆盖新草案 | not_run |
| V051-AT123 | I11 | runtime_contract | B2.5 | B3.5, B4.12, B5.6, B6.1, B6.6, B6.8 | 重试及刷新 → 保留表单，同ID恢复原结果，不重复任务 | not_run |
| V051-AT124 | I11 | runtime_contract | B2.5 | B3.5, B4.12, B5.6, B6.1, B6.6, B6.8 | 自动刷新 → 不默默覆盖或签发旧值，要求明确保存版本 | not_run |
| V051-AT125 | I11 | runtime_contract | B2.5 | B3.5, B4.12, B5.6, B6.1, B6.6, B6.8 | 看任务卡 → 说明缺口、时点、依据及允许动作，不仅红色风险值 | not_run |
| V051-AT126 | I11 | runtime_contract | B3.4 | B3.5, B4.12, B5.6, B6.1, B6.6, B6.8 | 查询媒体、缩略图和列表 → 统一不可用；已递交视频失败不阻塞文字操作 | not_run |
| V051-AT127 | I11 | runtime_contract | B2.5 | B3.5, B4.12, B5.6, B6.1, B6.6, B6.8 | 访问关键任务与提交 → 无关键按钮截断，文字状态与键盘可操作 | not_run |
| V051-AT128 | I11 | runtime_contract | B2.5 | B3.5, B4.12, B5.6, B6.1, B6.6, B6.8 | 提交与返回当前 → 全部HISTORY_READ_ONLY，返回先刷新当前 | not_run |
| V051-AT129 | I02 | runtime_contract | B1.1 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 重复请求 → 原收据或OPERATION_ID_REUSED，业务版本不重复增加 | not_run |
| V051-AT130 | I02 | runtime_contract | B1.2 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 中断提交并重试 → 全部回滚，重试抽样与消耗只发生一次 | not_run |
| V051-AT131 | I02 | runtime_contract | B1.1 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 同时提交 → 单写序列，旧revision拒绝，无半状态 | not_run |
| V051-AT132 | I02 | runtime_contract | B4.11 | B5.4, B5.5, B6.2, B6.3, B6.8 | 恢复 → 全部队列、认知、授权、预约、rng一致，不重跑已提交事件 | not_run |
| V051-AT133 | I02 | runtime_contract | B5.4 | B5.5, B6.2, B6.3, B6.8 | 导入、resume_latest、restore_copy → 不兼容明确拒绝保原件；旧点复制新run不覆盖，继续最近只读已提交 | not_run |
| V051-AT134 | I02 | runtime_contract | B2.4 | B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 查看当时known和终局truth → known不回填，truth仅终局开放 | not_run |
| V051-AT135 | I02 | runtime_contract | B5.5 | B6.2, B6.3, B6.8 | 改变一个决定 → 原局不变，分支标起点、模型与随机流策略 | not_run |
| V051-AT136 | I02 | runtime_contract | B4.11 | B5.4, B5.5, B6.2, B6.3, B6.8 | 恢复和读报告 → 媒体局部错误；规则能力缺失明确不可用，不伪造证据 | not_run |
| V051-AT137 | I12 | runtime_contract | B5.2 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 开始新局 → 版本冻结且缺能力拒绝/明确部分运行，未来资料不下发 | not_run |
| V051-AT138 | I12 | manual_or_experiment | B5.1 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 独立执行完整任务 → 结果由条件与决定形成，有任务效果、回收和约束评价 | not_run |
| V051-AT139 | I12 | manual_or_experiment | B5.1 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 按附录输入执行 → 300000到B与420000迟到差异成立；延迟变体窗口重新计算 | not_run |
| V051-AT140 | I12 | manual_or_experiment | B5.1 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 反事实比较 → 有因果链及预定关系，不凭未知答案自动判拟真 | not_run |
| V051-AT141 | I14 | manual_or_experiment | B6.7 | B6.8 | 记录审查结果 → 列证据、适用包络和局限，不能宣称全用途实战资格 | not_run |
| V051-AT142 | I12 | manual_or_experiment | B5.2 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 恢复重跑和交换遍历顺序 → 对应流抽样可重现，多次实验有分布报告 | not_run |
| V051-AT143 | I14 | declaration_plus_runtime_evidence | B6.8 | 在本批最终构建核对；后续改变则重新审影响 | 检查交付状态 → 不标244条全通过；工程无移动回归不称第一可玩，完整版free_surface保留 | not_run |
| V051-AT144 | I14 | manual_or_experiment | B6.6 | B6.7, B6.8 | 基准与独立使用评审 → 记录机器、版本、P95、离线媒体/恢复和任务闭环，超包络不虚报支持 | not_run |
| V051-AT145 | I04 | runtime_contract | B2.1 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 执行移动并比较1000ms小步与一次30000ms → 两者同为30000ms到达，日志及位置一致；禁止像素距离计时 | not_run |
| V051-AT146 | I04 | runtime_contract | B6.1 | B6.6, B6.8 | 点击、切层并查看入口 → 稳定feature_id及parent保留，关闭入口拒绝活动；未观察房间不展示真值 | not_run |
| V051-AT147 | I04 | runtime_contract | B3.4 | B4.6, B5.2, B6.1, B6.6, B6.8 | 按注册遮挡规则采集 → Coverage记录差异及原因，失败不产出全范围空无报告 | not_run |
| V051-AT148 | I04 | runtime_contract | B6.1 | B6.6, B6.8 | 注册地图 → 三者分别拒绝且定位具体feature/边；没有生成成功局 | not_run |
| V051-AT149 | I04 | runtime_contract | B2.1 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 投影屏幕与反投影 → 误差≤0.1图上米；地图边界内坐标与保存后相同 | not_run |
| V051-AT150 | I04 | runtime_contract | B3.5 | B4.6, B5.2, B6.1, B6.6, B6.8 | 看地图、列表、错误与媒体 → 未知设施的数量、名称、缩略图、面积占比均不泄漏 | not_run |
| V051-AT151 | I04 | runtime_contract | B6.1 | B6.6, B6.8 | 处理批次并历史查看 → 批次前后分别引用同一个map_version，不混用旧几何/新遮挡 | not_run |
| V051-AT152 | I04 | runtime_contract | B3.3 | B3.4, B4.6, B5.2, B6.1, B6.6, B6.8 | 展示范围与移动估计 → 误差面积/观察及接收时间可区分；预测标estimated不当实时真值 | not_run |
| V051-AT153 | I11 | runtime_contract | B3.5 | B4.12, B5.6, B6.1, B6.6, B6.8 | 低中高三级缩放 → 聚合只计三条可见报告，放大可展开来源且筛选一致 | not_run |
| V051-AT154 | I11 | manual_or_experiment | B2.5 | B3.5, B4.12, B5.6, B6.1, B6.6, B6.8 | 定位地物、解释报告、看复盘 → 记录时间及误解；目标人数不作达标阈值，探索不是体验达标/军事证明 | not_run |
| V051-AT155 | I05 | runtime_contract | B4.4 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 冻结任务草案 → 17负重13空间拒绝空间；移除1补给后16/12可携带但任务缺第二份补给 | not_run |
| V051-AT156 | I05 | runtime_contract | B4.5 | B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 执行半段后取消，再执行全段 → 库存依次18、14，释放未消耗2；耐久97、94；日志不重复扣 | not_run |
| V051-AT157 | I05 | runtime_contract | B4.5 | B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 转移6能量并重复同operation → 最终14与20，总量34；重复不二次转移 | not_run |
| V051-AT158 | I05 | runtime_contract | B4.4 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 拆出设备后执行旧草案 → 旧草案明确陈旧/能力不足，不自动改装或消耗其他设备 | not_run |
| V051-AT159 | I05 | runtime_contract | B4.4 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 运行同一合格活动 → 能力分别normal/degraded/unavailable，拒绝/估计与预期一致且已知状态独立 | not_run |
| V051-AT160 | I05 | runtime_contract | B4.5 | B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 开始、完成2work后取消 → 耗1能量和1包、恢复0；未耗1释放。完整维护才恢复10，不能与原任务同时占用设备 | not_run |
| V051-AT161 | I05 | runtime_contract | B4.5 | B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 失链、拒收、取消各一支 → 转移责任唯一，未接受不入对方可用库存；不复用held/committed作为转移状态 | not_run |
| V051-AT162 | I05 | runtime_contract | B4.4 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 比较固定夹具工作时间 → 疲劳4的速率按0.75，重复同cause不叠扣；休息30000ms降一级 | not_run |
| V051-AT163 | I05 | runtime_contract | B4.4 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 选择修复目标 → 分别报告可见缺口；隐藏实际库存不能从preview错误泄漏 | not_run |
| V051-AT164 | I05 | runtime_contract | B4.4 | B4.5, B4.6, B4.9, B4.11, B5.3, B6.1, B6.8 | 执行F03的10和15负重变体 → 12000与13000ms，环境1.25时15000ms；共享cause仅结算一次 | not_run |
| V051-AT165 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 调用含玩家私有报告的候选输出 → 输入无私有证据；伪引用拒绝，记录受限view hash与规则原因 | not_run |
| V051-AT166 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | Game逐项校验 → 零世界变化；公开拒绝原因不能暴露隐藏对象 | not_run |
| V051-AT167 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 推进本槽统一提交前快照 → 旧候选stale；新受限fallback输入有记录，不覆盖最新命令 | not_run |
| V051-AT168 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 旧响应到达，再正常签发玩家意图 → 旧自主请求取消且无自动意图；PlayerView不加本地未上报信息，玩家意图仍需消息 | not_run |
| V051-AT169 | I08 | runtime_contract | B6.2 | B6.3, B6.8 | 继续模拟至slot → 记录四种失败，均用离线后备；其他角色与时钟继续 | not_run |
| V051-AT170 | I08 | runtime_contract | B6.3 | B6.8 | 再请求第五项 → 排队或明确预算后备，未超限；角色顺序及fairness记录 | not_run |
| V051-AT171 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 提交AI候选 → 同内容收据幂等；异内容拒绝，无重复库存/事件 | not_run |
| V051-AT172 | I08 | runtime_contract | B6.3 | B6.8 | 恢复后断网 → 不自动重发旧外部调用；有界取消并按记录后备，恢复paused | not_run |
| V051-AT173 | I08 | runtime_contract | B6.3 | B6.8 | 相同规则与流回放 → 不重新调用模型，世界摘要及决定日志相同 | not_run |
| V051-AT174 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 仅返回CandidateIntent → 文字不写世界；展示proposal/validated/applied各状态，未校验不能标已执行 | not_run |
| V051-AT175 | I13 | runtime_contract | B2.4 | B3.5, B4.12, B5.5, B6.3, B6.5（启用时）, B6.8 | 终局共同复盘 → 参与名单来自实际记录，各声明用DebriefEvidenceRef及四层标记，正常视图权限不扩大 | not_run |
| V051-AT176 | I13 | runtime_contract | B2.4 | B3.5, B4.12, B5.5, B6.3, B6.5（启用时）, B6.8 | 请求解释原因 → 明确not_recorded；可另标retrospective_inference，不伪造当时说过的话 | not_run |
| V051-AT177 | I13 | runtime_contract | B2.4 | B3.5, B4.12, B5.5, B6.3, B6.5（启用时）, B6.8 | 评价当时决定 → 引用当时证据层，后来真值独列；不倒灌到known_then | not_run |
| V051-AT178 | I13 | runtime_contract | B2.4 | B3.5, B4.12, B5.5, B6.3, B6.5（启用时）, B6.8 | 点击引用并历史跳转 → 能定位原report/event/decision，缺引用拒绝或标unsupported | not_run |
| V051-AT179 | I13 | runtime_contract | B6.3 | B6.5（启用时）, B6.8 | 校验DebriefClaim → 三类均不能进入有证据摘要；原记录不被覆盖 | not_run |
| V051-AT180 | I13 | runtime_contract | B5.5 | B6.3, B6.5（启用时）, B6.8 | 建立只改一个决定的反事实分支 → 原局hash不变，分支有parent与改变项；未知未来不注入起点 | not_run |
| V051-AT181 | I13 | runtime_contract | B6.3 | B6.5（启用时）, B6.8 | 打开共同复盘并追问 → 模板列角色、事件、证据和缺理由，基础复盘完整可用 | not_run |
| V051-AT182 | I13 | runtime_contract | B5.5 | B6.3, B6.5（启用时）, B6.8 | 计算DecisionQuality → 四项分值及依据相同；结果向量可不同 | not_run |
| V051-AT183 | I13 | runtime_contract | B2.4 | B3.5, B4.12, B5.5, B6.3, B6.5（启用时）, B6.8 | 导出复盘 → 明确缺失/不可评价，不补编媒体内容；原报告索引保留 | not_run |
| V051-AT184 | I13 | runtime_contract | B2.4 | B3.5, B4.12, B5.5, B6.3, B6.5（启用时）, B6.8 | 在终局known/truth层切换 → 显式标签及权限；正常游戏入口仍不可切换为敌方真值 | not_run |
| V051-AT185 | I12 | runtime_contract | B5.2 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 离线重新生成 → Geometry/目标/证据链与摘要相同，不重新调用外部模型 | not_run |
| V051-AT186 | I12 | runtime_contract | B5.2 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 重复生成与执行 → 天气、误报和消息抽样序列不变；文字流独立 | not_run |
| V051-AT187 | I12 | runtime_contract | B5.3 | B5.4, B5.6, B6.1, B6.3, B6.8 | 检查标准局完整witness → 拒绝并保存具体检查理由，私有解法不下发，不能注册标准局 | not_run |
| V051-AT188 | I12 | runtime_contract | B5.3 | B5.4, B5.6, B6.1, B6.3, B6.8 | 验证信息可获得性 → 拒绝不可玩局；解法见证不下发玩家/角色AI | not_run |
| V051-AT189 | I12 | runtime_contract | B5.3 | B5.4, B5.6, B6.1, B6.3, B6.8 | 生成请求完成 → GENERATION_EXHAUSTED，记录20seed与原因，不偷换难度/根seed | not_run |
| V051-AT190 | I12 | runtime_contract | B5.2 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 绑定冻结世界后校验 → 拒绝文本候选或重写其表达；不制造世界实体或改胜负 | not_run |
| V051-AT191 | I12 | manual_or_experiment | B5.3 | B5.4, B5.6, B6.1, B6.3, B6.8 | 批量工程检查 → 保留所有尝试/拒绝，发布局硬失败0；拒绝>20%停止达标声明 | not_run |
| V051-AT192 | I12 | manual_or_experiment | B5.3 | B5.4, B5.6, B6.1, B6.3, B6.8 | 计算结构多样性 → 文本改名不计结构变化；分布与重复指标分别报告 | not_run |
| V051-AT193 | I12 | runtime_contract | B5.4 | B5.6, B6.1, B6.3, B6.8 | 旧新版本交叉恢复 → 按schema4拒绝不兼容或显式迁移；不得静默重生成替代 | not_run |
| V051-AT194 | I12 | manual_or_experiment | B5.6 | B6.1, B6.3, B6.8 | 顺序交换收反馈 → 原始意见、样本、误解/负荷/未测组合保留；探索后再提正式门槛，无6/8达标线 | not_run |
| V051-AT195 | I12 | runtime_contract | B2.4 | B4.9, B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 按OutcomePolicy结算 → 硬终局优先，列已取得成果；没有双终局或抹除成果 | not_run |
| V051-AT196 | I12 | runtime_contract | B2.4 | B4.9, B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 推进10000ms回执宽限 → 仅前支可计确认；期后作业/验证/交接不补success，特殊规则开局明确 | not_run |
| V051-AT197 | I12 | runtime_contract | B2.4 | B4.9, B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 中止收尾或明确期限/不可恢复阻塞 → 按公开partial/aborted组合结算；无可见进展仅提醒，不作为失败/partial终止 | not_run |
| V051-AT198 | I12 | runtime_contract | B2.4 | B4.9, B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 跨窗口及公开长等待 → 只提醒暂无新增总部反馈，不判失败；重复不重置，公开等待可豁免，不露内部进度 | not_run |
| V051-AT199 | I12 | runtime_contract | B2.4 | B4.9, B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 四维规则评价 → 成功不补分；必要记录缺失not_evaluable；未填理由不是违规，评价引用当时规则 | not_run |
| V051-AT200 | I06 | runtime_contract | B3.5 | B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 按实际观察/递交和关系到达查看 → 纠正保旧，未采不否定全区；已知同源不增信；未知来源不自动归并/计独立，历史不回填 | not_run |
| V051-AT201 | I01 | runtime_contract | B2.4 | B2.5, B3.5, B4.12, B5.1, B5.6, B6.1, B6.8 | 离线完整任务至结构化证据复盘 → 每步真实规则收据；两选择有解释差异，情报影响选择/结果；工程G01算术不能代替 | not_run |
| V051-AT202 | I08 | runtime_contract | B6.3 | B6.8 | 重复请求与切角色 → 预算只计真实调用一次，累计≤100；预算耗尽后备且日志解释 | not_run |
| V051-AT203 | I13 | runtime_contract | B2.4 | B3.5, B4.12, B5.5, B6.3, B6.5（启用时）, B6.8 | 共同复盘和导出 → 参与列表来自记录，未发言标无声明/故障；不静默丢掉角色 | not_run |
| V051-AT204 | I12 | runtime_contract | B5.2 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 加载并生成 → 三类拒绝准确，不使用B01或代码隐含常量代替 | not_run |
| V051-AT205 | I14 | manual_or_experiment | B6.6 | B6.7, B6.8 | 在记录的参考机测试 → P95读写≤500ms、反馈≤2s、地图≤3s，否则未达包络；不是当前实现结果 | not_run |
| V051-AT206 | I02 | runtime_contract | B1.3 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 混单位、拆分tick与恢复 → 单位不相容拒绝；累计有理数最终取整一次，大小步账务一致 | not_run |
| V051-AT207 | I14 | document_rule | B6.8 | 在本批最终构建核对；后续改变则重新审影响 | 运行独立文档检查 → 244唯一主归属、依赖无环、版本链接一致；软件验收仍not_run | not_run |
| V051-AT208 | I14 | document_rule | B6.8 | 在本批最终构建核对；后续改变则重新审影响 | 发布当前状态 → pending_owner_review/frozen=false；not_implemented/not_run；software_verified=false、experience_reviewed=false，不称拟真证明 | not_run |
| V051-AT209 | I01 | runtime_contract | B2.3 | B2.5, B3.5, B4.12, B5.1, B5.6, B6.1, B6.8 | 分别选择先核实/先可逆准备，另忽略必要证据 → 两合法路径有可解释时间/耗用/预约差异；情报改变实际可执行选择；忽略必要证据到截止产生不同结果，不直接写success | not_run |
| V051-AT210 | I01 | runtime_contract | B2.1 | B2.5, B3.5, B4.12, B5.1, B5.6, B6.1, B6.8 | 画草案、签发、推进并看收到定位 → 连续位置按几何规则变化，草案不改世界；总部只收到位置；不是节点瞬移 | not_run |
| V051-AT211 | I02 | runtime_contract | B1.1 | B2.4, B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 默认启动，另开research，尝试局内切换 → 默认command，research开局可选；局内MODE_LOCKED，无状态副作用 | not_run |
| V051-AT212 | I02 | runtime_contract | B2.5 | B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 失焦请求、重复请求、恢复焦点 → 管理暂停由Game收据确认，未确认不伪停；回到窗口需continue；暂停原因/时长单列 | not_run |
| V051-AT213 | I02 | runtime_contract | B2.5 | B4.11, B5.4, B5.5, B6.2, B6.3, B6.8 | 等待并编辑，随后关闭应用重开 → 阅读编辑仍推进；恢复paused，关闭期间不墙钟补算 | not_run |
| V051-AT214 | I14 | manual_or_experiment | B2.5 | B5.6, B6.6, B6.7, B6.8 | 记录有效游玩/暂停/复盘时间 → 20–30只待实测目标；回归常量原样，不解释为现实任务时间或已达标 | not_run |
| V051-AT215 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 预览、保存、签发，输入歧义自然语言 → 草案/签发/接受分离；备注不直接执行；后续自然语言能力未实现时明确回结构化 | not_run |
| V051-AT216 | I04 | runtime_contract | B6.1 | B6.6, B6.8 | 画合法跨面折线并推进两种步长 → 累计62500ms；障碍/越界/无入口逐类拒绝；渲染与规则同geometry_version | not_run |
| V051-AT217 | I04 | declaration_plus_runtime_evidence | B6.1 | B6.6, B6.8 | 分别描述能力、检完整出口 → 第一版只声明corridor；完整I04必须验证free_surface，不永久删B或not_applicable | not_run |
| V051-AT218 | I06 | runtime_contract | B2.3 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 自动折叠并展开 → 显示一已证来源，三Delivery和原件可读；确认不升为三独立证据 | not_run |
| V051-AT219 | I06 | runtime_contract | B3.1 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 运行去重与研判 → 不按内容相同折为同源；原件分别保留，印证仍由证据/研判规则处理 | not_run |
| V051-AT220 | I06 | runtime_contract | B3.1 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 提示疑似关联，玩家保留候选 → 只suspected/unknown，不自动定论同源/同事件；独立证据数未知，不自动三或一 | not_run |
| V051-AT221 | I06 | runtime_contract | B3.1 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 对比PlayerView/计数/错误；后来递交关联凭证 → 先期投影完全不变；只有合法凭证到达后新投影更新，历史不回填 | not_run |
| V051-AT222 | I06 | runtime_contract | B3.1 | B3.5, B4.1, B4.3, B5.3, B6.2, B6.5（启用时）, B6.8 | 收录、排序、检查新鲜度和门槛 → unknown无value，不伪造0或用收到代替；缺必要时间仅unknown/待核实，不错误confirmed | not_run |
| V051-AT223 | I07 | runtime_contract | B4.2 | B4.9, B4.11, B5.3, B6.2, B6.8 | 排队至到期、恢复、接收各版本 → 三独立状态策略；sent/delivered/accepted/effective分离；优先级不破链/权限，远端不瞬变 | not_run |
| V051-AT224 | I10 | runtime_contract | B4.10 | B4.11, B5.3, B5.4, B6.2, B6.8 | 挂起、B、恢复A → B25000–35000完成，A40000–60000完成；两切换总10000ms，工作/耗用不重做 | not_run |
| V051-AT225 | I10 | runtime_contract | B4.10 | B4.11, B5.3, B5.4, B6.2, B6.8 | 请求挂起、提升等待优先级、显式终止 → 拒绝无副作用；aging有界只重排未开始/挂起，FIFO原票保留，终止保留实际耗用 | not_run |
| V051-AT226 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 查看、传递、接受、旧模型返回 → PlayerView不增私有信息；收到前仅requested；生效后取消旧自主请求，玩家意图仍走正常消息 | not_run |
| V051-AT227 | I08 | runtime_contract | B6.2 | B6.3, B6.8 | 运行校验到slot并看采纳记录 → 及时响应真实成为accepted/applied意图；迟到后备不可替；两者同角色时间规则，网络不冻结Game | not_run |
| V051-AT228 | I08 | runtime_contract | B4.1 | B4.2, B4.8, B5.2, B6.2, B6.3, B6.8 | 重跑规则角色并查看因果 → 不新增随机怠工；差异仅有已注册信息/负荷/偏好原因，flavor不改行为 | not_run |
| V051-AT229 | I12 | runtime_contract | B5.3 | B5.4, B5.6, B6.1, B6.3, B6.8 | 标准局GenerationCheck → 拒绝标准局，标证据时限缺口；见证私有，不以概率赌对冒充可辨识 | not_run |
| V051-AT230 | I12 | runtime_contract | B5.2 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 开局、修改、保存恢复 → 开局档冻；修改须新局；自定义另标不混标准验证，缺未实现能力明确而不静默替代 | not_run |
| V051-AT231 | I12 | runtime_contract | B2.4 | B4.9, B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 推进并查看告警/终局 → 仅总部反馈提醒，不失败、不说现场停工、不露私有进度；仍按合法结束条件 | not_run |
| V051-AT232 | I12 | runtime_contract | B2.4 | B4.9, B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 推进提醒窗口 → 均不重置本目标可见进展；隐藏变化不改变提示信息或暴露未来 | not_run |
| V051-AT233 | I12 | runtime_contract | B4.9 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 跨提醒窗并接收新承诺 → 公开等待豁免；延期只据新消息，deadline有界；不得以未来引擎承诺自动免提醒 | not_run |
| V051-AT234 | I12 | runtime_contract | B2.4 | B4.9, B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 推进到610000宽限末 → 第一支可计确认；第二支不补success；源时点保留，评分截止与之后向量分开 | not_run |
| V051-AT235 | I12 | runtime_contract | B2.4 | B4.9, B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 继续收尾/截止/退出恢复 → 有义务terminating至有界截止；无义务可finished；退出只保存；不新增主目标或伪造回收/释放 | not_run |
| V051-AT236 | I03 | runtime_contract | B2.2 | B3.3, B4.2, B4.8, B5.3, B6.4（启用时）, B6.8 | 留痕、评估、事后写解释 → 无理由not_recorded，需理由的评价not_evaluable而非0；完整违规按规则；事后解释另层不改历史 | not_run |
| V051-AT237 | I13 | runtime_contract | B2.4 | B3.5, B4.12, B5.5, B6.3, B6.5（启用时）, B6.8 | 追问并跳原证据 → 首版结构化完整可用；自由文字仅授权已有记录，解析失败回选题/unsupported，不新编事件 | not_run |
| V051-AT238 | I13 | runtime_contract | B5.5 | B6.3, B6.5（启用时）, B6.8 | 创建、记录固定比较流、尝试旧候选 → 原局hash不变；旧候选无效不强复用；角色无未来输入，标事后实验，不伪公平再赛 | not_run |
| V051-AT239 | I02 | runtime_contract | B5.4 | B5.5, B6.2, B6.3, B6.8 | resume_latest和restore_copy → 前者继续最后提交；后者新run映射所属引用并保留rng来源；原局不覆盖，恢复paused | not_run |
| V051-AT240 | I02 | runtime_contract | B5.4 | B5.5, B6.2, B6.3, B6.8 | 读新局和统计结果 → 新局不解真值，标已知真相重玩/来源；不混首次公平局，不声称能测全部玩家记忆 | not_run |
| V051-AT241 | I14 | manual_or_experiment | B2.5 | B5.6, B6.6, B6.7, B6.8 | 记录意见、误解、负荷及状态 → 实际数如实记；无6/8达标线，不假称招齐；探索后门槛仍待预登记，体验达标/军事证明不成立 | not_run |
| V051-AT242 | I01 | declaration_plus_runtime_evidence | B2.4 | B2.5, B3.5, B4.12, B5.1, B5.6, B6.1, B6.8 | 检查I01及能力出口 → 工程回归不能叫第一可玩；须连续地图、两合理选择、情报影响结果、到证据复盘全链 | not_run |
| V051-AT243 | I12 | runtime_contract | B5.2 | B5.3, B5.4, B5.6, B6.1, B6.3, B6.8 | 加载/生成/恢复 → 明确配置错误，无隐含fallback；基准/PLAY/legacy档版本和hash分别验证 | not_run |
| V051-AT244 | I02 | runtime_contract | B5.4 | B5.5, B6.2, B6.3, B6.8 | 导入、重复id与显式复制 → 拒绝不兼容且保留原件；只schema相同不通过，复制仍要求完整版本/能力/hash | not_run |


## 检查结果

244个ID连续且唯一；原责任I01—I14均保持；没有遗漏、重复首实现批或倒序回归。39批blocking edges无环。各阶段规划首实现合同数不是实际完成量，详见路线图；第一阶段仅11条，其他合同仍明确保留。仅静态映射/出处核对，不是应用测试、浏览器测试、生成器运行或玩家体验证据。

公开范围说明：本包保留产品规则、参数、场景、244 项验收及原七阶段十四任务对照。历史版本、逐题讨论、审批原始记录、私有任务单、执行日志、工具配置和技能源码不在公开范围。涉及 V0.5/B01-LEGACY 历史夹具的条目只保留引用含义；历史输入未随本包公开，后续验证须另行取得获准且完整的版本化输入，不用当前 FIC 档替代。
