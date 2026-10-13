import type {Response} from './transport';
import {record,valid_id,valid_envelope} from './protocol';
type Check=(value:unknown)=>boolean;
const text:Check=v=>typeof v==='string'&&v.length<=2000;
const bool:Check=v=>typeof v==='boolean';
const time:Check=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const number:Check=v=>typeof v==='number'&&Number.isFinite(v);
const oneOf=(values:readonly unknown[]):Check=>v=>values.includes(v);
function shape(value:unknown,required:Record<string,Check>,optional:Record<string,Check>={}):boolean{
  if(!record(value))return false;
  return Object.keys(required).every(key=>Object.hasOwn(value,key)&&required[key](value[key]))&&Object.keys(value).every(key=>Object.hasOwn(required,key)||(Object.hasOwn(optional,key)&&optional[key](value[key])));
}
const list=(entry:Check,max=10000):Check=>v=>{
  if(!Array.isArray(v)||v.length>max)return false;
  const keys=Reflect.ownKeys(v);
  return keys.length===v.length+1&&keys.every(key=>key==='length'||typeof key==='string'&&/^(0|[1-9][0-9]*)$/.test(key)&&Number(key)<v.length)&&v.every(entry);
};
const vector=(length:number):Check=>v=>Array.isArray(v)&&v.length===length&&list(number,length)(v);
const evidenceTime:Check=v=>shape(v,{value:time,evidence:text});
const sourceTime:Check=v=>shape(v,{kind:oneOf(['unknown'])})||shape(v,{kind:oneOf(['known']),value:time,evidence:text});
export const position:Check=v=>shape(v,{x:number,y:number,observed:time,received:time,evidence:text});
export const resources:Check=v=>shape(v,{equipment_energy:time,equipment_wear:time,movement_energy:time,confirmed_at:time});
const report:Check=v=>shape(v,{id:text,origin:text,target:text,source_event_time:sourceTime,observed:evidenceTime,reported:evidenceTime});
const delivery:Check=v=>shape(v,{id:text,report_id:text,received:evidenceTime});
const log:Check=v=>shape(v,{id:text,at:time,kind:oneOf(['report','issued','accepted_receipt','fix_receipt','complete_receipt','deadline','deadline_receipt']),text,evidence:text},{observed:time});
export const player_view:Check=v=>shape(v,{
  run_id:valid_id,revision:v=>time(v)&&Number(v)>=1,sim_time:time,mode:oneOf(['command','research']),rate:oneOf([1,2,4]),paused:bool,finished:bool,source_run:v=>v===null||valid_id(v),status:oneOf(['ready','queued','executing','finished','deadline']),
  position,report,delivery,resources,
  geometry:v=>shape(v,{H:vector(2),T:vector(2),extent:vector(2),corridor_width:number,plain:vector(4),rough:vector(4)}),
  authority:v=>shape(v,{from:time,to:time}),can_issue:bool,next_action:text,gap:text,
  log:list(log),
},{scenario_kind:oneOf(['record'])});
const plan:Check=v=>valid_envelope({run_id:'dto',operation_id:'dto',expected_revision:1,intent:{kind:'issue',command_id:'dto',plan:v}});
const receipt:Check=v=>v===null||shape(v,{run_id:valid_id,operation_id:valid_id,revision:v=>time(v)&&Number(v)>=1,sim_time:time,fingerprint:v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v),result:oneOf(['committed']),kind:oneOf(['issue','advance','tick','pause','continue','rate','mode','save','restore'])},{snapshot_revision:v=>time(v)&&Number(v)>=1});
const run:Check=v=>shape(v,{run_id:valid_id,revision:time,sim_time:time,mode:oneOf(['command','research']),finished:bool},{scenario_kind:oneOf(['move','record']),read_only:bool});
const codes=['WRITER_BUSY','LOCK_UNSUPPORTED','INVALID_INPUT','INVALID_DEFINITION','RUN_NOT_FOUND','STALE_REVISION','STALE_PLAN','OPERATION_CONFLICT','ORDER_EXISTS','AUTHORITY_EXPIRED','MODE_LOCKED','TIME_REVERSED','TIME_NOT_ADVANCED','RUN_ENDED','STALE_WRITER','CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','CLOCK_PAUSED','INVALID_SAVE','HISTORY_READ_ONLY'];
export function valid_response(value:unknown):value is Response{
  if(!record(value))return false;
  if(value.ok===false)return shape(value,{request_id:valid_id,ok:oneOf([false]),code:oneOf(codes)});
  if(!shape(value,{request_id:valid_id,ok:oneOf([true])},{view:player_view,plan,receipt,runs:list(run)}))return false;
  const keys=Object.keys(value).filter(key=>key!=='request_id'&&key!=='ok').sort().join(',');
  return ['view','plan','receipt','runs','receipt,view'].includes(keys);
}
