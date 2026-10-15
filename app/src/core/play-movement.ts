import {GameError} from '../contracts';
import type {SpatialScope,Coordinate} from '../spatial';
import type {PlayState,PlayActivity,LocalReportDraft} from './play-state';
import type {PlayDefinition} from './scenario';
import type {PlayReport,PlayDelivery} from '../play-contracts';
import {receive_position} from './play-reports';
import {fraction,number_fraction,multiply_fraction,compare_fraction,ceil_fraction,fraction_to_number,rational_position,movement_basis_for_definition,path_timing,progress_on_path,first_closure_time} from './play-timing';

function public_position_scope(state:PlayState,definition:PlayDefinition,evidence:string):Exclude<SpatialScope,{kind:'unresolved'}>{
  const {map_id,map_version,crs_id,geometry_version}=definition.catalogs.map;
  const position:Coordinate=[Math.round(fraction_to_number(state.world.position.x)*100)/100,Math.round(fraction_to_number(state.world.position.y)*100)/100];
  return {id:'R-position-'+evidence,kind:'point',map_id,map_version,crs_id,geometry_version,precision:0.01,uncertainty:{kind:'known',value:0,unit:'fictional_metre',evidence},typed_geometry:{position},evidence_refs:[evidence]};
}
function form_report(state:PlayState,definition:PlayDefinition,command_id:string,activity_id:string|null,kind:PlayReport['kind'],at:number,phase:number,refusal_reason:PlayReport['refusal_reason']=null){
  if(state.local_reports.filter(report=>report.command_id===command_id).length>=definition.profile.parameters.report_budget)throw new GameError('ENGINE_UNCONFIRMED');
  const id='b21-local-'+(state.local_reports.length+1),evidence='b21-observation-'+(state.local_reports.length+1);
  const draft:LocalReportDraft={id,kind,command_id,activity_id,observed:{kind:'known',value:at,evidence},position_scope:kind==='accepted'?null:public_position_scope(state,definition,evidence),status:'pending',report_id:null,refusal_reason};
  state.local_reports.push(draft);state.queue.push({id:id+':send',kind:'send_report',draft_id:id,at,phase});
}
function transmit_report(state:PlayState,definition:PlayDefinition,draft_id:string,at:number){
  const draft=state.local_reports.find(value=>value.id===draft_id);if(!draft||draft.status!=='pending')return;
  const p=definition.profile.parameters,resources=state.world.resources;
  if(at<definition.catalogs.link_authority.from||at>definition.catalogs.link_authority.to||resources.equipment_energy<p.report_energy_cost||resources.equipment_wear<p.report_wear_cost){draft.status='unsent';return;}
  const energy_before=resources.equipment_energy,wear_before=resources.equipment_wear;
  resources.equipment_energy-=p.report_energy_cost;resources.equipment_wear-=p.report_wear_cost;
  const id='b21-report-'+(state.reports.length+1),{hq_energy,hq_wear,...portable}=resources;
  const report:PlayReport={id,origin:'R',target:'HQ',kind:draft.kind,command_id:draft.command_id,activity_id:draft.activity_id,source_event_time:{kind:'unknown'},observed:structuredClone(draft.observed),reported:{kind:'known',value:at,evidence:id},position_scope:structuredClone(draft.position_scope),resources:{...portable,confirmed_at:at},refusal_reason:draft.refusal_reason};
  draft.status='sent';draft.report_id=id;state.reports.push(report);
  state.transmissions.push({id:id+':transmission',at,sender:'R',message_ref:id,energy_before,energy_after:resources.equipment_energy,wear_before,wear_after:resources.equipment_wear,energy:p.report_energy_cost,wear:p.report_wear_cost});
  state.queue.push({id:id+':receive',kind:'receive_report',report_id:id,at:at+p.link_ms+definition.catalogs.engine_conditions.report_delivery_delay_ms,phase:20});
}
function transmit_catalog_report(state:PlayState,definition:PlayDefinition,index:number,at:number){
  const entry=definition.catalogs.position_reports[index],p=definition.profile.parameters,r=state.world.resources,id='b21-position-'+(index+1);
  if(!entry||entry.reported_at!==at||state.reports.some(report=>report.id===id))throw new GameError('ENGINE_UNCONFIRMED');
  if(at<definition.catalogs.link_authority.from||at>definition.catalogs.link_authority.to||r.equipment_energy<p.report_energy_cost||r.equipment_wear<p.report_wear_cost)return;
  const scope=entry.scope_ref===null?null:definition.catalogs.map.scopes.find(scope=>scope.id===entry.scope_ref);
  if(scope?.kind==='unresolved'||scope===undefined)throw new GameError('ENGINE_UNCONFIRMED');
  const energy_before=r.equipment_energy,wear_before=r.equipment_wear;
  r.equipment_energy-=p.report_energy_cost;r.equipment_wear-=p.report_wear_cost;
  const {hq_energy,hq_wear,...portable}=r;
  state.reports.push({id,origin:'R',target:'HQ',kind:'position',command_id:null,activity_id:null,source_event_time:structuredClone(entry.source_event_time),observed:structuredClone(entry.observed),reported:{kind:'known',value:at,evidence:entry.id},position_scope:structuredClone(scope),resources:{...portable,confirmed_at:at},refusal_reason:null});
  state.transmissions.push({id:id+':transmission',at,sender:'R',message_ref:id,energy_before,energy_after:r.equipment_energy,wear_before,wear_after:r.equipment_wear,energy:p.report_energy_cost,wear:p.report_wear_cost});
  state.queue.push({id:id+':receive',kind:'receive_report',report_id:id,at:entry.delivery_at,phase:20});
}
function receive_report(state:PlayState,report_id:string,at:number){
  const report=state.reports.find(value=>value.id===report_id);if(!report)throw new GameError('ENGINE_UNCONFIRMED');
  const id='b21-delivery-'+(state.deliveries.length+1),delivery:PlayDelivery={id,report_id,received:{value:at,evidence:id}};
  state.deliveries.push(delivery);
  if(report.resources.confirmed_at>=state.known.resources.confirmed_at)state.known.resources={...state.known.resources,...structuredClone(report.resources)};
  state.known.position_knowledge=receive_position(state.known.position_knowledge,report,delivery);
  if(state.requests.at(-1)?.command_id===report.command_id)state.status=report.kind==='accepted'?'accepted':report.kind==='arrived'?'arrived':report.kind==='blocked'?'blocked':report.kind==='cutoff'?'cutoff_confirmed':'ready';
  const label=report.kind==='accepted'?'接令回执已收到，定位仍以原依据为准。':report.kind==='arrived'?'抵达定位回报已收到；这不是完整行动胜利。':report.kind==='blocked'?'本地受阻定位回报已收到；没有自动绕行。':report.kind==='cutoff'?'截止截停回报已收到；实体没有在宽限期继续移动。':report.kind==='position'?'定位依据消息已收到；观察时点与收到时点分别保留。':'任务未接受的回报已收到。';
  state.log.push({id:id,at,kind:report.kind==='accepted'?'accepted_receipt':report.kind==='arrived'?'complete_receipt':report.kind==='blocked'?'blocked_receipt':report.kind==='cutoff'?'cutoff_receipt':report.kind==='position'?'position_receipt':'refused_receipt',text:label,evidence:id,sender:'联络组 R',...(report.observed.kind==='known'?{observed:report.observed.value}:{}),...(report.activity_id===null?{}:{activity_id:report.activity_id})});
}
function update_positions(state:PlayState,at:number){
  for(const activity of state.activities.filter(value=>value.status==='moving')){
    const progress=progress_on_path(activity.path,activity,at-activity.starts);state.world.position=progress.position;activity.distance_travelled=progress.distance;activity.segment_index=progress.segment_index;
  }
}
function complete(state:PlayState,definition:PlayDefinition,activity:PlayActivity,at:number,terminal:'arrived'|'blocked'|'cutoff'='arrived'){
  if(activity.settled||activity.status!=='moving')return;
  const energy=ceil_fraction(multiply_fraction(activity.distance_travelled,number_fraction(definition.rules.movement_energy_per_distance))),resources=state.world.resources;
  if(energy>activity.reserved||resources.movement_energy_reserved<activity.reserved||resources.movement_energy<energy)throw new GameError('ENGINE_UNCONFIRMED');
  resources.movement_energy-=energy;resources.movement_energy_reserved-=activity.reserved;
  activity.status=terminal;activity.terminal_at=at;activity.settled=true;activity.settlement={distance:structuredClone(activity.distance_travelled),energy,released:activity.reserved-energy,at};
  state.queue=state.queue.filter(event=>!(['complete','discovery'].includes(event.kind)&&'activity_id' in event&&event.activity_id===activity.id));
  form_report(state,definition,activity.command_id,activity.id,terminal,at,terminal==='cutoff'?31:26);
}
export function advance_play_movement(state:PlayState,to:number,definition:PlayDefinition){
  const deadline=definition.profile.parameters.deadline;
  if(state.sim_time<deadline&&to>=deadline)state.queue.push({id:'b21-window-deadline',kind:'deadline',at:deadline,phase:30});
  while(true){
    state.queue.sort((a,b)=>a.at-b.at||a.phase-b.phase||a.id.localeCompare(b.id));
    const event=state.queue[0];if(!event||event.at>to)break;
    state.queue.shift();update_positions(state,event.at);state.sim_time=event.at;
    if(event.kind==='send_command'){
      const request=state.requests.find(value=>value.command_id===event.command_id);if(!request||request.status!=='registered')continue;
      const terminal=definition.catalogs.hq_terminal,r=state.world.resources;if(r.hq_energy<terminal.energy_per_send||r.hq_wear<terminal.wear_per_send)continue;
      const energy_before=r.hq_energy,wear_before=r.hq_wear;r.hq_energy-=terminal.energy_per_send;r.hq_wear-=terminal.wear_per_send;
      state.known.resources.hq_energy=r.hq_energy;state.known.resources.hq_wear=r.hq_wear;
      state.transmissions.push({id:request.command_id+':HQ-send',at:event.at,sender:'HQ',message_ref:request.command_id,energy_before,energy_after:r.hq_energy,wear_before,wear_after:r.hq_wear,energy:terminal.energy_per_send,wear:terminal.wear_per_send});
      request.status='sent';request.sent_at=event.at;
      state.log.push({id:request.command_id+':sent',at:event.at,kind:'sent',text:'任务消息已发送，仍在等待接收方确认。',evidence:request.command_id,sender:'总部指挥席'});
      state.queue.push({id:request.command_id+':receive',kind:'receive_command',command_id:request.command_id,at:event.at+definition.profile.parameters.link_ms,phase:10,generation:request.generation});
    }else if(event.kind==='receive_command'){
      const request=state.requests.find(value=>value.command_id===event.command_id);if(!request||request.status!=='sent')continue;
      const timing=path_timing(request.plan.path,movement_basis_for_definition(definition));
      const plannedDistance=fraction(timing.length_units.reduce((sum,value)=>sum+BigInt(value),0n),1000000),reserved=ceil_fraction(multiply_fraction(plannedDistance,number_fraction(definition.rules.movement_energy_per_distance)));
      let refusal:PlayReport['refusal_reason']=null;
      const start=rational_position(request.plan.path[0]);
      if(compare_fraction(start.x,state.world.position.x)!==0||compare_fraction(start.y,state.world.position.y)!==0)refusal='start_mismatch';
      else if(event.at>=definition.profile.parameters.deadline||event.at<definition.catalogs.authority.from||event.at>=definition.catalogs.authority.to)refusal='window_closed';
      else if(reserved>state.world.resources.movement_energy-state.world.resources.movement_energy_reserved)refusal='insufficient_movement_energy';
      if(refusal){request.status='refused';form_report(state,definition,request.command_id,null,'refused',event.at,15,refusal);continue;}
      request.status='accepted';request.accepted_at=event.at;state.world.resources.movement_energy_reserved+=reserved;
      const activity:PlayActivity={...timing,id:'b21-activity-'+(state.activities.length+1),command_id:request.command_id,path:structuredClone(request.plan.path),generation:request.generation,status:'moving',starts:event.at,completes:event.at+ceil_fraction(timing.duration_ms),reserved,settled:false,terminal_at:null,segment_index:0,distance_travelled:fraction(0),settlement:null};
      state.activities.push(activity);form_report(state,definition,request.command_id,activity.id,'accepted',event.at,15);
      state.queue.push({id:activity.id+':complete',kind:'complete',activity_id:activity.id,at:activity.completes,phase:25,generation:activity.generation});
      const discovery=first_closure_time(activity.path,activity,definition.catalogs.engine_conditions.closed_at_x);
      if(discovery!==null)state.queue.push({id:activity.id+':discovery',kind:'discovery',activity_id:activity.id,generation:activity.generation,at:activity.starts+ceil_fraction(discovery),phase:24,elapsed:discovery});
    }else if(event.kind==='discovery'){
      const activity=state.activities.find(value=>value.id===event.activity_id);
      if(activity?.status==='moving'&&activity.generation===event.generation){
        const progress=progress_on_path(activity.path,activity,event.elapsed);state.world.position=progress.position;activity.distance_travelled=progress.distance;activity.segment_index=progress.segment_index;
        complete(state,definition,activity,event.at,'blocked');
      }
    }else if(event.kind==='catalog_report')transmit_catalog_report(state,definition,event.index,event.at);
    else if(event.kind==='deadline'){
      for(const activity of state.activities.filter(value=>value.status==='moving'))complete(state,definition,activity,event.at,'cutoff');
    }else if(event.kind==='send_report')transmit_report(state,definition,event.draft_id,event.at);
    else if(event.kind==='receive_report')receive_report(state,event.report_id,event.at);
    else if(event.kind==='complete'){
      const activity=state.activities.find(value=>value.id===event.activity_id);if(activity&&activity.generation===event.generation)complete(state,definition,activity,event.at);
    }
  }
  update_positions(state,to);state.sim_time=to;
}
