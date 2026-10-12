import type {State} from './state';
import {GameError} from '../contracts';
import {hash,load_definition,engineeringDefinition} from './scenario';
import {record,valid_id,fields,valid_envelope} from '../protocol';
import {player_view,position,resources} from '../dto';
import {project_player_view} from './knowledge';
export function canonical(value:unknown):unknown{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,item])=>[key,canonical(item)]));
  return value;
}
export async function state_hash(state:State){const {integrity,...body}=state;return hash(canonical(body));}
function json_data(value:unknown,seen=new WeakSet<object>()):boolean{
  if(value===null||typeof value==='string'||typeof value==='boolean')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value!=='object'||seen.has(value))return false;
  seen.add(value);
  const keys=Reflect.ownKeys(value);
  const valid=Array.isArray(value)
    ?keys.length===value.length+1&&keys.every(key=>key==='length'||typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<value.length)&&value.every(item=>json_data(item,seen))
    :Object.getPrototypeOf(value)===Object.prototype&&keys.every(key=>typeof key==='string'&&Object.getOwnPropertyDescriptor(value,key)?.enumerable===true&&json_data((value as Record<string,unknown>)[key],seen));
  seen.delete(value);return valid;
}
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function pending_delivery(state:State,event:State['schedule'][number]):boolean{
  const order=state.order,parameters=engineeringDefinition.profile.parameters,geometry=engineeringDefinition.catalogs.geometry;
  if(!order)return event.kind==='deadline'&&event.id==='objective-deadline'&&event.payload===undefined;
  const expectedId=event.kind==='deadline_receipt'?`${order.command_id}:deadline_receipt`:`${order.command_id}:${event.kind}:${event.index??0}`;
  if(event.id!==expectedId)return false;
  const fix=event.kind==='fix'||event.kind==='fix_receipt';
  if(fix? !integer(event.index)||event.index<1||event.index*parameters.fix_ms>=parameters.move_ms : event.index!==undefined)return false;
  if(!event.kind.endsWith('receipt')){
    const at=event.kind==='deadline'?parameters.deadline:order.issued+parameters.link_ms+(event.kind==='fix'?event.index!*parameters.fix_ms:event.kind==='complete'?parameters.move_ms:0);
    return event.payload===undefined&&event.at===at;
  }
  const observed=event.kind==='deadline_receipt'?parameters.deadline:order.issued+parameters.link_ms+(event.kind==='fix_receipt'?event.index!*parameters.fix_ms:event.kind==='complete_receipt'?parameters.move_ms:0);
  if(event.at!==observed+parameters.link_ms)return false;
  if(!event.payload)return observed>state.sim_time;
  const payload=event.payload;
  if(!fields(payload,['observed','resources',...(payload.position===undefined?[]:['position'])])||observed>state.sim_time||payload.observed!==observed||event.at<observed+parameters.link_ms||!resources(payload.resources)||payload.resources.confirmed_at!==event.at||payload.resources.equipment_energy>parameters.equipment_energy||payload.resources.equipment_wear>parameters.equipment_wear||payload.resources.movement_energy>parameters.movement_energy)return false;
  if(event.kind==='accepted_receipt')return order.accepted===observed&&payload.position===undefined;
  if(event.kind==='complete_receipt'&&(!state.world.completed||observed>=parameters.deadline)||event.kind==='deadline_receipt'&&!state.world.stopped)return false;
  if(!payload.position||!position(payload.position)||payload.position.evidence!==event.id||payload.position.observed!==observed||payload.position.received!==event.at)return false;
  const elapsed=event.kind==='complete_receipt'?parameters.move_ms:event.kind==='deadline_receipt'?Math.max(0,Math.min(parameters.move_ms,observed-(order.accepted??observed))):event.index!*parameters.fix_ms;
  return payload.position.x===Math.round((geometry.H[0]+(geometry.T[0]-geometry.H[0])*elapsed/parameters.move_ms)*100)/100&&payload.position.y===Math.round((geometry.H[1]+(geometry.T[1]-geometry.H[1])*elapsed/parameters.move_ms)*100)/100;
}
function references(state:State){
  const parameters=engineeringDefinition.profile.parameters,catalogs=engineeringDefinition.catalogs;
  if(!fields(state as unknown as Record<string,unknown>,['integrity','run_id','revision','sim_time','mode','rate','paused','finished','ended','status','order','world','schedule','movement_rules','inputs','source_run','schema','contract','definition_hash','hashes','rng','generation','phase','known','public_rules','log']))return false;
  if(!integer(state.sim_time)||state.sim_time>610000||!integer(state.revision)||state.revision<1||!integer(state.generation)||!record(state.world)||!record(state.rng)||!record(state.known)||!record(state.public_rules))return false;
  if(!fields(state.known,['position','report','delivery','resources'])||!fields(state.public_rules,['geometry','authority','preview'])||!fields(state.world,['position','equipment_energy','equipment_wear','movement_energy','sends','completed','stopped'])||!fields(state.rng,['algorithm','version','seed','state','origin','used']))return false;
  if(state.rng.algorithm!=='xorshift32-v1'||state.rng.version!==1||state.rng.seed!==1||state.rng.state!==1||state.rng.used!==false||!valid_id(state.rng.origin))return false;
  if(state.source_run===null&&state.rng.origin!==state.run_id||state.source_run!==null&&!valid_id(state.source_run))return false;
  const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  if(!equal(state.known.report,catalogs.report)||!equal(state.known.delivery,catalogs.delivery)||!equal(state.movement_rules,{fix_ms:parameters.fix_ms,task_expiry_ms:parameters.task_expiry_ms}))return false;
  if(!equal(state.public_rules.geometry,{H:catalogs.geometry.H,T:catalogs.geometry.T,extent:parameters.extent,corridor_width:parameters.corridor_width,plain:catalogs.geometry.plain,rough:catalogs.geometry.rough})||!equal(state.public_rules.authority,{from:catalogs.authority.from,to:catalogs.authority.to})||!equal(state.public_rules.preview,{distance:120,estimated_move_ms:parameters.move_ms,link_ms:parameters.link_ms}))return false;
  if(!record(state.world.position)||!fields(state.world.position,['xn','yn','d'])||![state.world.position.xn,state.world.position.yn,state.world.position.d].every(integer)||state.world.position.d<1||state.world.position.yn!==catalogs.geometry.H[1]*state.world.position.d||state.world.position.xn<catalogs.geometry.H[0]*state.world.position.d||state.world.position.xn>catalogs.geometry.T[0]*state.world.position.d)return false;
  if(!integer(state.world.equipment_energy)||state.world.equipment_energy>parameters.equipment_energy||!integer(state.world.equipment_wear)||state.world.equipment_wear>parameters.equipment_wear||!integer(state.world.movement_energy)||state.world.movement_energy>parameters.movement_energy||!integer(state.world.sends)||state.world.sends>8||typeof state.world.completed!=='boolean'||typeof state.world.stopped!=='boolean'||typeof state.ended!=='boolean')return false;
  if(state.finished!==(state.status==='finished')||(state.status==='finished'||state.status==='deadline')&&(!state.ended||!state.paused)||state.finished&&!state.world.completed)return false;
  if(state.order){
    if(!fields(state.order,['command_id','issued','expiry','accepted','plan',...(state.order.reason===undefined?[]:['reason'])])||!integer(state.order.issued)||state.order.issued>state.sim_time||state.order.expiry!==state.order.issued+parameters.task_expiry_ms||state.order.accepted!==null&&(!integer(state.order.accepted)||state.order.accepted<state.order.issued+parameters.link_ms||state.order.accepted>=parameters.deadline||state.order.accepted>state.sim_time))return false;
    if(!valid_envelope({run_id:state.run_id,operation_id:'snapshot',expected_revision:state.revision,intent:{kind:'issue',command_id:state.order.command_id,plan:state.order.plan,...(state.order.reason===undefined?{}:{reason:state.order.reason})}})||state.order.plan.run_id!==state.run_id||state.order.plan.revision>state.revision)return false;
  }else if(['queued','executing','finished'].includes(state.status)||state.world.completed)return false;
  if(state.known.position.observed>state.known.position.received||state.known.position.received>state.sim_time||state.known.resources.confirmed_at>state.sim_time||state.log.some(x=>x.at>state.sim_time||x.observed!==undefined&&x.observed>x.at))return false;
  if(state.known.position.evidence!==catalogs.position.evidence&&!state.log.some(x=>x.id===state.known.position.evidence&&x.at===state.known.position.received&&x.observed===state.known.position.observed&&['fix_receipt','complete_receipt','deadline_receipt'].includes(x.kind)))return false;
  if(!Array.isArray(state.inputs)||state.inputs.length!==state.revision-1||new Set(state.inputs.map(x=>x.envelope.operation_id)).size!==state.inputs.length)return false;
  if(state.inputs.some((input,i)=>!record(input)||!fields(input,['envelope','at','revision',...(input.clock_to===undefined?[]:['clock_to'])])||!valid_envelope(input.envelope)||input.envelope.run_id!==state.run_id||input.revision!==i+2||input.envelope.expected_revision!==i+1||!integer(input.at)||input.at>state.sim_time||input.clock_to!==undefined&&(!integer(input.clock_to)||input.clock_to<input.at)))return false;
  if(!Array.isArray(state.schedule)||state.schedule.some((event,i)=>!record(event)||!fields(event,['id','at','phase','generation','kind',...(event.index===undefined?[]:['index']),...(event.payload===undefined?[]:['payload'])])||typeof event.id!=='string'||!integer(event.at)||event.at<state.sim_time||event.generation!==state.generation||event.phase!==(event.kind==='deadline'?30:event.kind.endsWith('receipt')?20:10)||!['accept','accepted_receipt','fix','fix_receipt','complete','complete_receipt','deadline','deadline_receipt'].includes(event.kind)||i>0&&state.schedule[i-1].at>event.at))return false;
  if(state.schedule.some(event=>!pending_delivery(state,event)))return false;
  if(new Set(state.schedule.map(event=>event.id)).size!==state.schedule.length)return false;
  if(state.schedule.some((event,i)=>i>0&&(state.schedule[i-1].at-event.at||state.schedule[i-1].phase-event.phase||state.schedule[i-1].id.localeCompare(event.id))>0))return false;
  return true;
}
export async function validate_state(value:unknown):Promise<State>{
  try{
    if(!record(value)||!json_data(value)||value.schema!==4||value.contract!=='0.5.1'||value.phase!=='committed'||!valid_id(value.run_id))throw Error('invalid');
    const state=value as unknown as State;
    await load_definition(engineeringDefinition);
    if(state.definition_hash!==engineeringDefinition.definition_hash||JSON.stringify(canonical(state.hashes))!==JSON.stringify(canonical(engineeringDefinition.hashes))||typeof state.integrity!=='string'||state.integrity!==await state_hash(state)||!player_view(project_player_view(state))||!references(state))throw Error('invalid');
    return state;
  }catch{throw new GameError('INVALID_SAVE');}
}
