import type {IntegratedFieldPlayerView,IntegratedFieldParameter} from '../integrated-field-contracts';
import type {IntegratedFieldState} from './integrated-field-state';
import {GameError} from '../contracts';
import type {Envelope} from '../contracts';
import {valid_envelope} from '../protocol';
import {load_kg,portable_energy} from './integrated-field-quantities';
export function project_integrated_field_view(state:IntegratedFieldState):IntegratedFieldPlayerView{
  const {definition}=state,geometry=definition.geometry;
  const r=definition.configurations.find(config=>config.actor==='R')?.items.find(item=>item.id==='EQ-G2-TU');if(!r)throw new GameError('INVALID_DEFINITION');
  const parameters=[{...definition.parameter_sources.r_mass,value:r.mass_kg},definition.parameters.ha_speed,{...definition.parameter_sources.deadline,value:definition.public_rules.deadline}] as IntegratedFieldParameter[];
  const publicGeometry={id:geometry.id,version:1 as const,unit:'m' as const,metres_per_coordinate:1 as const,points:structuredClone(geometry.points),segments:geometry.segments.map(segment=>{
    const from=geometry.points[segment.points[0]],to=geometry.points[segment.points[1]];
    return {id:segment.id,length_m:Math.hypot(to[0]-from[0],to[1]-from[1])*geometry.metres_per_coordinate};
  })};
  return {scenario_kind:'play_integrated_field',run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:state.finished,source_run:state.source_run,status:state.status,
    can_issue:false,next_action:'查看本局模型与目录',gap:'',public_rules:structuredClone(definition.public_rules),
    model_catalog:{model_ref:structuredClone(definition.model_ref),geometry:publicGeometry,calibration_status:'conditional_not_measured',parameters:structuredClone(parameters),sources:structuredClone(definition.sources),configurations:definition.configurations.map(config=>{
      if(config.actor!=='R'&&config.actor!=='W')throw new GameError('INVALID_DEFINITION');
      const equipment=config.items.find(item=>item.id===config.equipment_item_ref);if(!equipment)throw new GameError('INVALID_DEFINITION');
      const energy=portable_energy(config.battery_wh,config.initial_available_percent);
      return {actor:config.actor,id:config.id,load_kg:load_kg(config.items),capacity_l:config.capacity_l,occupied_l:config.occupied_l,...(config.storage_bytes===undefined?{}:{storage_bytes:config.storage_bytes}),equipment:{id:equipment.id,mass_kg:equipment.mass_kg,battery_included:equipment.battery_included,battery_wh:config.battery_wh,battery_nominal_j:energy.nominal_j,battery_available_j:energy.available_j}};
    })},geometry:structuredClone(publicGeometry),replay_nodes:[{revision:state.revision,at:state.sim_time,meaningful:true,label:'模型与目录已建立'}],log:[]};
}

export function apply_integrated_field_control(state:IntegratedFieldState,envelope:Envelope,clock_to?:number):IntegratedFieldState{
  if(!valid_envelope(envelope,910000,true)||envelope.run_id!==state.run_id||!['tick','advance','pause','continue','rate','mode','save','restore'].includes(envelope.intent.kind))throw new GameError('INVALID_INPUT');
  if(envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  const next=structuredClone(state),intent=envelope.intent;
  const advance=(to:number)=>{
    if(!Number.isSafeInteger(to)||to>910000)throw new GameError('INVALID_INPUT');
    if(to<next.sim_time)throw new GameError('TIME_REVERSED');
    if(next.ended)throw new GameError('RUN_ENDED');
    next.sim_time=to;
    if(to>=900000)next.status='deadline';
    if(to===910000){next.ended=true;next.finished=true;next.paused=true;}
  };
  if(clock_to!==undefined){
    if(state.mode!=='command'||state.paused||!Number.isSafeInteger(clock_to)||clock_to>910000||!['pause','continue','rate','save'].includes(intent.kind)||clock_to<state.sim_time)throw new GameError('INVALID_INPUT');
    if(clock_to>state.sim_time)advance(clock_to);
  }
  if(intent.kind==='tick'||intent.kind==='advance'){
    if(state.mode!==(intent.kind==='tick'?'command':'research'))throw new GameError('MODE_LOCKED');
    if(intent.kind==='tick'&&state.paused)throw new GameError('CLOCK_PAUSED');
    if(intent.to===state.sim_time)throw new GameError('TIME_NOT_ADVANCED');
    advance(intent.to);
  }else if(intent.kind==='pause')next.paused=true;
  else if(intent.kind==='restore'){
    if(intent.snapshot_revision!==state.revision)throw new GameError('INVALID_INPUT');
    next.paused=true;next.generation++;
  }else if(intent.kind==='continue'){
    if(state.mode!=='command')throw new GameError('MODE_LOCKED');
    if(next.ended)throw new GameError('RUN_ENDED');
    next.paused=false;
  }else if(intent.kind==='rate')next.rate=intent.rate;
  else if(intent.kind==='mode')throw new GameError('MODE_LOCKED');
  next.revision++;
  next.inputs.push({envelope:structuredClone(envelope),at:clock_to===undefined?state.sim_time:next.sim_time,revision:next.revision,...(clock_to===undefined?{}:{clock_to})});
  return next;
}
