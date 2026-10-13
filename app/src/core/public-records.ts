import type {PlayerView} from '../contracts';
import type {State} from './state';

// Navigation uses only registered HQ inputs and already delivered public records.
// It adds no fields to persisted legacy snapshots and never consults remote work.
export function public_replay_nodes(state:Pick<State,'inputs'|'log'|'sim_time'>):NonNullable<PlayerView['replay_nodes']>{
  const consumed=new Set(state.log.filter(entry=>entry.kind==='report').map(entry=>entry.id));
  const commands=new Set<string>();
  const nodes:NonNullable<PlayerView['replay_nodes']>=[{revision:1,at:0,meaningful:true,label:'开局登记后 · 记录 1'}];
  for(const input of state.inputs){
    const intent=input.envelope.intent;
    const advances=intent.kind==='advance'||intent.kind==='tick'||input.clock_to!==undefined;
    const at=Math.min(state.sim_time,input.clock_to??(intent.kind==='advance'||intent.kind==='tick'?intent.to:input.at));
    const events=advances?state.log.filter(entry=>!consumed.has(entry.id)&&entry.at<=at&&entry.kind!=='issued'&&(entry.kind==='deadline'||[...commands].some(id=>entry.id.startsWith(`${id}:`)))):[];
    for(const entry of events)consumed.add(entry.id);
    if(intent.kind==='issue'){
      commands.add(intent.command_id);
      consumed.add(`${intent.command_id}:issued`);
    }
    const administrative={issue:'任务登记后',pause:'暂停确认后',continue:'继续确认后',rate:'速率确认后',save:'保存确认后',restore:'接手确认后',mode:'时间方式确认后'};
    const eventLabels:Record<string,string>={sent:'任务发送记录',accepted_receipt:'接令回报已收到',fix_receipt:'进展回报已收到',complete_receipt:'完成回报已收到',deadline:'行动时限已到',deadline_receipt:'截止回报已收到'};
    const title=intent.kind==='advance'||intent.kind==='tick'
      ?events.length?events.map(entry=>eventLabels[entry.kind]??'行动回报已收到').join('、'):'时间推进后'
      :administrative[intent.kind];
    nodes.push({revision:input.revision,at,meaningful:intent.kind!=='advance'&&intent.kind!=='tick'||events.length>0,label:`${title} · 记录 ${input.revision}`});
  }
  return nodes;
}
