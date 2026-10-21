import {save_integrated_assessment,save_integrated_plan,planning_view,validate_integrated_plan_issue} from './integrated-field-plans';
import {integrated_handover_receipts} from './integrated-field-dag';
import {integrated_work_configuration} from '../integrated-field-contracts';
import {delivered_integrated_process} from './integrated-field-reports';
import type {IntegratedFieldPlayerView,IntegratedFieldParameter,IntegratedFieldObject} from '../integrated-field-contracts';
import type {IntegratedFieldState} from './integrated-field-state';
import {GameError} from '../contracts';
import type {IntegratedFieldEnvelope as Envelope} from '../integrated-field-contracts';
import {valid_integrated_field_envelope} from '../integrated-field-protocol';
import {load_kg,portable_energy} from './integrated-field-quantities';
import {issue_integrated_move} from './integrated-field-geometry';
import {integrated_object,integrated_work_parameters} from './integrated-field-definition';
import {advance_integrated_world,issue_integrated_activity,issue_integrated_prepare,issue_integrated_abort,delivered_work_reports,delivered_work_evidence,work_knowledge,termination_view} from './integrated-field-work';
function replay_nodes(state:IntegratedFieldState):IntegratedFieldPlayerView['replay_nodes']{
 const labels:Partial<Record<Envelope['intent']['kind'],string>>={integrated_assess:'研判版本已保存',integrated_save_plan:'方案版本已保存',integrated_prepare:'资料准备已登记',integrated_activity:'现场命令已签发',integrated_move:'移动命令已签发',integrated_abort:'终止决定已登记',save:'存档确认',pause:'暂停确认',continue:'继续确认',rate:'推进速度已确认',restore:'恢复确认',advance:'推进与回报记录',tick:'推进与回报记录'};
 return[{revision:1,at:0,meaningful:true,label:'开局'},...state.inputs.map(input=>({revision:input.revision,at:input.clock_to!==undefined?input.at:input.envelope.intent.kind==='advance'||input.envelope.intent.kind==='tick'?Math.min(input.envelope.intent.to,state.sim_time):input.at,meaningful:true,label:labels[input.envelope.intent.kind]??'行动记录'}))];
}
export function project_integrated_field_view(state:IntegratedFieldState):IntegratedFieldPlayerView{
  const {definition}=state,geometry=definition.geometry;
  const r=definition.configurations.find(config=>config.actor==='R')?.items.find(item=>item.id==='EQ-G2-TU');if(!r)throw new GameError('INVALID_DEFINITION');
  const recipe=integrated_work_parameters(state),read_ms=recipe.read_prepare_ms+Math.ceil(recipe.read_bytes/recipe.copy_bytes_per_second*1000)+Math.ceil(recipe.read_bytes/recipe.verify_bytes_per_second*1000)+recipe.read_stow_ms;
  const parameters=[{...definition.parameter_sources.r_mass,value:r.mass_kg},...Object.values(definition.parameters),{...definition.parameter_sources.read,value:read_ms},...([['P-OBSERVE',recipe.observe_ms],['P-INSPECT',recipe.inspect_ms],['P-REPAIR',recipe.isolate_ms+recipe.replace_ms+recipe.functional_verify_ms],['P-PREPARE',recipe.validation_ms+recipe.preparation_ms]] as const).map(([id,value])=>({...definition.parameter_sources.read,id,value})),{...definition.parameter_sources.deadline,id:'P-LINK',value:1000,label:'既定单向发送服务'},{...definition.parameter_sources.read,id:'P-STOW',label:'有限收整（作者情景值）',value:recipe.safe_stow_ms},{...definition.parameter_sources.deadline,value:definition.public_rules.deadline}] as IntegratedFieldParameter[];
  const objects:IntegratedFieldObject[]=definition.objects.map(object=>({object_ref:{run_id:state.run_id,kind:object.kind,id:object.id,version:1},scope_ref:{run_id:state.run_id,kind:'scope',id:object.scope,version:1},configuration_ref:object.configuration?{run_id:state.run_id,kind:'configuration',id:object.configuration,version:1}:null,properties:[...object.properties]}));
  const termination=termination_view(state),knowledge=work_knowledge(state),process=delivered_integrated_process(state),delivered=delivered_work_reports(state),receivedReports=delivered.filter((item,index,all)=>all.findIndex(other=>other.report.id===item.report.id)===index).map(item=>item.report);
  const publicGeometry={id:geometry.id,version:1 as const,unit:'m' as const,metres_per_coordinate:1 as const,extent:structuredClone(geometry.extent),points:structuredClone(geometry.points),segments:geometry.segments.map(segment=>{
    const from=geometry.points[segment.points[0]],to=geometry.points[segment.points[1]];
    return {id:segment.id,length_m:Math.hypot(to[0]-from[0],to[1]-from[1])*geometry.metres_per_coordinate};
  })};
  return {scenario_kind:'play_integrated_field',run_id:state.run_id,revision:state.revision,sim_time:state.sim_time,mode:state.mode,rate:state.rate,paused:state.paused,finished:state.finished,source_run:state.source_run,status:state.finished?'finished':state.work.termination?'terminating':state.status,
    can_issue:!state.finished&&state.sim_time<900000&&!state.work.termination,next_action:termination?termination.status==='confirmed'?'已收到终止回报，任务已终止':state.finished?'硬界已封存，仍缺终态回报，尚未确认收整':'终止决定已登记，等待合法收整回报':state.dag.result?.outcome==='success'?'已收到两组交接核验回执，任务完成':state.finished?'任务已结束，查看已收记录与未完成目标':'查看合法位置与下达移动命令',gap:'',public_rules:structuredClone(definition.public_rules),
    actors:(['R','W'] as const).flatMap(id=>{const known=state.actors[id].known;return known?[{id,position:structuredClone(known)}]:[];}),
    reports:receivedReports.map(report=>structuredClone(report.material)),knowledge,termination,planning:planning_view(state),process_reports:process.reports,process_deliveries:process.deliveries,handover_receipts:integrated_handover_receipts(state),result:structuredClone(state.dag.result),
    artifacts:receivedReports.filter(report=>report.artifact).map(report=>{const delivery=delivered.find(item=>item.report.id===report.id)!.delivery;return{id:report.artifact!.id,report_ref:report.id,delivery_ref:delivery.id,source:report.artifact!.source,logical_size_bytes:report.artifact!.logical_size_bytes,verified:true as const,observed_at:report.observed_at,received_at:delivery.received_at};}),
    activity_reports:delivered_work_evidence(state),
    facility_knowledge:knowledge.facility_knowledge,preparation:state.work.preparation?{plan_ref:structuredClone(state.work.preparation.plan_ref),approval_ref:state.work.preparation.status==='approved'?structuredClone(state.work.preparation.approval_ref):null,status:state.work.preparation.status,approved_at:state.work.preparation.approved_at}:null,
    model_catalog:{execution_profile:{id:integrated_work_configuration(state.sensitivity),configuration_hash:state.hashes['sensitivity_'+state.sensitivity]},definition_hash:state.definition_hash,model_hash:state.hashes.model,model_ref:structuredClone(definition.model_ref),objects,geometry:publicGeometry,calibration_status:'conditional_not_measured',parameters:structuredClone(parameters),sources:structuredClone(definition.sources),configurations:definition.configurations.map(config=>{
      if(config.actor!=='R'&&config.actor!=='W')throw new GameError('INVALID_DEFINITION');
      const equipment=config.items.find(item=>item.id===config.equipment_item_ref);if(!equipment)throw new GameError('INVALID_DEFINITION');
      const energy=portable_energy(config.battery_wh,config.initial_available_percent);
      return {actor:config.actor,id:config.id,load_kg:load_kg(config.items),capacity_l:config.capacity_l,occupied_l:config.occupied_l,...(config.storage_bytes===undefined?{}:{storage_bytes:config.storage_bytes}),equipment:{id:equipment.id,mass_kg:equipment.mass_kg,battery_included:equipment.battery_included,battery_wh:config.battery_wh,battery_nominal_j:energy.nominal_j,battery_available_j:energy.available_j}};
    })},geometry:structuredClone(publicGeometry),replay_nodes:replay_nodes(state),log:[]};
}

