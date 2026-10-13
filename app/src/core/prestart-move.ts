import {GameError,is_task_intent,type TaskIntent,type PrestartPlan,type PlayerView,type TaskRefusalReason} from '../contracts';
import type {State} from './state';
import {prestart_parameters,prestart_case} from './scenario';
type ReportKind='accepted_receipt'|'replace_receipt'|'rejected_receipt'|'start_receipt'|'fix_receipt'|'complete_receipt'|'deadline_receipt';
type Rejection=TaskRefusalReason;
type ReportPayload={kind:ReportKind;observed:number;sequence:number;activity_id:string;target:'N'|'T';supersedes?:string;rejection?:Rejection;position?:PlayerView['position'];resources:Pick<PlayerView['resources'],'equipment_energy'|'equipment_wear'|'movement_energy'|'movement_energy_reserved'|'confirmed_at'>};
type Request={command_id:string;issued:number;expiry:number;plan:PrestartPlan;reason?:string;sent_at?:number;delivered_at?:number;accepted_at?:number;rejected_at?:number;rejection?:Rejection;expired_at?:number;effective_at?:number};
type Activity={id:string;command_id:string;generation:number;phase:'preparing'|'moving'|'completed'|'superseded'|'stopped';accepted:number;starts:number;completes:number;reserved:number;settled:boolean};
type Event={id:string;at:number;phase:number;kind:'send_command'|'expire_command'|'receive_command'|'receive_report'|'start'|'fix'|'complete'|'deadline'|'grace'|'cleanup';command_id?:string;generation?:number;index?:number;payload?:ReportPayload};
type PhaseRecord={sequence:number;command_id:string;at:number;kind:'delivered'|'accepted'|'rejected'|'replacement_applied'|'effective'|'completed';supersedes?:string};
export type PrestartData={case_ref:string;requests:Request[];activities:Activity[];queue:Event[];records:PhaseRecord[]};
export function initial_prestart_data(deadline:number,case_ref='normal'):PrestartData{return {case_ref,requests:[],activities:[],records:[],queue:[{id:'objective-deadline',at:deadline,phase:0,kind:'deadline'}]};}
function record_phase(state:State,request:Request,kind:PhaseRecord['kind'],at:number){const records=state.prestart!.records;records.push({sequence:records.length+1,command_id:request.command_id,at,kind,...(kind==='replacement_applied'?{supersedes:request.plan.supersedes}:{})});}
export function can_register_prestart(state:Pick<State,'inputs'|'log'|'sim_time'|'public_rules'|'finished'|'ended'>):boolean{
  return !state.finished&&!state.ended&&state.sim_time>=state.public_rules.authority.from&&state.sim_time<state.public_rules.authority.to&&state.inputs.filter(input=>is_task_intent(input.envelope.intent)).length<2&&!state.log.some(entry=>['start_receipt','complete_receipt','deadline_receipt'].includes(entry.kind));
}
export function preview_prestart(state:State,editing_seq:number,allowed:boolean,gap:string):PrestartPlan{
  const original=state.inputs.find(input=>input.envelope.intent.kind==='issue')?.envelope.intent;
  const p=prestart_parameters(state);
  const replacement=original?.kind==='issue';
  return {kind:'prestart_move',run_id:state.run_id,revision:state.revision,editing_seq,version:1,actor:'R',target:replacement?'T':'N',path:replacement?'H-T':'H-N',distance:replacement?p.target[0]-p.origin[0]:p.near_distance,estimated_move_ms:replacement?p.move_ms:p.near_move_ms,setup_ms:p.setup_ms,link_ms:p.link_ms,definition_hash:state.definition_hash,allowed,gap:allowed?'':gap,...(replacement?{supersedes:original.command_id}:{})} as PrestartPlan;
}
export function register_prestart(state:State,intent:TaskIntent){
  if(!('kind' in intent.plan)||intent.plan.kind!=='prestart_move'||!state.prestart||state.prestart.requests.length>=2)throw new GameError('INVALID_INPUT');
  if(state.prestart.requests.some(request=>request.command_id===intent.command_id))throw new GameError('INVALID_INPUT');
  if(!can_register_prestart(state))throw new GameError('AUTHORITY_EXPIRED');
  const expected=preview_prestart(state,intent.plan.editing_seq,true,'');
  if(expected.supersedes?(intent.kind!=='replace_task'||intent.original_command_id!==expected.supersedes||intent.original_version!==1):intent.kind!=='issue')throw new GameError('INVALID_INPUT');
  if(Object.keys(expected).length!==Object.keys(intent.plan).length||Object.entries(expected).some(([key,value])=>Reflect.get(intent.plan,key)!==value))throw new GameError('INVALID_INPUT');
  const request={command_id:intent.command_id,issued:state.sim_time,expiry:state.sim_time+prestart_parameters(state).task_expiry_ms,plan:structuredClone(intent.plan),...(intent.reason===undefined?{}:{reason:intent.reason})};
  state.prestart.requests.push(request);
  if(!state.order){state.order={...structuredClone(request),accepted:null};state.status='queued';}state.generation++;
  state.log.push({id:`${intent.command_id}:issued`,at:state.sim_time,kind:'issued',text:'准备期通行任务已签发登记，尚未发送。',evidence:intent.command_id,sender:'总部指挥席'});
  state.prestart.queue.push({id:`${intent.command_id}:send_command`,at:state.sim_time,phase:5,kind:'send_command',command_id:intent.command_id},{id:`${intent.command_id}:expiry`,at:request.expiry,phase:4,kind:'expire_command',command_id:intent.command_id});
}
function locate(state:State,at:number){
  const data=state.prestart!;
  const activity=data.activities.find(activity=>activity.phase==='moving');if(!activity)return;
  const request=data.requests.find(request=>request.command_id===activity.command_id)!;
  const duration=request.plan.estimated_move_ms,elapsed=Math.max(0,Math.min(duration,at-activity.starts));
  state.world.position={xn:state.public_rules.geometry.H[0]*duration+request.plan.distance*elapsed,yn:state.public_rules.geometry.H[1]*duration,d:duration};
}
function send_report(state:State,request:Request,kind:ReportKind,at:number,index=0,includePosition=false){
  const p=prestart_parameters(state),calendar=prestart_case(state,state.prestart!.case_ref),received=at+(calendar.all_reports_delay_ms??(kind==='accepted_receipt'?calendar.old_acceptance_delay_ms??p.link_ms:kind==='rejected_receipt'?calendar.rejection_delay_ms??p.link_ms:p.link_ms));
  if(at>=p.send_authority_to)return;
  if(state.world.equipment_energy<p.message_energy||state.world.equipment_wear<p.message_wear)throw new GameError('ENGINE_UNCONFIRMED');
  state.world.equipment_energy-=p.message_energy;state.world.equipment_wear-=p.message_wear;state.world.sends++;
  const id=`${request.command_id}:${kind}:${index}`,word={accepted_receipt:'accept',replace_receipt:'replace',rejected_receipt:'refuse',start_receipt:'start',fix_receipt:'move',complete_receipt:'complete',deadline_receipt:'deadline'}[kind];
  const payload:ReportPayload={kind,observed:at,sequence:state.world.sends,activity_id:`${request.command_id}.${word}.${index}`,target:request.plan.target,...(kind==='replace_receipt'?{supersedes:request.plan.supersedes}:{}),resources:{equipment_energy:state.world.equipment_energy,equipment_wear:state.world.equipment_wear,movement_energy:state.world.movement_energy,movement_energy_reserved:state.world.movement_energy_reserved,confirmed_at:received},...(includePosition?{position:{x:Math.round(state.world.position.xn/state.world.position.d*100)/100,y:Math.round(state.world.position.yn/state.world.position.d*100)/100,observed:at,received,evidence:id}}:{})};
  if(kind==='rejected_receipt')payload.rejection=request.rejection;
  state.prestart!.queue.push({id,at:received,phase:40,kind:'receive_report',command_id:request.command_id,payload});
}
function reject(state:State,request:Request,at:number,rejection:Rejection){request.rejected_at=at;request.rejection=rejection;record_phase(state,request,'rejected',at);send_report(state,request,'rejected_receipt',at);}
function accept(state:State,request:Request,at:number){
  const data=state.prestart!;if(request.accepted_at!==undefined)throw new GameError('ENGINE_UNCONFIRMED');
  if(at>=state.public_rules.authority.to){reject(state,request,at,'authority_closed');return;}
  if(at>=request.expiry){reject(state,request,at,'request_expired');return;}
  if(request.plan.supersedes){
    const old=data.activities.find(activity=>activity.command_id===request.plan.supersedes);
    if(!old||old.phase!=='preparing'||at>=old.starts){reject(state,request,at,'window_closed');return;}
    old.phase='superseded';state.world.movement_energy_reserved=0;
  }
  request.accepted_at=at;record_phase(state,request,'accepted',at);if(request.plan.supersedes)record_phase(state,request,'replacement_applied',at);
  const p=prestart_parameters(state),generation=data.requests.indexOf(request)+1,reserved=Math.ceil(request.plan.distance*p.move_energy_per_100/100);
  const activity:Activity={id:`${request.command_id}.activity.${generation}`,command_id:request.command_id,generation,phase:'preparing',accepted:at,starts:at+p.setup_ms,completes:at+p.setup_ms+request.plan.estimated_move_ms,reserved,settled:false};
  data.activities.push(activity);state.world.movement_energy_reserved=reserved;
  send_report(state,request,request.plan.supersedes?'replace_receipt':'accepted_receipt',at);
  data.queue.push({id:`${request.command_id}:start`,at:activity.starts,phase:30,kind:'start',command_id:request.command_id,generation},{id:`${request.command_id}:complete`,at:activity.completes,phase:30,kind:'complete',command_id:request.command_id,generation});
  for(let index=1;index*p.fix_ms<request.plan.estimated_move_ms;index++)data.queue.push({id:`${request.command_id}:fix:${index}`,at:activity.starts+index*p.fix_ms,phase:30,kind:'fix',command_id:request.command_id,generation,index});
}
function pending_replacement(state:State):boolean{
  const replacement=state.inputs.find(input=>input.envelope.intent.kind==='replace_task')?.envelope.intent;
  return replacement?.kind==='replace_task'&&!state.log.some(entry=>entry.id.startsWith(`${replacement.command_id}:`)&&['replace_receipt','rejected_receipt','expired'].includes(entry.kind));
}
function end_known(state:State,unconfirmed=false){
  const terminal=state.known.prestart!.terminal;
  state.status=terminal?.kind??'deadline';state.finished=terminal?.kind==='finished';state.ended=true;state.paused=true;
  if(unconfirmed){
    const issued=state.inputs.filter(input=>is_task_intent(input.envelope.intent)).length;
    const pending=pending_replacement(state),originalExpired=state.log.some(entry=>entry.kind==='expired'&&entry.request_kind==='task');
    const text=issued===0?'准备期通行任务：尚未签发任务，公开窗口及回报宽限已结束。':pending?'准备期替代结果未确认；收尾上限已到，保留已经收到的原任务事实，不推断远端接受或拒绝。':originalExpired?'准备期原通行请求未发送且已过期；公开等待上限已到，保留这一已知行政结局。':'准备期通行任务结果未确认；公开等待上限已到，只保留已收到的事实，不推断远端完成。';
    state.log.push({id:'control-cleanup',at:state.sim_time,kind:'control_unconfirmed',text,sender:'总部指挥席',evidence:'public-cleanup-limit',request_kind:pending?'replacement':'task'});
  }
}
function settle_hq(state:State){
  const known=state.known.prestart!;if(!known.terminal)return;
  const pending=pending_replacement(state);
  state.status=pending?'terminating':known.terminal.kind;
  if(!pending){end_known(state);return;}
  if(known.cleanup_deadline===undefined){
    const p=prestart_parameters(state);known.cleanup_deadline=Math.min(known.terminal.received_at+p.cleanup_ms,p.deadline);
    if(known.cleanup_deadline>state.sim_time)state.prestart!.queue.push({id:'control-cleanup',at:known.cleanup_deadline,phase:50,kind:'cleanup'});
  }
  if(state.sim_time>=known.cleanup_deadline)end_known(state,true);
}
function deliver(state:State,event:Event){
  const payload=event.payload;if(!payload)throw new GameError('ENGINE_UNCONFIRMED');
  const latest=payload.sequence>state.known.prestart!.report_sequence;
  if(latest){Object.assign(state.known.resources,payload.resources);state.known.prestart!.report_sequence=payload.sequence;}
  if(payload.position&&payload.position.observed>=state.known.position.observed)state.known.position=structuredClone(payload.position);
  if(latest&&payload.kind!=='rejected_receipt')state.status=['accepted_receipt','replace_receipt'].includes(payload.kind)?'preparing':payload.kind==='complete_receipt'?'finished':payload.kind==='deadline_receipt'?'deadline':'executing';
  if(payload.kind==='replace_receipt'){
    if(!payload.supersedes||!event.command_id)throw new GameError('ENGINE_UNCONFIRMED');
    state.known.replacement={original_command_id:payload.supersedes,replacement_command_id:event.command_id,accepted_at:payload.observed,received_at:event.at,evidence:event.id};
  }
  const refusal=payload.rejection==='authority_closed'?'授权窗口已关闭，未开始新任务':payload.rejection==='request_expired'?'请求到达时已过期，未接受新任务':'替代窗口已关闭，原任务继续';
  const verb={accepted_receipt:'接令及准备',replace_receipt:'替代确认及重新准备',rejected_receipt:refusal,start_receipt:'开始移动',fix_receipt:'位置',complete_receipt:'抵达',deadline_receipt:'截止未抵达，已停止作业并结算截止前耗用'}[payload.kind];
  state.log.push({id:event.id,at:event.at,kind:payload.kind,text:`准备期通行任务：联络组 R 对目标 ${payload.target} 的${verb}回报已收到。`,sender:'联络组 R',observed:payload.observed,activity_id:payload.activity_id,evidence:event.id,...(payload.rejection?{rejection:payload.rejection}:{})});
  if(payload.kind==='complete_receipt')state.known.prestart!.terminal={kind:'finished',received_at:event.at};
  if(payload.kind==='deadline_receipt')state.known.prestart!.terminal={kind:'deadline',received_at:event.at};
  if(payload.kind==='rejected_receipt'&&payload.target==='N'&&payload.rejection==='authority_closed')state.known.prestart!.terminal={kind:'deadline',received_at:event.at};
  settle_hq(state);
}
function cutoff_work(state:State,at:number){
  const data=state.prestart!,p=prestart_parameters(state);
  const activity=data.activities.find(item=>item.phase==='preparing'||item.phase==='moving');
  if(activity){
    const request=data.requests.find(item=>item.command_id===activity.command_id)!;
    const distance=Math.max(0,state.world.position.xn-state.public_rules.geometry.H[0]*state.world.position.d);
    state.world.movement_energy-=Math.ceil(distance*p.move_energy_per_100/(state.world.position.d*100));
    activity.settled=true;activity.phase='stopped';state.world.movement_energy_reserved=0;
    send_report(state,request,'deadline_receipt',at,0,true);
  }
  state.world.stopped=true;
  state.log.push({id:'deadline',at,kind:'deadline',text:'准备期通行任务：公开行动时限已到，不再开始或补做移动；只等待此前事实的回报。',sender:'总部指挥席',evidence:'objective-deadline'});
  data.queue.push({id:'receipt-grace',at:at+p.grace,phase:50,kind:'grace'});
}
export function advance_prestart(state:State,to:number){
  const data=state.prestart;if(!data)throw new GameError('ENGINE_UNCONFIRMED');
  const sort=()=>data.queue.sort((a,b)=>a.at-b.at||a.phase-b.phase||a.id.localeCompare(b.id));sort();
  while(data.queue[0]?.at<=to&&!state.ended){
    const event=data.queue.shift()!;locate(state,event.at);state.sim_time=event.at;
    const request=data.requests.find(request=>request.command_id===event.command_id);
    if(event.kind==='receive_report'){deliver(state,event);sort();continue;}
    if(event.kind==='deadline'){cutoff_work(state,event.at);sort();continue;}
    if(event.kind==='cleanup'){end_known(state,pending_replacement(state));continue;}
    if(event.kind==='grace'){end_known(state,true);continue;}
    if(!request)throw new GameError('ENGINE_UNCONFIRMED');
    if(event.kind==='expire_command'){
      if(request.sent_at===undefined){request.expired_at=event.at;state.log.push({id:event.id,at:event.at,kind:'expired',text:request.plan.supersedes?'准备期替代请求未发送且已过期；原任务事实保留。':'准备期原通行请求未发送且已过期；这一已知行政结局保留。',sender:'总部指挥席',evidence:event.id,request_kind:request.plan.supersedes?'replacement':'task'});settle_hq(state);}
      else if(request.plan.supersedes&&pending_replacement(state))state.log.push({id:`${request.command_id}:window-ended`,at:event.at,kind:'request_window_ended',text:'准备期替代请求有效期已结束，已发送请求的结果未确认；不据有效期推断远端是否接受。',sender:'总部指挥席',evidence:event.id});
      continue;
    }
    if(event.kind==='receive_command'){request.delivered_at=event.at;record_phase(state,request,'delivered',event.at);accept(state,request,event.at);sort();continue;}
    if(event.kind==='send_command'){
      const p=prestart_parameters(state);
      if(request.expired_at!==undefined||event.at>=request.expiry)continue;
      const outage=prestart_case(state,data.case_ref).hq_unavailable.find(([from,to])=>event.at>=from&&event.at<to);
      if(outage){data.queue.push({...event,at:outage[1]});sort();continue;}
      if(request.sent_at!==undefined||(state.world.hq_energy??0)<p.message_energy||(state.world.hq_wear??0)<p.message_wear)throw new GameError('ENGINE_UNCONFIRMED');
      state.world.hq_energy!-=p.message_energy;state.world.hq_wear!-=p.message_wear;request.sent_at=event.at;
      state.known.resources.hq_energy=state.world.hq_energy;state.known.resources.hq_wear=state.world.hq_wear;
      state.log.push({id:event.id,at:event.at,kind:'sent',text:`准备期通行任务已实际发送至联络组 R，目标 ${request.plan.target}；等待接令回报。`,sender:'总部指挥席',evidence:event.id});
      data.queue.push({id:`${request.command_id}:receive_command`,at:event.at+p.link_ms,phase:10,kind:'receive_command',command_id:request.command_id});sort();continue;
    }
    const activity=data.activities.find(activity=>activity.command_id===request.command_id&&activity.generation===event.generation);
    if(!activity)throw new GameError('ENGINE_UNCONFIRMED');
    if(activity.phase==='superseded'||activity.phase==='stopped')continue;
    if(event.kind==='start'){activity.phase='moving';request.effective_at=event.at;record_phase(state,request,'effective',event.at);send_report(state,request,'start_receipt',event.at,0,true);}
    else if(event.kind==='fix')send_report(state,request,'fix_receipt',event.at,event.index,true);
    else if(event.kind==='complete'){
      if(activity.settled)throw new GameError('ENGINE_UNCONFIRMED');
      activity.settled=true;activity.phase='completed';state.world.movement_energy-=Math.ceil(request.plan.distance*prestart_parameters(state).move_energy_per_100/100);state.world.movement_energy_reserved=0;state.world.completed=true;
      record_phase(state,request,'completed',event.at);
      send_report(state,request,'complete_receipt',event.at,0,true);
    }
    sort();
  }
  if(!state.ended){locate(state,to);state.sim_time=to;}
}
