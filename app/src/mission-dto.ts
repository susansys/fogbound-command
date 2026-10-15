import {record,fields,valid_id} from './protocol';
import {dense_array,validate_public_map} from './spatial';
import {parse_mission_draft,mission_ref} from './mission-protocol';
type Check=(x:unknown)=>boolean;
const integer:Check=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const text:Check=x=>typeof x==='string'&&[...x].length<=2000;
const digest:Check=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const one=(...xs:unknown[]):Check=>x=>xs.includes(x);
const list=(check:Check,max=32):Check=>x=>dense_array(x)&&x.length<=max&&x.every(check);
function shape(x:unknown,checks:Record<string,Check>):boolean{return record(x)&&fields(x,Object.keys(checks))&&Object.entries(checks).every(([key,check])=>check(x[key]));}
const time:Check=x=>shape(x,{kind:one('unknown')})||shape(x,{kind:one('known'),value:integer,evidence:valid_id});
export function mission_preview(x:unknown):boolean{
  return shape(x,{kind:one('mission_plan'),run_id:valid_id,revision:v=>integer(v)&&Number(v)>0,editing_seq:integer,draft_digest:digest,phases:list(p=>shape(p,{phase_id:valid_id,distance:v=>typeof v==='number'&&Number.isFinite(v)&&v>=0,estimated_move_ms:v=>v===null||integer(v),assumptions:list(text),gap:text}),2)});
}
export function mission_player_view(x:unknown):boolean{
  if(!record(x)||!valid_id(x.run_id))return false;
  const run=x.run_id;
  const map:Check=v=>{try{validate_public_map(v);return true;}catch{return false;}};
  const scope:Check=v=>record(x.geometry)&&dense_array(x.geometry.scopes)&&record(v)&&v.kind!=='unresolved'&&map({...x.geometry,scopes:[...x.geometry.scopes.filter(s=>!record(s)||s.id!==v.id),v]});
  const position:Check=v=>{
    const common={observed:time,reported:time,source_event_time:time,evidence_refs:list(valid_id)};
    const evidence={received:one(null),provenance:(p:unknown)=>shape(p,{kind:one('registered_initial'),initial_evidence_ref:valid_id})};
    return shape(v,{status:one('known_scope'),scope,...common,...evidence});
  };
  const saved:Check=v=>{
    if(!shape(v,{plan_id:valid_id,version:q=>integer(q)&&Number(q)>0,draft:q=>{try{parse_mission_draft(q,run);return true;}catch{return false;}},preview:mission_preview}))return false;
    return record(v)&&record(v.preview)&&v.preview.run_id===run;
  };
  return shape(x,{scenario_kind:one('play_mission'),run_id:valid_id,revision:v=>integer(v)&&Number(v)>0,sim_time:v=>integer(v)&&Number(v)<=910000,mode:one('command','research'),rate:one(1,2,4),paused:v=>typeof v==='boolean',finished:one(false),source_run:v=>v===null||valid_id(v),status:one('draft'),geometry:map,position_knowledge:position,authority:v=>shape(v,{from:integer,to:integer}),resources:v=>shape(v,{movement_energy:integer,movement_energy_reserved:integer,equipment_energy:integer,equipment_wear:integer,hq_energy:integer,hq_wear:integer,confirmed_at:integer}),mission:v=>v===null||shape(v,{id:one('M1'),object_revision:q=>integer(q)&&Number(q)>0,status:one('draft'),current_plan_ref:q=>mission_ref(q,run,'plan'),support_refs:list(()=>false,0)}),plans:list(saved,32),issued_orders:list(()=>false,0),can_issue:one(false),next_action:text,gap:text,replay_nodes:list(v=>shape(v,{revision:q=>integer(q)&&Number(q)>0,at:integer,meaningful:q=>typeof q==='boolean',label:text}),10000),log:list(v=>shape(v,{id:valid_id,at:integer,kind:one('initial_evidence'),text,evidence:valid_id}),10000)});
}