export function apply_integrated_field_control(state:IntegratedFieldState,envelope:Envelope,clock_to?:number):IntegratedFieldState{
  if(!valid_integrated_field_envelope(envelope)||envelope.run_id!==state.run_id||!['integrated_prepare','integrated_activity','integrated_move','integrated_abort','integrated_assess','integrated_save_plan','tick','advance','pause','continue','rate','mode','save','restore'].includes(envelope.intent.kind))throw new GameError('INVALID_INPUT');
  if(envelope.expected_revision!==state.revision)throw new GameError('STALE_REVISION');
  if(envelope.intent.kind==='integrated_move'||envelope.intent.kind==='integrated_activity'){integrated_object(state.definition,envelope.intent.actor,'actor');integrated_object(state.definition,envelope.intent.target,'facility');}
  const next=structuredClone(state),intent=envelope.intent;
  const advance=(to:number)=>{
    if(!Number.isSafeInteger(to)||to>910000)throw new GameError('INVALID_INPUT');
    if(to<next.sim_time)throw new GameError('TIME_REVERSED');
    if(next.ended)throw new GameError('RUN_ENDED');
    next.sim_time=advance_integrated_world(next,to);
    if(next.sim_time>=900000)next.status='deadline';
    if(next.sim_time===910000){next.ended=true;next.finished=true;next.paused=true;}
  };
  if(clock_to!==undefined){
    if(state.mode!=='command'||state.paused||!Number.isSafeInteger(clock_to)||clock_to>910000||!['integrated_prepare','integrated_activity','integrated_move','integrated_abort','integrated_assess','integrated_save_plan','pause','continue','rate','save'].includes(intent.kind)||clock_to<state.sim_time)throw new GameError('INVALID_INPUT');
    if(clock_to>state.sim_time)advance(clock_to);
  }
  if(['integrated_move','integrated_prepare','integrated_activity','integrated_abort'].includes(intent.kind)&&next.ended)throw new GameError('RUN_ENDED');
  if(['integrated_move','integrated_prepare','integrated_activity'].includes(intent.kind)&&state.work.termination)throw new GameError('CONSTRAINT_DENIED');
  if(['integrated_assess','integrated_save_plan'].includes(intent.kind)&&(next.ended||next.sim_time>=900000))throw new GameError('RUN_ENDED');
  const savedPlan=validate_integrated_plan_issue(next,envelope);
  if(intent.kind==='integrated_assess')save_integrated_assessment(next,envelope,project_integrated_field_view(next));
  else if(intent.kind==='integrated_save_plan')save_integrated_plan(next,envelope,project_integrated_field_view(next));
  else if(intent.kind==='integrated_abort')issue_integrated_abort(next,envelope);
  else if(intent.kind==='integrated_move')issue_integrated_move(next,envelope);
  else if(intent.kind==='integrated_prepare')issue_integrated_prepare(next,envelope);
  else if(intent.kind==='integrated_activity')issue_integrated_activity(next,envelope);
  else if(intent.kind==='tick'||intent.kind==='advance'){
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
  if(savedPlan&&'saved_plan_ref' in intent)next.planning.issues.push({plan_ref:structuredClone(savedPlan.ref),operation_id:envelope.operation_id,issued_at:next.sim_time,payload:structuredClone(intent)});
  next.revision++;
  next.inputs.push({envelope:structuredClone(envelope),at:clock_to===undefined?state.sim_time:next.sim_time,revision:next.revision,...(clock_to===undefined?{}:{clock_to})});
  return next;
}
