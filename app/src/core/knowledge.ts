import type { PlayerView } from "../contracts";
import type {PrestartCaseRef} from '../contracts';
import {is_task_intent} from '../contracts';
import type { State } from "./state";
import {public_replay_nodes} from './public-records';
import {can_register_prestart} from './prestart-move';
export function project_player_view(state: State): PlayerView {
  const issued=state.inputs.filter(input=>is_task_intent(input.envelope.intent)).length;
  const can_issue =
    (state.schema===6?can_register_prestart(state):state.status === "ready") &&
    !state.finished &&
    state.sim_time >= state.public_rules.authority.from &&
    state.sim_time < state.public_rules.authority.to;
  return {
    ...(state.schema===5?{scenario_kind:'record' as const}:{}),
    ...(state.schema===6?{scenario_kind:'prestart_move' as const}:{}),
    ...(state.schema===6?{scenario_case:state.prestart!.case_ref as PrestartCaseRef}:{}),
    ...(state.schema===6&&state.known.replacement?{replacement:structuredClone(state.known.replacement)}:{}),
    run_id: state.run_id,
    revision: state.revision,
    sim_time: state.sim_time,
    mode: state.mode,
    rate: state.rate,
    paused: state.paused,
    finished: state.finished,
    source_run: state.source_run,
    status: state.status,
    position: structuredClone(state.known.position),
    report: structuredClone(state.known.report),
    delivery: structuredClone(state.known.delivery),
    resources: structuredClone(state.known.resources),
    issued_orders: state.inputs.flatMap(input=>{
      const intent=input.envelope.intent;
      return is_task_intent(intent)?[{command_id:intent.command_id,issued:input.at,plan:structuredClone(intent.plan),...(intent.reason===undefined?{}:{reason:intent.reason})}]:[];
    }),
    ...(state.schema===5?{artifacts: structuredClone(state.known.artifacts??[])}:{}),
    replay_nodes:public_replay_nodes(state),
    geometry: structuredClone(state.public_rules.geometry),
    authority: structuredClone(state.public_rules.authority),
    can_issue,
    next_action: state.schema===6
      ?state.ended?'查看已收到的行动记录':issued===0?'先签发前往近联络点 N 的任务':can_issue?'等待回报；可登记一次改到 T 的替代请求':'等待已登记任务与替代请求的回报'
      :state.ended
      ? "查看已收到的行动记录"
      : state.status === "ready"
        ? can_issue
          ? state.schema===5?"阅读目标简报，拟定工位记录任务":"选择联络点T，核对并下达通行命令"
          : "查看原件与记录"
      : state.schema===5?"等待记录组回报":"等待编组位置及抵达回报",
    gap: state.schema===6
      ?prestart_gap(state,issued)
      :state.finished
      ? state.schema===5?"记录成果回执已收到":"完成回执已收到"
      : state.status === "deadline"
        ? "未在时限内完成任务，确认宽限不能用来补做任务"
        : state.status === "ready"
          ? can_issue
            ? state.schema===5?"尚未签发记录任务":"尚未签发移动任务"
            : "公开授权窗口已结束"
          : state.sim_time >= state.public_rules.authority.to
            ? "行动时限已到，只能等待此前已完成任务的回报"
            : state.status === "queued"
              ? state.schema===5?"记录任务已登记，尚未收到记录组接令回报":"命令已登记，尚未收到编组接令回报"
              : state.schema===5?"记录组已接令，尚未收到记录成果回报":"编组已接令并开始行动，尚未收到抵达回报",
    log: structuredClone(state.log),
  };
}
export const reconstruct_known=project_player_view;
function prestart_gap(state:Pick<State,'log'|'known'|'finished'>,issued:number):string{
  const originalExpired=state.log.some(entry=>entry.kind==='expired'&&entry.request_kind==='task');
  const ending=state.log.find(entry=>entry.kind==='control_unconfirmed');
  if(ending)return issued===0?'尚未签发任务，公开窗口及回报宽限已结束':ending.request_kind==='replacement'?'替代结果未确认，已收到的任务事实保留':originalExpired?'原通行请求未发送且已过期，已知行政结局保留':'任务结果未确认，已收到的事实保留';
  if(state.log.some(entry=>entry.kind==='request_window_ended'))return '替代请求有效期已结束，已发送结果未确认；不据有效期推断接受状态';
  if(state.log.some(entry=>entry.kind==='expired'))return originalExpired?'原通行请求未发送且已过期，已知行政结局保留':'替代请求未发送且已过期，原任务事实保留';
  if(state.finished)return '抵达回报已收到';
  const refusal=[...state.log].reverse().find(entry=>entry.kind==='rejected_receipt');
  if(refusal)return refusal.rejection==='window_closed'?'替代窗口已关闭，原任务继续':'请求未被接受，原任务事实保留';
  if(state.log.some(entry=>entry.kind==='deadline'))return '行动时限已到，只等待已有事实，不能补做任务';
  if(issued===0)return '尚未签发近点 N 任务';
  if(state.known.replacement)return '替代已确认，后续进展仍按收到的回报更新';
  if(issued===2)return '替代请求已登记，原任务回报仍保留，等待接受结果';
  return state.log.some(entry=>entry.kind==='start_receipt')?'已收到开始移动回报，不能再请求准备期替代':'原任务已登记；准备或开始情况均须等待回报';
}
