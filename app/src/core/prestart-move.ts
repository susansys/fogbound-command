import {GameError,type Intent,type PrestartPlan,type PlayerView} from '../contracts';
import type {State} from './state';
type ReportKind='accepted_receipt'|'replace_receipt'|'start_receipt'|'fix_receipt'|'complete_receipt';
type ReportPayload={kind:ReportKind;observed:number;activity_id:string;target:'N'|'T';supersedes?:string;position?:PlayerView['position'];resources:Pick<PlayerView['resources'],'equipment_energy'|'equipment_wear'|'movement_energy'|'movement_energy_reserved'|'confirmed_at'>};
type Request={command_id:string;issued:number;expiry:number;plan:PrestartPlan;reason?:string;sent_at?:number;accepted_at?:number};
type Activity={id:string;command_id:string;generation:number;phase:'preparing'|'moving'|'completed'|'superseded';accepted:number;starts:number;completes:number;reserved:number;settled:boolean};
type Event={id:string;at:number;phase:number;kind:'send_command'|'receive_command'|'receive_report'|'start'|'fix'|'complete'|'deadline';command_id?:string;generation?:number;index?:number;payload?:ReportPayload};
export type PrestartData={requests:Request[];activities:Activity[];queue:Event[]};
export function initial_prestart_data(deadline:number):PrestartData{return {requests:[],activities:[],queue:[{id:'objective-deadline',at:deadline,phase:30,kind:'deadline'}]};}
export function can_register_prestart(state:Pick<State,'inputs'|'log'|'sim_time'|'public_rules'|'finished'|'ended'>):boolean{
  return !state.finished&&!state.ended&&state.sim_time>=state.public_rules.authority.from&&state.sim_time<state.public_rules.authority.to&&state.inputs.filter(input=>input.envelope.intent.kind==='issue').length<2&&!state.log.some(entry=>['start_receipt','complete_receipt','deadline_receipt'].includes(entry.kind));
}
export function preview_prestart(state:State,editing_seq:number,allowed:boolean,gap:string):PrestartPlan{
  const original=state.inputs.find(input=>input.envelope.intent.kind==='issue')?.envelope.intent;
  const replacement=original?.kind==='issue';
  return {kind:'prestart_move',run_id:state.run_id,revision:state.revision,editing_seq,version:1,actor:'R',target:replacement?'T':'N',path:replacement?'H-T':'H-N',distance:replacement?120:60,estimated_move_ms:replacement?31800:15900,setup_ms:5000,link_ms:1000,definition_hash:state.definition_hash,allowed,gap:allowed?'':gap,...(replacement?{supersedes:original.command_id}:{})};
}
export function register_prestart(state:State,intent:Extract<Intent,{kind:'issue'}>){
  if(!('kind' in intent.plan)||intent.plan.kind!=='prestart_move'||!state.prestart||state.prestart.requests.length>=2)throw new GameError('INVALID_INPUT');
  if(!can_register_prestart(state))throw new GameError('AUTHORITY_EXPIRED');
  const expected=preview_prestart(state,intent.plan.editing_seq,true,'');
  if(Object.keys(expected).length!==Object.keys(intent.plan).length||Object.entries(expected).some(([key,value])=>Reflect.get(intent.plan,key)!==value))throw new GameError('INVALID_INPUT');
  const request={command_id:intent.command_id,issued:state.sim_time,expiry:state.sim_time+120000,plan:structuredClone(intent.plan),...(intent.reason===undefined?{}:{reason:intent.reason})};
  state.prestart.requests.push(request);
  if(!state.order){state.order={...structuredClone(request),accepted:null};state.status='queued';}state.generation++;
  state.log.push({id:`${intent.command_id}:issued`,at:state.sim_time,kind:'issued',text:'准备期通行任务已签发登记，尚未发送。',evidence:intent.command_id,sender:'总部指挥席'});
  state.prestart.queue.push({id:`${intent.command_id}:send_command`,at:state.sim_time,phase:5,kind:'send_command',command_id:intent.command_id});
}
function locate(state:State,at:number){
  const data=state.prestart!;
  const activity=data.activities.find(activity=>activity.phase==='moving');if(!activity)return;
  const request=data.requests.find(request=>request.command_id===activity.command_id)!;
  const duration=request.plan.estimated_move_ms,elapsed=Math.max(0,Math.min(duration,at-activity.starts));
  state.world.position={xn:state.public_rules.geometry.H[0]*duration+request.plan.distance*elapsed,yn:state.public_rules.geometry.H[1]*duration,d:duration};
}
function send_report(state:State,request:Request,kind:ReportKind,at:number,index=0,includePosition=false){
  if(state.world.equipment_energy<1||state.world.equipment_wear<1)throw new GameError('ENGINE_UNCONFIRMED');
  state.world.equipment_energy--;state.world.equipment_wear--;state.world.sends++;
  const id=`${request.command_id}:${kind}:${index}`,word={accepted_receipt:'accept',replace_receipt:'replace',start_receipt:'start',fix_receipt:'move',complete_receipt:'complete'}[kind];
  const payload:ReportPayload={kind,observed:at,activity_id:`${request.command_id}.${word}.${index}`,target:request.plan.target,...(kind==='replace_receipt'?{supersedes:request.plan.supersedes}:{}),resources:{equipment_energy:state.world.equipment_energy,equipment_wear:state.world.equipment_wear,movement_energy:state.world.movement_energy,movement_energy_reserved:state.world.movement_energy_reserved,confirmed_at:at+1000},...(includePosition?{position:{x:Math.round(state.world.position.xn/state.world.position.d*100)/100,y:Math.round(state.world.position.yn/state.world.position.d*100)/100,observed:at,received:at+1000,evidence:id}}:{})};
  state.prestart!.queue.push({id,at:at+1000,phase:20,kind:'receive_report',command_id:request.command_id,payload});
}
function accept(state:State,request:Request,at:number){
  const data=state.prestart!;if(request.accepted_at!==undefined)throw new GameError('ENGINE_UNCONFIRMED');
  if(request.plan.supersedes){
    const old=data.activities.find(activity=>activity.command_id===request.plan.supersedes);
    if(!old||old.phase!=='preparing'||at>=old.starts)throw new GameError('ENGINE_UNCONFIRMED');
    old.phase='superseded';state.world.movement_energy_reserved=0;
  }
  request.accepted_at=at;const generation=data.requests.indexOf(request)+1,reserved=Math.ceil(request.plan.distance/100);
  const activity:Activity={id:`${request.command_id}.activity.${generation}`,command_id:request.command_id,generation,phase:'preparing',accepted:at,starts:at+5000,completes:at+5000+request.plan.estimated_move_ms,reserved,settled:false};
  data.activities.push(activity);state.world.movement_energy_reserved=reserved;
  send_report(state,request,request.plan.supersedes?'replace_receipt':'accepted_receipt',at);
  data.queue.push({id:`${request.command_id}:start`,at:activity.starts,phase:10,kind:'start',command_id:request.command_id,generation},{id:`${request.command_id}:complete`,at:activity.completes,phase:10,kind:'complete',command_id:request.command_id,generation});
  for(let index=1;index*5000<request.plan.estimated_move_ms;index++)data.queue.push({id:`${request.command_id}:fix:${index}`,at:activity.starts+index*5000,phase:10,kind:'fix',command_id:request.command_id,generation,index});
}
function deliver(state:State,event:Event){
  const payload=event.payload;if(!payload)throw new GameError('ENGINE_UNCONFIRMED');
  Object.assign(state.known.resources,payload.resources);if(payload.position)state.known.position=structuredClone(payload.position);
  state.status=['accepted_receipt','replace_receipt'].includes(payload.kind)?'preparing':payload.kind==='complete_receipt'?'finished':'executing';
  if(payload.kind==='replace_receipt'){
    if(!payload.supersedes||!event.command_id)throw new GameError('ENGINE_UNCONFIRMED');
    state.known.replacement={original_command_id:payload.supersedes,replacement_command_id:event.command_id,accepted_at:payload.observed,received_at:event.at,evidence:event.id};
  }
  if(payload.kind==='complete_receipt'){state.finished=true;state.ended=true;state.paused=true;}
  const verb={accepted_receipt:'接令及准备',replace_receipt:'替代确认及重新准备',start_receipt:'开始移动',fix_receipt:'位置',complete_receipt:'抵达'}[payload.kind];
  state.log.push({id:event.id,at:event.at,kind:payload.kind,text:`准备期通行任务：联络组 R 对目标 ${payload.target} 的${verb}回报已收到。`,sender:'联络组 R',observed:payload.observed,activity_id:payload.activity_id,evidence:event.id});
}
export function advance_prestart(state:State,to:number){
  const data=state.prestart;if(!data)throw new GameError('ENGINE_UNCONFIRMED');
  const sort=()=>data.queue.sort((a,b)=>a.at-b.at||a.phase-b.phase||a.id.localeCompare(b.id));sort();
  while(data.queue[0]?.at<=to&&!state.ended){
    const event=data.queue.shift()!;locate(state,event.at);state.sim_time=event.at;
    const request=data.requests.find(request=>request.command_id===event.command_id);
    if(event.kind==='receive_report'){deliver(state,event);continue;}
    if(event.kind==='deadline'||!request)throw new GameError('ENGINE_UNCONFIRMED');
    if(event.kind==='receive_command'){accept(state,request,event.at);sort();continue;}
    if(event.kind==='send_command'){
      if(request.sent_at!==undefined||!state.world.hq_energy||!state.world.hq_wear)throw new GameError('ENGINE_UNCONFIRMED');
      state.world.hq_energy--;state.world.hq_wear--;request.sent_at=event.at;
      state.known.resources.hq_energy=state.world.hq_energy;state.known.resources.hq_wear=state.world.hq_wear;
      state.log.push({id:event.id,at:event.at,kind:'sent',text:`准备期通行任务已实际发送至联络组 R，目标 ${request.plan.target}；等待接令回报。`,sender:'总部指挥席',evidence:event.id});
      data.queue.push({id:`${request.command_id}:receive_command`,at:event.at+1000,phase:10,kind:'receive_command',command_id:request.command_id});sort();continue;
    }
    const activity=data.activities.find(activity=>activity.command_id===request.command_id&&activity.generation===event.generation);
    if(!activity)throw new GameError('ENGINE_UNCONFIRMED');
    if(activity.phase==='superseded')continue;
    if(event.kind==='start'){activity.phase='moving';send_report(state,request,'start_receipt',event.at,0,true);}
    else if(event.kind==='fix')send_report(state,request,'fix_receipt',event.at,event.index,true);
    else if(event.kind==='complete'){
      if(activity.settled)throw new GameError('ENGINE_UNCONFIRMED');
      activity.settled=true;activity.phase='completed';state.world.movement_energy-=Math.ceil(request.plan.distance/100);state.world.movement_energy_reserved=0;state.world.completed=true;
      send_report(state,request,'complete_receipt',event.at,0,true);
    }
    sort();
  }
  if(!state.ended){locate(state,to);state.sim_time=to;}
}
