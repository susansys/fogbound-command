import type {LogEntry} from './contracts';
export function clock(ms:number):string {const seconds=Math.floor(ms/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}${ms%1000?'.'+String(ms%1000).padStart(3,'0'):''}`;}
const errors:Record<string,string>={
  WRITER_BUSY:'另一个窗口正在指挥。请先关闭原窗口，再在这里接手。',
  LOCK_UNSUPPORTED:'当前浏览器无法保证单一窗口指挥，请使用支持此演练的桌面浏览器。',
  INVALID_INPUT:'指令内容不完整或超出本次演练范围，请核对后再试。',
  INVALID_DEFINITION:'演练资料无法核对，未开始新的行动。请重新打开页面。',
  INVALID_SAVE:'存档资料无法核对，原记录仍保留。本次没有恢复行动。',
  RUN_NOT_FOUND:'未找到这场行动的记录，请返回开始页选择现有记录。',
  STALE_REVISION:'情况记录已更新，请重新核对预案后再下达。',
  STALE_PLAN:'预案所依据的情况已更新，请重新核对。',
  OPERATION_CONFLICT:'指令内容与已登记记录不一致，请先查询原指令结果。',
  ORDER_EXISTS:'本次演练只允许下达一项任务，原任务仍保留，请查看回报。',
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
export function error_copy(code:string):string {return errors[code]??'本次操作暂未得到可靠确认，请保留输入并查看最近的行动记录。';}
export function log_copy(entry:LogEntry):string {
  if(entry.kind==='report')return '工位登记报告已送达。R最后确认位于总部起点H。';
  if(entry.kind==='issued')return '通行命令已登记并发出，等待编组接令回报。';
  if(entry.kind==='accepted_receipt')return 'R已确认接令并开始行动。';
  if(entry.kind==='fix_receipt')return `收到R的位置回报：观察 ${clock(entry.observed??entry.at)}，总部收到 ${clock(entry.at)}。`;
  if(entry.kind==='complete_receipt')return `抵达回报已收到：抵达 ${clock(entry.observed??entry.at)}，总部确认 ${clock(entry.at)}。`;
  if(entry.kind==='deadline_receipt')return '编组回报：未在时限内完成任务。确认宽限不能用来补做任务。';
  if(entry.kind==='deadline')return '行动时限已到，尚未下达任务。';
  return '行动记录已更新。';
}
