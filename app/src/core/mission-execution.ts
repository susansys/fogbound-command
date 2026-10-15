import type {MissionState} from './mission-state';
import type {MissionDefinition} from './mission-definition';
import type {MovementBasis} from '../route-contracts';
import {path_timing,ceil_fraction,fraction,multiply_fraction,number_fraction,progress_on_path,add_fraction,divide_fraction,subtract_fraction,compare_fraction,first_closure_time} from './play-timing';
import {local_mission_check,local_movement_conflict} from './mission-local';
import {GameError} from '../contracts';
export function mission_movement_basis(definition:MissionDefinition):MovementBasis{
  const p=definition.profile.parameters;
  return {capability_ref:'R:move',speed:p.base_speed,unit:'fictional_metre/s',load:definition.catalogs.actor.load,terrain_factor:p.terrain_factor,environment_factor:p.environment_factor,load_factor_per_unit:definition.rules.load_factor_per_unit,length_scale:1000000,applied_causes:definition.catalogs.movement_causes.map(c=>({...c,consumer:'R:move',slot:c.slot as 'terrain'|'environment'})),evidence_refs:definition.capabilities.find(c=>c.id==='R:move')!.evidence_refs};
}
export function receive_mission_command(state:MissionState,order:MissionState['orders'][number],definition:MissionDefinition):MissionState['executions'][number]|null{
  if(!state.local.received_commands.includes(order.id)){state.local.received_commands.push(order.id);state.local.revision++;}
  const previous=state.attempts.find(a=>a.order_ref===order.id);
  if(state.sim_time<order.frozen_payload.phase.earliest_start_time_ms){
    if(!previous)state.attempts.push({order_ref:order.id,received:state.sim_time,checked:null,accept_until:null,status:'waiting_window',terminal_at:null,gate:null,execution_ref:null,refusal_reason:null});
    return null;
  }
  const checked=local_mission_check(state,order,definition);
  const attempt:MissionState['attempts'][number]=previous??{order_ref:order.id,received:state.sim_time,checked:null,accept_until:null,status:'waiting_window',terminal_at:null,gate:null,execution_ref:null,refusal_reason:null};
  if(!previous)state.attempts.push(attempt);attempt.checked=state.sim_time;attempt.status='accepted';attempt.gate=checked.gate;
  if(checked.authority.status!=='met'){attempt.status='refused';attempt.terminal_at=state.sim_time;attempt.refusal_reason='authority_denied';return null;}
  const timing=path_timing(order.frozen_payload.route.path,mission_movement_basis(definition)),phase=order.frozen_payload.phase,grant=order.frozen_payload.grant;
  const duration=ceil_fraction(multiply_fraction(timing.duration_ms,number_fraction(state.local.movement_time_factor)));
  if(state.sim_time>=order.expiry_time_ms||state.sim_time>=phase.latest_finish_time_ms||state.sim_time<grant.valid_from_time_ms||state.sim_time>=grant.valid_to_time_ms||state.sim_time+duration>phase.latest_finish_time_ms){attempt.status='refused';attempt.terminal_at=state.sim_time;attempt.refusal_reason='window_closed';return null;}
  const position=state.local.position_knowledge,start=order.frozen_payload.route.path[0];
  const p=definition.profile.parameters;
  const exact_start=position.status==='known_scope'&&position.scope.kind==='point'&&position.scope.uncertainty.kind==='known'&&position.scope.uncertainty.value===0&&position.observed.kind==='known'&&position.observed.value<=state.sim_time&&state.sim_time<Math.min(position.observed.value+p.position_max_age_ms,p.evidence_valid_until)&&(position.received===null||position.received<=state.sim_time);
  if(exact_start&&position.status==='known_scope'&&position.scope.kind==='point'&&(position.scope.typed_geometry.position[0]!==start[0]||position.scope.typed_geometry.position[1]!==start[1])){
    attempt.status='refused';attempt.terminal_at=state.sim_time;attempt.refusal_reason='start_mismatch';return null;
  }
  const distance=fraction(timing.length_units.reduce((sum,n)=>sum+BigInt(n),0n),1000000),reserved=ceil_fraction(multiply_fraction(distance,number_fraction(definition.rules.movement_energy_per_distance)));
  if(reserved>state.local.resources.movement_energy-state.local.resources.movement_energy_reserved){attempt.status='refused';attempt.terminal_at=state.sim_time;attempt.refusal_reason='insufficient_movement_energy';return null;}
  if(local_movement_conflict(state,state.sim_time+duration)){attempt.status='refused';attempt.terminal_at=state.sim_time;attempt.refusal_reason='capacity_conflict';return null;}
  if(checked.gate.result!=='T'){
    attempt.status='gate_hold';attempt.accept_until=Math.min(state.sim_time+definition.profile.parameters.hold_ms,order.frozen_payload.phase.latest_finish_time_ms,order.expiry_time_ms,order.frozen_payload.grant.valid_to_time_ms);return null;
  }
  if(!exact_start){attempt.status='refused';attempt.terminal_at=state.sim_time;attempt.refusal_reason='start_unconfirmed';return null;}
  const execution:MissionState['executions'][number]={...timing,id:order.id+'-execution',order_ref:order.id,status:'moving',starts:state.sim_time,completes:state.sim_time+duration,elapsed:fraction(0),last_updated:state.sim_time,time_factor:state.local.movement_time_factor,path:structuredClone(order.frozen_payload.route.path),reserved,gate:checked.gate,terminal_at:null,settled:false,settlement:null};
  state.world.resources.movement_energy_reserved+=reserved;state.local.resources.movement_energy_reserved+=reserved;state.local.resources.confirmed_at=state.sim_time;state.local.revision++;state.executions.push(execution);attempt.execution_ref=execution.id;return execution;
}
export function complete_mission_execution(state:MissionState,execution:MissionState['executions'][number],definition:MissionDefinition,terminal:'arrived'|'cutoff'|'blocked'='arrived'):void{
  if(execution.status!=='moving'||execution.settled)return;
  const progress=progress_on_path(execution.path,execution,execution.elapsed),energy=ceil_fraction(multiply_fraction(progress.distance,number_fraction(definition.rules.movement_energy_per_distance))),r=state.world.resources;
  if(energy>execution.reserved||r.movement_energy_reserved<execution.reserved||r.movement_energy<energy)throw new GameError('ENGINE_UNCONFIRMED');
  r.movement_energy-=energy;r.movement_energy_reserved-=execution.reserved;
  state.local.resources.movement_energy-=energy;state.local.resources.movement_energy_reserved-=execution.reserved;state.local.resources.confirmed_at=state.sim_time;state.local.revision++;
  execution.status=terminal;execution.terminal_at=state.sim_time;execution.settled=true;execution.settlement={distance:progress.distance,energy,released:execution.reserved-energy,at:state.sim_time};
  const attempt=state.attempts.find(a=>a.order_ref===execution.order_ref);if(!attempt)throw new GameError('ENGINE_UNCONFIRMED');attempt.status=terminal;attempt.terminal_at=state.sim_time;
  state.world.position=progress.position;
  const order=state.orders.find(o=>o.id===execution.order_ref)!;
  state.phase_results.push({order_ref:order.id,phase_ref:structuredClone(order.phase_ref),plan_ref:structuredClone(order.plan_ref),actual_event_ref:execution.id+'-'+terminal});
  const operative=state.orders.at(-1)!.frozen_payload.draft;
  if(operative.phases.every(phase=>state.executions.some(e=>e.status==='arrived'&&state.orders.some(o=>o.id===e.order_ref&&o.phase_ref.id===phase.id&&o.phase_ref.version===phase.version))))state.actual_mission_status='assessing';
}
export function update_mission_progress(state:MissionState,at:number):void{
  for(const execution of state.executions.filter(e=>e.status==='moving')){
    if(at<execution.last_updated)throw new GameError('ENGINE_UNCONFIRMED');
    execution.elapsed=add_fraction(execution.elapsed,divide_fraction(number_fraction(at-execution.last_updated),number_fraction(execution.time_factor)));execution.last_updated=at;
    if(compare_fraction(execution.elapsed,execution.duration_ms)>0)execution.elapsed=structuredClone(execution.duration_ms);
    state.world.position=progress_on_path(execution.path,execution,execution.elapsed).position;
  }
}
export function change_mission_movement(state:MissionState,condition:NonNullable<MissionDefinition['catalogs']['movement_changes']>[number]):void{
  state.local.movement_changes.push(condition.id);state.local.movement_time_factor=condition.time_factor;state.local.revision++;
  for(const execution of state.executions.filter(e=>e.status==='moving')){execution.time_factor=condition.time_factor;execution.completes=state.sim_time+ceil_fraction(multiply_fraction(subtract_fraction(execution.duration_ms,execution.elapsed),number_fraction(condition.time_factor)));}
}
export function mission_discoveries(state:MissionState,definition:MissionDefinition){
  return state.executions.filter(e=>e.status==='moving').flatMap(execution=>(definition.catalogs.movement_obstacles??[]).flatMap(obstacle=>{
    const elapsed=first_closure_time(execution.path,execution,obstacle.closed_at_x);if(elapsed===null)return [];
    const remaining=subtract_fraction(elapsed,execution.elapsed),delay=compare_fraction(remaining,fraction(0))<=0?fraction(0):multiply_fraction(remaining,number_fraction(execution.time_factor));
    return [{kind:'discovery' as const,id:execution.id+'-'+obstacle.id,ref:execution.id,obstacle_ref:obstacle.id,elapsed,at:state.sim_time+ceil_fraction(delay),phase:24}];
  }));
}
