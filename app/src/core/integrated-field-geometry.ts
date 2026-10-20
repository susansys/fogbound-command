import {GameError} from '../contracts';
import type {IntegratedFieldEnvelope as Envelope} from '../integrated-field-contracts';
import type {IntegratedFieldState,IntegratedFieldActor} from './integrated-field-state';
type ActorId='R'|'W';
const micrometres=1000000;
function coordinate(state:IntegratedFieldState,id:'H'|'A'|'B'):[number,number]{const p=state.definition.geometry.points[id];return[p[0]*micrometres,p[1]*micrometres];}
function onAB(state:IntegratedFieldState,actor:IntegratedFieldActor):boolean{
 const motion=actor.motion;if(!motion)return false;const a=coordinate(state,'A');return Math.min(motion.leg_origin_um[0],motion.legs[motion.leg_index][0])>=a[0];
}
function speed_um_per_ms(state:IntegratedFieldState,actor:IntegratedFieldActor,at:number):number{
 const parameters=state.definition.parameters;
 return (onAB(state,actor)?at>=180000&&at<300000?parameters.ab_wet_speed.value:parameters.ab_dry_speed.value:parameters.ha_speed.value)*1000;
}
function positionReport(state:IntegratedFieldState,id:ActorId,at:number,label:string,operation_id=state.actors[id].motion!.operation_id){const actor=state.actors[id],received_at=Math.max(at,actor.sender_free_at)+1000;actor.sender_free_at=received_at;state.position_reports.push({actor:id,point_um:structuredClone(actor.position_um),observed_at:at,received_at,evidence:operation_id+'-'+label});}
export function issue_integrated_move(state:IntegratedFieldState,envelope:Envelope){
 const intent=envelope.intent;if(intent.kind!=='integrated_move')throw new GameError('INVALID_INPUT');
 if(state.sim_time>=900000)throw new GameError('CONSTRAINT_DENIED');
 if(state.inputs.filter(input=>input.envelope.intent.kind==='integrated_move'&&input.envelope.intent.actor===intent.actor).length>=16)throw new GameError('CAPACITY_CONFLICT');
 const start_at=Math.max(state.sim_time,state.hq_sender_free_at)+1000;state.hq_sender_free_at=start_at;
 state.pending_moves.push({actor:intent.actor,target:intent.target,start_at,operation_id:envelope.operation_id});
}
export function advance_integrated_movement(state:IntegratedFieldState,to:number){
 let cursor=state.sim_time,steps=0;const ids:ActorId[]=['R','W'];
 const settle=(at:number)=>{
  // Existing work completes before environment and newly arriving commands.
  for(const id of ids){const actor=state.actors[id],motion=actor.motion;if(motion?.status!=='moving')continue;
   const endpoint=motion.legs[motion.leg_index];
   if(actor.position_um[0]===endpoint[0]){
    motion.leg_index++;if(motion.leg_index===motion.legs.length){motion.status='completed';motion.ended_at=at;positionReport(state,id,at,'arrived');continue;}
    motion.leg_origin_um=structuredClone(actor.position_um);motion.leg_progress_um=0;
   }
   if((state.guidance_loss_at!==null&&at>=state.guidance_loss_at&&onAB(state,actor))||at>=900000){motion.status='blocked';motion.ended_at=at;positionReport(state,id,at,'blocked');}
  }
  const commands=state.pending_moves.filter(command=>command.start_at===at);state.pending_moves=state.pending_moves.filter(command=>command.start_at!==at);
  for(const command of commands){const actor=state.actors[command.actor];
   if(at>=900000||actor.motion?.status==='moving'||actor.position_um[0]===coordinate(state,command.target)[0]||state.guidance_loss_at!==null&&at>=state.guidance_loss_at&&Math.max(actor.position_um[0],coordinate(state,command.target)[0])>coordinate(state,'A')[0]){
    positionReport(state,command.actor,at,'refused',command.operation_id);continue;
   }
   const target=coordinate(state,command.target),a=coordinate(state,'A'),legs:Array<[number,number]>=[];
   if((actor.position_um[0]<a[0]&&target[0]>a[0])||(actor.position_um[0]>a[0]&&target[0]<a[0]))legs.push(a);
   legs.push(target);actor.motion={status:'queued',target:command.target,start_at:at,ended_at:null,legs,leg_index:0,leg_origin_um:structuredClone(actor.position_um),leg_progress_um:0,operation_id:command.operation_id};
  }
  for(const id of ids){const actor=state.actors[id],motion=actor.motion;if(!motion)continue;
   if(motion.status==='queued'&&motion.start_at===at){motion.status='moving';positionReport(state,id,at,'accepted');}
   if(motion.status!=='moving')continue;
   if((state.guidance_loss_at!==null&&at>=state.guidance_loss_at&&onAB(state,actor))||at>=900000){motion.status='blocked';motion.ended_at=at;positionReport(state,id,at,'blocked');}
  }
  for(const report of state.position_reports.filter(report=>report.received_at===at))state.actors[report.actor].known={point:[report.point_um[0]/micrometres,report.point_um[1]/micrometres],observed_at:report.observed_at,received_at:report.received_at,evidence:report.evidence};
 };
 settle(cursor);
 while(cursor<to){
  if(++steps>128)throw new GameError('INVALID_DEFINITION');
  let boundary=to;for(const at of [180000,300000,900000,state.guidance_loss_at])if(at!==null&&at>cursor)boundary=Math.min(boundary,at);
  for(const command of state.pending_moves)if(command.start_at>cursor)boundary=Math.min(boundary,command.start_at);
  for(const report of state.position_reports)if(report.received_at>cursor)boundary=Math.min(boundary,report.received_at);
  for(const id of ids){const actor=state.actors[id],motion=actor.motion;if(!motion)continue;
   if(motion.status==='queued'&&motion.start_at>cursor)boundary=Math.min(boundary,motion.start_at);
   if(motion.status==='moving'){const speed=speed_um_per_ms(state,actor,cursor),remaining=Math.abs(motion.legs[motion.leg_index][0]-motion.leg_origin_um[0])-motion.leg_progress_um;boundary=Math.min(boundary,cursor+Math.ceil(remaining/speed));}
  }
  if(boundary<=cursor)throw new GameError('INVALID_SAVE');
  for(const id of ids){const actor=state.actors[id],motion=actor.motion;if(motion?.status!=='moving')continue;
   const endpoint=motion.legs[motion.leg_index],length=Math.abs(endpoint[0]-motion.leg_origin_um[0]),speed=speed_um_per_ms(state,actor,cursor);
   motion.leg_progress_um=Math.min(length,motion.leg_progress_um+(boundary-cursor)*speed);
   actor.position_um=[motion.leg_origin_um[0]+Math.sign(endpoint[0]-motion.leg_origin_um[0])*motion.leg_progress_um,endpoint[1]];
  }
  cursor=boundary;settle(cursor);
 }
}
