import type {LogEntry,PlayerView} from './contracts';
import type {PrestartCaseRef} from './contracts';
export const message_condition_copy:Record<PrestartCaseRef,string>={normal:'正常联络',hq_short_outage:'短时联络中断',hq_expiry_outage:'请求等候过久',old_acceptance_delayed:'原接令回报较晚',hq_result_unconfirmed:'替代结果回报未及时收到',reports_unconfirmed:'所有回报未及时收到'};
export function clock(ms:number):string {const seconds=Math.floor(ms/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}${ms%1000?'.'+String(ms%1000).padStart(3,'0'):''}`;}
const errors:Record<string,string>={
  WRITER_BUSY:'另一个窗口正在指挥。请先关闭原窗口，再在这里接手。',
  LOCK_UNSUPPORTED:'当前浏览器无法保证单一窗口指挥，请使用支持此演练的桌面浏览器。',
  INVALID_INPUT:'指令内容不完整或超出本次演练范围，请核对后再试。',
  INVALID_REQUEST:'任务结构、引用或输入预算不符合要求，原记录与输入仍保留。请核对阶段依赖、路线和文字。',
  OBJECT_VERSION_CONFLICT:'任务版本已更新，输入仍保留。请读取当前版本并重新核对。',
  AUTHORITY_DENIED:'既有参谋预授权未覆盖当前任务、主体、行动、路线、时段或风险，请核对授权缺口。',
  EVIDENCE_REQUIRED:'缺少当前主体可合法使用的依据，或尚无唯一精确起点；原记录与输入保留。',
  CONSTRAINT_HOLD:'门槛依据未知或已过期，请核实后重新核对；本次未下达。',
  CONSTRAINT_DENIED:'已知硬条件、资源或时间窗不满足；接受风险或备注不能覆盖，原记录保留。',
  CAPACITY_CONFLICT:'当前已知的预约或发送窗口冲突，请核对已有安排。',
  STATE_CONFIRMATION_REQUIRED:'请先等待对应阶段的合法终止或确认回报；未知结果不能当作已完成。',
  OPERATION_ID_REUSED:'原操作身份已用于另一份内容，请先查询原操作结果。',
  INVALID_DEFINITION:'演练资料无法核对，未开始新的行动。请重新打开页面。',
  INVALID_SAVE:'存档资料无法核对，原记录仍保留。本次没有恢复行动。',
  HISTORY_READ_ONLY:'历史记录只能查看，请返回当前行动后再操作。',
  RUN_NOT_FOUND:'未找到这场行动的记录，请返回开始页选择现有记录。',
  STALE_REVISION:'情况记录已更新，请重新核对预案后再下达。',
  STALE_PLAN:'预案所依据的情况已更新，请重新核对。',
  OPERATION_CONFLICT:'指令内容与已登记记录不一致，请先查询原指令结果。',
  ORDER_EXISTS:'本次演练只允许下达一项任务，原任务仍保留，请查看回报。',
  REPLACEMENT_LIMIT:'本场唯一的替代请求已登记，请查询或重试原请求，不能另下第二项替代。',
  AUTHORITY_EXPIRED:'本次指挥授权已到期，不能再下达新任务。',
  MODE_LOCKED:'本场演练的时间方式已确定，不能在行动中更改。',
  TIME_REVERSED:'目标时刻早于当前时刻，请选择更晚的时间。',
  TIME_NOT_ADVANCED:'目标时刻必须晚于当前时刻，请选择更晚的时间。',
  CLOCK_PAUSED:'指挥时间已经暂停，请明确继续后再等待行动推进。',
  RUN_ENDED:'本次行动已结束，请查看已收到的行动记录。',
  STALE_WRITER:'指挥权已交给另一个窗口，本窗口不能继续操作。请重新打开行动记录。',
  CHANNEL_UNCERTAIN:'暂未收到确认。请查询原指令结果，避免重复下达。',
  STORAGE_UNCONFIRMED:'本次操作尚未确认保存。请保留输入，恢复最近的可靠记录后再继续。',
  ENGINE_UNCONFIRMED:'当前行动记录无法核对，本次操作未确认保存。请保留输入并恢复最近记录。',
};
export function error_copy(code:string,field_path?:string):string {
  if(code==='INVALID_REQUEST'){
    if(field_path==='mission_draft.phases.self_dependency')return '阶段不能依赖自身（自环）。请修改前置阶段；原记录与输入仍保留。';
    if(field_path==='mission_draft.phases.cyclic_dependencies')return '阶段前置关系形成循环。请修改依赖；原记录与输入仍保留。';
    if(field_path==='mission_draft.phases.dangling_dependency')return '前置阶段不存在。请核对引用；原记录与输入仍保留。';
  }
  return errors[code]??'本次操作暂未得到可靠确认，请保留输入并查看最近的行动记录。';
}
export function log_copy(entry:LogEntry):string {
  if(entry.text.startsWith('准备期'))return entry.observed===undefined?entry.text:`${entry.text} 观察 ${clock(entry.observed)} · 总部收到 ${clock(entry.at)}。`;
  if(entry.text.startsWith('档案任务'))return '档案简报已送达，记录组 R 最后确认位于工位 H。';
  if(entry.text.startsWith('记录')){
    if(entry.kind==='issued')return '记录任务已签发登记，尚未发送；等待总部发送。';
    if(entry.kind==='sent')return '总部已发送记录任务，等待记录组接令回报。';
    if(entry.kind==='accepted_receipt')return `记录组接令回报已收到：接令 ${clock(entry.observed??entry.at)}，总部收到 ${clock(entry.at)}。`;
    if(entry.kind==='fix_receipt')return `记录开始回报已收到：开始 ${clock(entry.observed??entry.at)}，总部收到 ${clock(entry.at)}。`;
    if(entry.kind==='complete_receipt')return `记录成果回报已收到 · 未核验：完成 ${clock(entry.observed??entry.at)}，总部收到 ${clock(entry.at)}。`;
    if(entry.kind==='deadline_receipt')return '记录组回报：未在时限内完成，宽限只等待已有回报。';
  }
  if(entry.kind==='report')return '工位登记报告已送达。R最后确认位于总部起点H。';
  if(entry.kind==='issued')return '通行命令已登记并发出，等待编组接令回报。';
  if(entry.kind==='accepted_receipt')return 'R已确认接令并开始行动。';
  if(entry.kind==='fix_receipt')return `收到R的位置回报：观察 ${clock(entry.observed??entry.at)}，总部收到 ${clock(entry.at)}。`;
  if(entry.kind==='complete_receipt')return `抵达回报已收到：抵达 ${clock(entry.observed??entry.at)}，总部确认 ${clock(entry.at)}。`;
  if(entry.kind==='deadline_receipt')return '编组回报：未在时限内完成任务。确认宽限不能用来补做任务。';
  if(entry.kind==='deadline')return '行动时限已到，尚未下达任务。';
  return '行动记录已更新。';
}
export function status_copy(view:PlayerView):string {
  if(view.scenario_kind==='prestart_move'&&view.status==='deadline')return view.log.some(entry=>entry.kind==='deadline_receipt')?'已收到截止未完成回报':'公开行动窗口已结束，未确认事项保留';
  if(view.scenario_kind==='record'){
    if(view.status==='ready')return '尚未下达。当前只显示草案条件、假设耗时与假设消耗。';
    if(view.status==='queued')return view.gap;
    if(view.status==='finished')return '已收到记录成果回报 · 未核验';
    if(view.status==='deadline')return '已收到截止情况，未完成记录';
    return view.log.some(entry=>entry.kind==='fix_receipt')?'已收到开始记录回报，等待记录成果回报':'记录组已接令，等待开始记录回报';
  }
  return {ready:'待命',queued:'等待接令回报',preparing:'已收到准备阶段回报',executing:'行动中，等待抵达回报',terminating:'等待指令结果与收尾回报',finished:'已收到抵达回报',deadline:'已收到截止回报'}[view.status];
}
export function activity_copy(entry:LogEntry):string {
  if(entry.text.startsWith('准备期'))return entry.activity_id?`活动凭证 · 本次通行任务 · ${{accepted_receipt:'接令及准备',replace_receipt:'替代确认',start_receipt:'开始移动',fix_receipt:'位置回报',complete_receipt:'抵达'}[entry.kind]??'任务回报'}`:'回报';
  return entry.activity_id?`活动凭证 · 本次记录任务 · ${{accepted_receipt:'接令',fix_receipt:'开始记录',complete_receipt:'完成记录'}[entry.kind]??'记录回报'}`:'回报';
}
