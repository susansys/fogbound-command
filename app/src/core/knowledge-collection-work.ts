import {GameError} from '../contracts';
import type {CollectionActor,CollectionRef,CollectionReport,CollectionRequestIntent,CollectionCancelIntent} from '../knowledge-collection-contracts';
import type {CollectionRequestState,KnowledgeCollectionState} from './knowledge-collection-state';
import {canonical} from './snapshot';
import {hash} from './scenario';
import {apply_received_collection_report} from './knowledge-collection-knowledge';
import {is_collection_report,type CollectionArchiveIntent,type CollectionHistoricalReport,type CollectionHistoricalOriginal,type CollectionRootRegistration,type CollectionPairCredential,type CollectionCredentialForwardIntent,type CollectionSourceNotice,type CollectionArchiveReceipt,type CollectionReturnIntent,type CollectionPositionIntent,type CollectionPositionReport} from '../knowledge-collection-contracts';

export function collection_ref<K extends string>(run_id:string,kind:K,id:string):CollectionRef<K>{return {run_id,kind,id,version:1};}
function collection_policy(state:KnowledgeCollectionState,actor:CollectionActor){return actor==='R'?state.definition.collection:state.definition.inspection;}
function collection_device_busy(state:KnowledgeCollectionState,actor:CollectionActor){
  return actor==='R'&&(state.archive_requests.some(item=>item.status==='reading'||item.status==='registering')||state.position_requests.some(item=>item.started_at!==null&&item.completed_at===null&&item.outcome===null));
}
function sort_events(state:KnowledgeCollectionState){
  const phase={gate_change:-1,collection_complete:0,registration_complete:0,archive_read_complete:0,archive_registration_complete:0,return_boundary:0,position_complete:0,receive_return:1,receive_position:1,receive_archive:1,receive_source_forward:1,receive_collection:1,accepted_receipt:1,report_delivery:1,cancel_received:1,window_close:1,start_collection:2,hq_send:2,source_send:2,ir_expiry:3};
  state.schedule.sort((a,b)=>a.at-b.at||phase[a.kind]-phase[b.kind]||a.sequence-b.sequence);
}
function enqueue(state:KnowledgeCollectionState,request_id:string,kind:KnowledgeCollectionState['schedule'][number]['kind'],at:number,command_id?:string){
  state.schedule.push({at,sequence:++state.event_sequence,kind,request_id,...(command_id?{command_id}:{})});sort_events(state);
}
export function queue_source_message(state:KnowledgeCollectionState,input:Pick<import('./knowledge-collection-state').CollectionSourceMessage,'owner_kind'|'request_id'|'actor'|'kind'|'report_ref'|'copy_index'|'credential_id'>){
  const actor=state.actors[input.actor],sent=Math.max(state.sim_time,actor.sender_free_at),received=sent+state.definition.control_receipt.sender_ms;
  const suffix=input.kind==='accepted'?'.accepted':input.kind==='terminal'?'.terminal':'.'+input.kind+'-'+input.copy_index;
  const message:import('./knowledge-collection-state').CollectionSourceMessage={...input,ref:collection_ref(state.run_id,'message',input.request_id+suffix),optional:input.kind==='forward'||input.kind==='credential',planned_sent_at:sent,planned_received_at:received,sent_at:null,received_at:null,status:'queued'};
  if(state.source_messages.some(item=>item.ref.id===message.ref.id))throw new GameError('INVALID_REQUEST');
  state.source_messages.push(message);actor.sender_free_at=received;
  state.schedule.push({at:sent,sequence:++state.event_sequence,kind:'source_send',request_id:input.request_id,source_message_id:message.ref.id},{at:received,sequence:++state.event_sequence,kind:input.kind==='accepted'?'accepted_receipt':'report_delivery',request_id:input.request_id,source_message_id:message.ref.id});sort_events(state);
  return message;
}
function dispatch_hq(state:KnowledgeCollectionState,task:{ref:CollectionRef;intent:{actor:CollectionActor}},kind:'receive_collection'|'cancel_received'|'receive_archive'|'receive_source_forward'|'receive_return'|'receive_position'){
  const sent=Math.max(state.sim_time,state.hq_sender_free_at),received=sent+state.definition.control_receipt.sender_ms;
  const ref=collection_ref(state.run_id,'message',task.ref.id+(kind==='cancel_received'?'.cancel-dispatch':'.dispatch'));
  state.commands.push({ref,request_id:task.ref.id,kind,recipient:task.intent.actor,planned_sent_at:sent,planned_received_at:received,sent_at:sent===state.sim_time?sent:null,delivered_at:null,cancelled_at:null,status:sent===state.sim_time?'sending':'queued'});
  if(sent>state.sim_time)enqueue(state,task.ref.id,'hq_send',sent,ref.id);
  enqueue(state,task.ref.id,kind,received,ref.id);state.hq_sender_free_at=received;
}
function retime_hq_queue(state:KnowledgeCollectionState){
  const sending=state.commands.filter(command=>command.status==='sending');
  if(sending.length>1)throw new GameError('INVALID_REQUEST');
  let free=sending[0]?.planned_received_at??state.sim_time;
  for(const command of state.commands.filter(command=>command.status==='queued')){
    command.planned_sent_at=free;command.planned_received_at=free+state.definition.control_receipt.sender_ms;free=command.planned_received_at;
    for(const event of state.schedule.filter(event=>event.command_id===command.ref.id))event.at=event.kind==='hq_send'?command.planned_sent_at:command.planned_received_at;
    if(command.kind==='receive_collection'){
      const task=state.requests.find(task=>task.ref.id===command.request_id)!;
      task.planned_start_at=Math.max(command.planned_received_at,task.intent.collection_window.from);
    }
  }
  state.hq_sender_free_at=free;sort_events(state);
}
export function request_collection(state:KnowledgeCollectionState,intent:CollectionRequestIntent){
  const policy=collection_policy(state,intent.actor);
  const copies=intent.delivery_copies??1;
  if(!state.definition.case_registry[state.definition.case_ref].delivery_copies.includes(copies)||intent.actor==='W'&&copies!==1)throw new GameError('INVALID_REQUEST');
  if(intent.question_ref.id!==policy.question||intent.target_ref.id!==policy.target||intent.scope_ref.id!==policy.scope||intent.method_ref.id!==policy.method||intent.authority_ref.id!==policy.authority||intent.basis_refs[0].id!=='KA-BRIEF-INITIAL-'+intent.actor)throw new GameError('INVALID_REQUEST');
  if(intent.collection_window.from!==policy.window.from||intent.collection_window.to!==policy.window.to||intent.needed_by>state.definition.public_rules.deadline)throw new GameError('INVALID_REQUEST');
  if(state.requests.some(request=>request.intent.actor===intent.actor&&!(request.cancel?.origin==='local_queue'&&request.cancel.result==='cancelled'||request.report_received_at!==null&&['failed','cancelled'].includes(request.status))))throw new GameError('INVALID_REQUEST');
  const receiveAt=Math.max(state.sim_time,state.hq_sender_free_at)+policy.sender_ms;
  const startAt=Math.max(receiveAt,intent.collection_window.from);
  if(startAt>=intent.collection_window.to)throw new GameError('INVALID_REQUEST');
  const id='collection-'+(state.requests.length+1);
  state.requests.push({ref:collection_ref(state.run_id,'collection_request',id),intent:structuredClone(intent),issued_at:state.sim_time,received_at:null,planned_start_at:startAt,started_at:null,collection_end:null,collection_stopped_at:null,stop_reason:null,registered_at:null,accepted_sent_at:null,accepted_stage:null,accepted_received_at:null,report_sent_at:null,report_received_at:null,status:'tasking',cancel:null});
  state.requirements.push({ref:collection_ref(state.run_id,'requirement',id+'.ir'),request_id:id,question_ref:structuredClone(intent.question_ref),needed_by:intent.needed_by,status:'tasking'});
  dispatch_hq(state,state.requests[state.requests.length-1],'receive_collection');
  enqueue(state,id,'ir_expiry',Math.max(state.sim_time,intent.needed_by));
}
export function cancel_collection(state:KnowledgeCollectionState,intent:CollectionCancelIntent){
  if(intent.authority_ref.id!==state.definition.collection.authority)throw new GameError('INVALID_REQUEST');
  const task=state.requests.find(item=>item.ref.id===intent.request_ref.id);
  if(!task||task.cancel)throw new GameError('INVALID_REQUEST');
  const unsent=state.commands.find(command=>command.request_id===task.ref.id&&command.kind==='receive_collection'&&command.status==='queued');
  task.cancel={ref:collection_ref(state.run_id,'cancellation',task.ref.id+'.cancel'),origin:unsent?'local_queue':'remote',issued_at:state.sim_time,received_at:null,result:unsent?'cancelled':null};
  if(unsent){
    unsent.status='cancelled';unsent.cancelled_at=state.sim_time;task.status='cancelled';
    const requirement=state.requirements.find(ir=>ir.request_id===task.ref.id)!;
    if(!['expired','cancelled','answered','inconclusive'].includes(requirement.status))requirement.status='cancelled';
    state.schedule=state.schedule.filter(event=>event.command_id!==unsent.ref.id);retime_hq_queue(state);state.knowledge_seq++;
  }else dispatch_hq(state,task,'cancel_received');
}
function accrue_energy(state:KnowledgeCollectionState,to:number){
  const elapsed=to-state.sim_time;
  for(const task of state.returns){
    if(task.stage!=='AB'&&task.stage!=='HA')continue;
    const actor=state.actors[task.intent.actor],target=task.stage==='AB'?150000000:50000000,speed=return_speed(task.stage,state.sim_time);
    actor.position[0]=Math.max(target,Math.round(actor.position[0]*1000000)-elapsed*speed)/1000000;
  }
  for(const actor of ['R','W'] as const){
    const profile=state.definition.actors[actor],task=state.requests.find(request=>request.intent.actor===actor&&(request.status==='collecting'||request.status==='registering'));
    const archive=actor==='R'&&state.archive_requests.some(request=>request.status==='reading'||request.status==='registering');
    const positioning=actor==='R'&&state.position_requests.some(request=>request.started_at!==null&&request.completed_at===null&&request.outcome===null);
    const rate=archive||positioning?profile.collection_uj_per_ms:task?.status==='collecting'?profile.collection_uj_per_ms:task?.status==='registering'?profile.registration_uj_per_ms:profile.idle_uj_per_ms;
    const used=state.actors[actor].energy_used_uj+elapsed*rate;
    if(!Number.isSafeInteger(used)||used>profile.energy_uj)throw new GameError('RESOURCE_EXHAUSTED');
    state.actors[actor].energy_used_uj=used;
  }
  state.sim_time=to;
}
async function form_activity_terminal(state:KnowledgeCollectionState,task:CollectionRequestState,cancelled=false){
  const actor=task.intent.actor,policy=collection_policy(state,actor),observation=cancelled?undefined:state.observations.find(item=>item.request_id===task.ref.id);
  if(!cancelled&&(task.collection_stopped_at===null||!observation&&task.stop_reason===null||observation&&(task.started_at===null||!state.actors[actor].blank_record)))throw new GameError('INVALID_REQUEST');
  const area=(rect:typeof policy.planned_scope)=>(rect.max_x-rect.min_x)*(rect.max_y-rect.min_y);
  const content:Omit<CollectionReport,'content_digest'>={
    ...(observation?{root_registration:root_registration(state,actor,actor==='R'?'limited-text-collection':'qualified-facility-inspection')}:{}),
    ref:collection_ref(state.run_id,'report',task.ref.id+'.report'),source_actor:actor,method:cancelled?'task-control-receipt':actor==='R'?'limited-text-collection':'qualified-facility-inspection',
    target_ref:structuredClone(task.intent.target_ref),scope_ref:structuredClone(task.intent.scope_ref),method_ref:cancelled?collection_ref(state.run_id,'method',state.definition.control_receipt.method):structuredClone(task.intent.method_ref),requested_method_ref:structuredClone(task.intent.method_ref),
    observation_ref:observation?.ref??null,record_ref:observation?collection_ref(state.run_id,'record',task.ref.id+'.record'):null,observed_time:observation?{kind:'known',value:observation.observed_at,evidence:observation.ref}:{kind:'unknown'},generated_at:state.sim_time,source_reported_time:{kind:'unknown'},
    body:cancelled?{kind:'collection_cancelled',field:'B.condition',quality:'failed',outcome:'not_covered',conclusion:'unknown',reason:'cancelled_before_start',collection_work_ms:0,limits:['作业开始前已取消，没有生成样本或实体记录']}:!observation?{kind:'collection_failed',field:'B.condition',quality:'failed',outcome:'not_covered',conclusion:'unknown',reason:task.stop_reason!,attempted_interval:{from:task.started_at??task.received_at!,to:task.collection_stopped_at!},collection_work_ms:task.started_at===null?0:task.collection_stopped_at!-task.started_at,limits:['本次采集没有提交持久样本，不能据此判断未采集范围']}:
      observation.sample.kind==='limited_indication'?{kind:'limited_indication',field:'B.condition',quality:'limited',outcome:'inconclusive',limits:['仅取得计划范围内的有限资料，不能据此确认设施状况']}:{kind:'qualified_facility_field',field:'B.condition',condition:observation.sample.condition,object_version:observation.sample.object_version,quality:'qualified',outcome:'detected',qualification_ref:collection_ref(state.run_id,'qualification',state.definition.inspection.qualification),limits:['只适用于本次检查的B设施字段及实际范围']},
    coverage:{planned_scope:structuredClone(policy.planned_scope),actual_scope:structuredClone(observation?.actual_scope??[]),planned_area_m2:area(policy.planned_scope),actual_area_m2:observation?observation.actual_scope.reduce((sum,rect)=>sum+area(rect),0):null,geometry_version:state.definition.hashes.geometry,model_version:1},
    control_outcomes:task.cancel&&task.cancel.result!==null&&task.cancel.received_at!==null?[{request_ref:task.cancel.ref,result:task.cancel.result,decided_at:task.cancel.received_at}]:[],
    resource_snapshot:{actor,at:state.sim_time,energy_used_j:state.actors[actor].energy_used_uj/1000000},
  };
  const content_digest=await hash(canonical(content));
  state.reports.push({...content,content_digest});
  if(observation?.source_local_position)await form_position_report(state,'R-self-position-old','collection-end-self-position',observation.observed_at,observation.source_local_position.point,observation.ref,collection_ref(state.run_id,'registration',task.ref.id+'.registration'));
  if(content.record_ref){state.records.push({ref:content.record_ref,holder:actor,mass_kg:state.definition.actors[actor].blank_record_kg,report_ref:content.ref,canonical_content:JSON.stringify(canonical(content)),content_digest});state.actors[actor].blank_record=false;}
  task.registered_at=cancelled?null:state.sim_time;task.status=cancelled?'cancelled':observation?'completed':'failed';
  task.report_sent_at=queue_source_message(state,{owner_kind:'collection',request_id:task.ref.id,actor,kind:'terminal',report_ref:content.ref,copy_index:0}).planned_sent_at;
  const copies=observation?task.intent.delivery_copies??1:1;
  for(let copy=1;copy<copies;copy++)queue_source_message(state,{owner_kind:'collection',request_id:task.ref.id,actor,kind:'forward',report_ref:content.ref,copy_index:copy});
}
function stop_collection_work(state:KnowledgeCollectionState,task:CollectionRequestState,reason:NonNullable<CollectionRequestState['stop_reason']>){
  task.stop_reason=reason;task.collection_stopped_at=state.sim_time;task.status='registering';
  state.collection_tasks.find(item=>item.request_id===task.ref.id)!.status='failed';
  state.schedule=state.schedule.filter(event=>event.request_id!==task.ref.id||!['start_collection','collection_complete'].includes(event.kind));
  enqueue(state,task.ref.id,'registration_complete',state.sim_time+collection_policy(state,task.intent.actor).registration_ms);
}
export async function advance_collection_work(state:KnowledgeCollectionState,to:number){
  while(state.schedule.length&&state.schedule[0].at<=to){
    const event=state.schedule.shift()!;accrue_energy(state,event.at);
    if(event.source_message_id){
      const message=state.source_messages.find(item=>item.ref.id===event.source_message_id);
      if(!message)throw new GameError('INVALID_REQUEST');
      if(message.status==='cancelled')continue;
      if(event.kind==='source_send'){
        if(message.status!=='queued'||state.source_messages.some(item=>item.actor===message.actor&&item.status==='sending'))throw new GameError('INVALID_REQUEST');
        message.sent_at=state.sim_time;message.status='sending';continue;
      }
      if(message.status!=='sending'||message.sent_at===null)throw new GameError('INVALID_REQUEST');
      message.status='delivered';message.received_at=state.sim_time;
    }
    if(event.kind==='gate_change'){
      const change=state.definition.local_gate_profiles[state.initial_conditions.gate_profile].changes.find(item=>item.at===event.at);
      if(!change)throw new GameError('INVALID_REQUEST');
      state.gates.R=change.status as import('./knowledge-collection-state').CollectionLocalGate;
      for(const task of state.requests.filter(task=>task.intent.actor==='R'&&task.received_at!==null)){
        if(task.status==='collecting'&&state.gates.R!=='met')stop_collection_work(state,task,state.gates.R==='unknown'?'local_gate_unknown':'local_gate_not_met');
        else if(task.status==='waiting'&&state.gates.R==='not_met'&&state.sim_time>=task.intent.collection_window.from)stop_collection_work(state,task,'local_gate_not_met');
        else if(task.status==='waiting'&&state.gates.R==='met'&&state.sim_time<task.intent.collection_window.to&&!state.schedule.some(item=>item.request_id===task.ref.id&&item.kind==='start_collection'))enqueue(state,task.ref.id,'start_collection',Math.max(state.sim_time,task.intent.collection_window.from));
      }
      continue;
    }
    if(event.command_id){
      const command=state.commands.find(command=>command.ref.id===event.command_id);
      if(!command||command.status==='cancelled')throw new GameError('INVALID_REQUEST');
      if(event.kind==='hq_send'){command.sent_at=state.sim_time;command.status='sending';continue;}
      command.delivered_at=state.sim_time;command.status='delivered';
    }
    const returning=state.returns.find(request=>request.ref.id===event.request_id);
    if(returning){advance_return(state,returning,event);continue;}
    const positioning=state.position_requests.find(request=>request.ref.id===event.request_id);
    if(positioning){await advance_position(state,positioning,event);continue;}
    const forward=state.source_forwards.find(request=>request.ref.id===event.request_id);
    if(forward){await advance_source_forward(state,forward,event);continue;}
    const archive=state.archive_requests.find(request=>request.ref.id===event.request_id);
    if(archive){await advance_archive(state,archive,event);continue;}
    const task=state.requests.find(request=>request.ref.id===event.request_id);
    if(!task)throw new GameError('INVALID_REQUEST');
    const policy=collection_policy(state,task.intent.actor);
    if(event.kind==='ir_expiry'){
      const requirement=state.requirements.find(ir=>ir.request_id===task.ref.id)!;
      if(!['answered','inconclusive','cancelled','expired'].includes(requirement.status)){requirement.status='expired';state.knowledge_seq++;}
    }else if(event.kind==='receive_collection'){
      task.received_at=state.sim_time;task.status='waiting';
      state.collection_tasks.push({ref:collection_ref(state.run_id,'collection_task',task.ref.id+'.task'),request_id:task.ref.id,requirement_ref:state.requirements.find(ir=>ir.request_id===task.ref.id)!.ref,source_actor:task.intent.actor,labor_ref:task.intent.actor+':LABOR',device_ref:task.intent.actor+':COLLECTOR',window:structuredClone(task.intent.collection_window),scope_ref:structuredClone(task.intent.scope_ref),method_ref:structuredClone(task.intent.method_ref),authority_ref:structuredClone(task.intent.authority_ref),basis_refs:structuredClone(task.intent.basis_refs),status:'allocated',started_at:null,observed_at:null});
      const point=state.actors[task.intent.actor].position,not_at_site=point[0]!==250||point[1]!==150;
      const busy=collection_device_busy(state,task.intent.actor);
      task.accepted_stage=not_at_site?'refused_site':busy?'refused_capacity':state.gates[task.intent.actor]==='unknown'?'waiting_gate':state.gates[task.intent.actor]==='not_met'?'refused_gate':task.planned_start_at>state.sim_time?'waiting_window':'collecting';
      task.accepted_sent_at=queue_source_message(state,{owner_kind:'collection',request_id:task.ref.id,actor:task.intent.actor,kind:'accepted',report_ref:null,copy_index:0}).planned_sent_at;
      if(not_at_site||busy){await refuse_local_collection(state,task,not_at_site?'not_at_site':'capacity');continue;}
      enqueue(state,task.ref.id,'start_collection',task.planned_start_at);
      enqueue(state,task.ref.id,'window_close',task.intent.collection_window.to);
    }else if(event.kind==='start_collection'){
      const actor=state.actors[task.intent.actor];
      if(actor.position[0]!==250||actor.position[1]!==150){await refuse_local_collection(state,task,'not_at_site');continue;}
      if(state.gates[task.intent.actor]==='unknown')continue;
      if(state.gates[task.intent.actor]==='not_met'){stop_collection_work(state,task,'local_gate_not_met');continue;}
      if(collection_device_busy(state,task.intent.actor)){await refuse_local_collection(state,task,'capacity');continue;}
      task.started_at=state.sim_time;task.status='collecting';
      const collection=state.collection_tasks.find(item=>item.request_id===task.ref.id)!;collection.status='collecting';collection.started_at=state.sim_time;
      enqueue(state,task.ref.id,'collection_complete',Math.min(state.sim_time+policy.collection_ms,task.intent.collection_window.to));
    }else if(event.kind==='window_close'){
      if(task.status==='waiting')stop_collection_work(state,task,'window_closed');
    }else if(event.kind==='accepted_receipt'){
      task.accepted_received_at=state.sim_time;state.knowledge_seq++;
      const requirement=state.requirements.find(ir=>ir.request_id===task.ref.id)!;
      if(task.accepted_stage==='collecting'&&requirement.status==='tasking')requirement.status='collecting';
    }else if(event.kind==='collection_complete'){
      task.collection_stopped_at=state.sim_time;
      if(task.started_at===null)throw new GameError('INVALID_REQUEST');
      if(state.sim_time-task.started_at<policy.collection_ms){
        state.collection_tasks.find(item=>item.request_id===task.ref.id)!.status='failed';
        task.stop_reason='window_closed';task.status='registering';
        enqueue(state,task.ref.id,'registration_complete',state.sim_time+policy.registration_ms);continue;
      }
      const p=policy.planned_scope,s=policy.available_surface;
      const actual={min_x:Math.max(p.min_x,s.min_x),max_x:Math.min(p.max_x,s.max_x),min_y:Math.max(p.min_y,s.min_y),max_y:Math.min(p.max_y,s.max_y)};
      if(task.intent.actor==='R'&&state.initial_conditions.surface==='empty'||actual.max_x<=actual.min_x||actual.max_y<=actual.min_y){
        state.collection_tasks.find(item=>item.request_id===task.ref.id)!.status='failed';
        task.collection_end=state.sim_time;task.stop_reason='empty_scope';task.status='registering';
        enqueue(state,task.ref.id,'registration_complete',state.sim_time+policy.registration_ms);continue;
      }
      state.observations.push({ref:collection_ref(state.run_id,'observation',task.ref.id+'.observation'),request_id:task.ref.id,observed_at:state.sim_time,...(state.definition.case_ref==='KA-LATE-POSITION-01'&&task.intent.actor==='R'?{source_local_position:{point:structuredClone(state.actors.R.position),route_version:state.definition.hashes.geometry}}:{}),actual_scope:[actual],sample:task.intent.actor==='R'?{kind:'limited_indication'}:{kind:'facility_condition',condition:state.facility.condition,object_version:state.facility.version}});
      const collection=state.collection_tasks.find(item=>item.request_id===task.ref.id)!;collection.status='collected';collection.observed_at=state.sim_time;
      task.collection_end=state.sim_time;task.status='registering';
      enqueue(state,task.ref.id,'registration_complete',state.sim_time+policy.registration_ms);
    }else if(event.kind==='registration_complete')await form_activity_terminal(state,task);
    else if(event.kind==='cancel_received'){
      if(!task.cancel)throw new GameError('INVALID_REQUEST');
      task.cancel.received_at=state.sim_time;
      if(task.status==='waiting'||task.status==='tasking'){
        task.cancel.result='cancelled';
        state.collection_tasks.find(item=>item.request_id===task.ref.id)!.status='cancelled';
        state.schedule=state.schedule.filter(item=>item.request_id!==task.ref.id||!['start_collection','collection_complete','registration_complete'].includes(item.kind));
        await form_activity_terminal(state,task,true);
      }else task.cancel.result=task.status==='collecting'||task.status==='registering'?'already_started':'already_completed';
    }else{
      const report=state.reports.find(item=>item.ref.id===task.ref.id+'.report');
      if(!report||!is_collection_report(report)||task.report_sent_at===null)throw new GameError('INVALID_REQUEST');
      const message=state.source_messages.find(item=>item.ref.id===event.source_message_id);
      if(!message||message.sent_at===null||message.report_ref?.id!==report.ref.id)throw new GameError('INVALID_REQUEST');
      const deliveryId=message.kind==='terminal'?task.ref.id+'.delivery':message.ref.id+'.delivery';
      state.deliveries.push({ref:collection_ref(state.run_id,'delivery',deliveryId),report_ref:report.ref,message_ref:message.ref,sender:task.intent.actor,recipient:'HQ',sent_at:message.sent_at,received_at:state.sim_time,knowledge_seq:++state.knowledge_seq});
      task.report_received_at??=state.sim_time;
      apply_received_collection_report(state.knowledge,{run_id:state.run_id,report,delivery:state.deliveries[state.deliveries.length-1],received_reports:state.reports.filter(is_collection_report).filter(item=>state.deliveries.some(delivery=>delivery.report_ref.id===item.ref.id)),geometry_version:state.definition.hashes.geometry});
      const requirement=state.requirements.find(ir=>ir.request_id===task.ref.id)!;
      if(!['expired','cancelled','answered','inconclusive'].includes(requirement.status)){
        if(report.body.kind==='collection_cancelled')requirement.status='cancelled';
        else if(report.body.quality==='qualified')requirement.status='answered';
        else if(report.body.quality==='limited')requirement.status='inconclusive';
      }
    }
  }
  accrue_energy(state,to);
  advance_intel_work(state.intel,to);
}
async function refuse_local_collection(state:KnowledgeCollectionState,task:CollectionRequestState,reason:'not_at_site'|'capacity'){
  task.stop_reason=reason;task.collection_stopped_at=state.sim_time;
  state.collection_tasks.find(item=>item.request_id===task.ref.id)!.status='failed';
  // This is a local refusal receipt, not a sampled/registering work phase.
  await form_activity_terminal(state,task);
}

export function request_archive_read(state:KnowledgeCollectionState,intent:CollectionArchiveIntent){
  const policy=state.definition.archive_policy;
  if(state.definition.case_ref!=='KA-SOURCE3-01'||intent.method_ref.id!==policy.method||intent.authority_ref.id!==policy.authority||state.archive_requests.some(task=>task.intent.entry===intent.entry))throw new GameError('INVALID_REQUEST');
  const task:import('./knowledge-collection-state').ArchiveReadState={ref:collection_ref(state.run_id,'archive_request','archive-'+(state.archive_requests.length+1)),intent:structuredClone(intent),registered_output:null,issued_at:state.sim_time,received_at:null,started_at:null,read_completed_at:null,registered_at:null,accepted_sent_at:null,accepted_received_at:null,terminal_sent_at:null,terminal_received_at:null,status:'tasking',outcome:null};
  state.archive_requests.push(task);dispatch_hq(state,task,'receive_archive');
}
export function request_collection_return(state:KnowledgeCollectionState,intent:CollectionReturnIntent){
  const previous=state.returns.filter(task=>task.intent.actor===intent.actor);
  if(intent.authority_ref.id!=='KA-INITIAL'||previous.some(task=>task.stage!=='failed'))throw new GameError('INVALID_REQUEST');
  const task:import('./knowledge-collection-state').CollectionReturnState={ref:collection_ref(state.run_id,'return_request','return-'+intent.actor+(previous.length?'-'+(previous.length+1):'')),intent:structuredClone(intent),issued_at:state.sim_time,received_at:null,started_at:null,arrived_at:null,stage:'tasking',outcome:null,accepted_sent_at:null,accepted_received_at:null};
  state.returns.push(task);dispatch_hq(state,task,'receive_return');
}
function return_speed(stage:'AB'|'HA',at:number){return stage==='HA'?1000:at>=180000&&at<300000?700:850;}
function queue_return_boundary(state:KnowledgeCollectionState,task:import('./knowledge-collection-state').CollectionReturnState){
  if(task.stage!=='AB'&&task.stage!=='HA')throw new GameError('INVALID_REQUEST');
  const target=task.stage==='AB'?150000000:50000000,remaining=Math.round(state.actors[task.intent.actor].position[0]*1000000)-target;
  const weather=task.stage==='AB'?(state.sim_time<180000?180000:state.sim_time<300000?300000:Infinity):Infinity;
  enqueue(state,task.ref.id,'return_boundary',Math.min(state.sim_time+Math.ceil(remaining/return_speed(task.stage,state.sim_time)),weather));
}
function advance_return(state:KnowledgeCollectionState,task:import('./knowledge-collection-state').CollectionReturnState,event:KnowledgeCollectionState['schedule'][number]){
  if(event.kind==='receive_return'){
    task.received_at=state.sim_time;
    const busy=state.requests.some(item=>item.intent.actor===task.intent.actor&&(item.status==='waiting'||item.status==='collecting'||item.status==='registering'))||task.intent.actor==='R'&&state.archive_requests.some(item=>item.status==='reading'||item.status==='registering');
    task.outcome=busy?'capacity':'moving';task.stage=busy?'failed':'AB';
    task.accepted_sent_at=queue_source_message(state,{owner_kind:'return',request_id:task.ref.id,actor:task.intent.actor,kind:'accepted',report_ref:null,copy_index:0}).planned_sent_at;
    if(!busy){task.started_at=state.sim_time;queue_return_boundary(state,task);}
  }else if(event.kind==='accepted_receipt'){task.accepted_received_at=state.sim_time;state.knowledge_seq++;}
  else if(event.kind==='return_boundary'){
    const point=state.actors[task.intent.actor].position;
    if(task.stage==='AB'&&point[0]===150)task.stage='HA';
    else if(task.stage==='HA'&&point[0]===50){task.stage='arrived';task.arrived_at=state.sim_time;return;}
    queue_return_boundary(state,task);
  }else throw new GameError('INVALID_REQUEST');
}
export function request_collection_position(state:KnowledgeCollectionState,intent:CollectionPositionIntent){
  if(state.definition.case_ref!=='KA-LATE-POSITION-01'||intent.authority_ref.id!==state.definition.position_policy.authority||intent.kind==='request_self_position'&&(intent.method_ref.id!==state.definition.position_policy.method||state.position_requests.some(task=>task.intent.kind==='request_self_position'))||intent.kind==='forward_position_report'&&!state.requests.some(task=>task.ref.id===intent.collection_request_ref.id&&task.intent.actor==='R'))throw new GameError('INVALID_REQUEST');
  const task:import('./knowledge-collection-state').CollectionPositionState={ref:collection_ref(state.run_id,'position_request','position-'+(state.position_requests.length+1)),intent:structuredClone(intent),issued_at:state.sim_time,received_at:null,started_at:null,completed_at:null,outcome:null,accepted_sent_at:null,accepted_received_at:null,terminal_sent_at:null,terminal_received_at:null,report_ref:null};
  state.position_requests.push(task);dispatch_hq(state,task,'receive_position');
}
async function form_position_report(state:KnowledgeCollectionState,id:string,method:CollectionPositionReport['method'],observed_at:number,point:[number,number],observation:CollectionRef<'observation'>,registration:CollectionRef<'registration'>){
  const content:Omit<CollectionPositionReport,'content_digest'>={ref:collection_ref(state.run_id,'report',id),source_actor:'R',method,target_ref:collection_ref(state.run_id,'actor','R'),scope_ref:collection_ref(state.run_id,'scope','R-self'),method_ref:collection_ref(state.run_id,'method',method),observation_ref:observation,observed_time:{kind:'known',value:observed_at,evidence:observation},generated_at:state.sim_time,source_reported_time:{kind:'known',value:state.sim_time,evidence:registration},body:{kind:'self_position',field:'R.position',quality:'registered',outcome:'recorded',point:structuredClone(point),geometry_version:state.definition.hashes.geometry,route_version:state.definition.hashes.geometry,qualification_ref:collection_ref(state.run_id,'qualification',state.definition.position_policy.qualification),limits:['只表示R自身在所标观察时点登记的架空位置，不持续跟踪当前位置']}};
  if(state.reports.some(report=>report.ref.id===id))throw new GameError('INVALID_REQUEST');
  state.reports.push({...content,content_digest:await hash(canonical(content))});return content.ref;
}
async function advance_position(state:KnowledgeCollectionState,task:import('./knowledge-collection-state').CollectionPositionState,event:KnowledgeCollectionState['schedule'][number]){
  const terminal=()=>{task.terminal_sent_at=queue_source_message(state,{owner_kind:'position',request_id:task.ref.id,actor:'R',kind:'terminal',report_ref:task.report_ref,copy_index:0}).planned_sent_at;};
  if(event.kind==='receive_position'){
    task.received_at=state.sim_time;
    if(task.intent.kind==='forward_position_report'){
      const observation=state.observations.find(item=>item.request_id===(task.intent as Extract<CollectionPositionIntent,{kind:'forward_position_report'}>).collection_request_ref.id);
      const report=state.reports.find(item=>item.ref.id==='R-self-position-old'&&item.observation_ref?.id===observation?.ref.id);
      task.report_ref=report?.ref??null;task.outcome=report?'completed':'not_available';terminal();return;
    }
    const busy=state.requests.some(item=>item.intent.actor==='R'&&(item.status==='collecting'||item.status==='registering'))||state.archive_requests.some(item=>item.status==='reading'||item.status==='registering')||state.position_requests.some(item=>item.ref.id!==task.ref.id&&item.started_at!==null&&item.completed_at===null&&item.outcome===null);
    task.accepted_sent_at=queue_source_message(state,{owner_kind:'position',request_id:task.ref.id,actor:'R',kind:'accepted',report_ref:null,copy_index:0}).planned_sent_at;
    if(busy||state.sim_time+state.definition.position_policy.work_ms>state.definition.public_rules.deadline){task.outcome=busy?'capacity':'deadline';terminal();}
    else{task.started_at=state.sim_time;enqueue(state,task.ref.id,'position_complete',state.sim_time+state.definition.position_policy.work_ms);}
  }else if(event.kind==='position_complete'){
    task.completed_at=state.sim_time;task.outcome='completed';
    task.report_ref=await form_position_report(state,'R-self-position-new','self-position-registration',state.sim_time,state.actors.R.position,collection_ref(state.run_id,'observation',task.ref.id+'.observation'),collection_ref(state.run_id,'registration',task.ref.id+'.registration'));terminal();
  }else if(event.kind==='accepted_receipt'){task.accepted_received_at=state.sim_time;state.knowledge_seq++;}
  else if(event.kind==='report_delivery'){
    const message=state.source_messages.find(item=>item.ref.id===event.source_message_id);
    if(!message||message.sent_at===null||task.received_at===null)throw new GameError('INVALID_REQUEST');
    task.terminal_received_at=state.sim_time;state.knowledge_seq++;
    if(task.report_ref)state.deliveries.push({ref:collection_ref(state.run_id,'delivery',task.ref.id+'.delivery'),report_ref:task.report_ref,message_ref:message.ref,sender:'R',recipient:'HQ',sent_at:message.sent_at,received_at:state.sim_time,knowledge_seq:state.knowledge_seq,position_receipt:{request_ref:task.ref,accepted_at:task.received_at}});
  }else throw new GameError('INVALID_REQUEST');
}
async function advance_archive(state:KnowledgeCollectionState,task:import('./knowledge-collection-state').ArchiveReadState,event:KnowledgeCollectionState['schedule'][number]){
  const policy=state.definition.archive_policy;
  const send=(kind:'accepted'|'terminal',report_ref:CollectionRef<'report'>|null)=>queue_source_message(state,{owner_kind:'archive',request_id:task.ref.id,actor:'R',kind,report_ref,copy_index:0}).planned_sent_at;
  if(event.kind==='receive_archive'){
    task.received_at=state.sim_time;
    const busy=state.requests.some(item=>item.intent.actor==='R'&&(item.status==='collecting'||item.status==='registering'))||state.archive_requests.some(item=>item.ref.id!==task.ref.id&&(item.status==='reading'||item.status==='registering'));
    const position=state.actors.R.position;
    task.outcome=position[0]!==250||position[1]!==150?'not_at_site':busy?'capacity':state.sim_time+policy.read_ms+policy.registration_ms>state.definition.public_rules.deadline?'deadline':null;
    task.accepted_sent_at=send('accepted',null);
    if(task.outcome){task.status='failed';task.terminal_sent_at=send('terminal',null);}
    else{task.status='reading';task.started_at=state.sim_time;enqueue(state,task.ref.id,'archive_read_complete',state.sim_time+policy.read_ms);}
  }else if(event.kind==='archive_read_complete'){
    task.read_completed_at=state.sim_time;task.status='registering';enqueue(state,task.ref.id,'archive_registration_complete',state.sim_time+policy.registration_ms);
  }else if(event.kind==='archive_registration_complete'){
    task.registered_at=state.sim_time;task.status='completed';task.outcome='completed';
    if(task.intent.entry!=='survey'){
      const notice=structuredClone(state.definition.archive_materials.notices.find(item=>item.kind===task.intent.entry)) as CollectionSourceNotice;
      if(!notice)throw new GameError('INVALID_REQUEST');
      task.registered_output={kind:'notice',notice,digest:await hash(canonical(notice))};task.terminal_sent_at=send('terminal',null);return;
    }
    const original=structuredClone(state.definition.archive_materials.survey) as CollectionHistoricalOriginal;
    if(await hash(canonical(original))!==state.definition.archive_materials.survey_digest)throw new GameError('INVALID_DEFINITION');
    const observation=collection_ref(state.run_id,'observation',original.id+'.historical');
    const content:Omit<CollectionHistoricalReport,'content_digest'>={root_registration:root_registration(state,'S','historical-survey-text'),ref:collection_ref(state.run_id,'report',original.id),source_actor:'S',method:'historical-survey-text',target_ref:collection_ref(state.run_id,'facility','B'),scope_ref:collection_ref(state.run_id,'scope','B'),method_ref:collection_ref(state.run_id,'method','historical-survey-text'),observation_ref:observation,record_ref:null,observed_time:{kind:'known',value:original.observed_at,evidence:observation},generated_at:original.generated_at,source_reported_time:{kind:'unknown'},body:{kind:'historical_survey',field:'B.condition',quality:'limited',outcome:'inconclusive',original,original_digest:await hash(canonical(original)),limits:structuredClone(original.limits)}};
    state.reports.push({...content,content_digest:await hash(canonical(content))});task.terminal_sent_at=send('terminal',content.ref);
    const credentials=[];
    for(const pair of state.definition.archive_materials.pairs){const body=structuredClone(pair) as CollectionPairCredential;credentials.push({body,digest:await hash(canonical(body))});}
    task.registered_output={kind:'survey',report_ref:content.ref,credentials};
    if(task.intent.forward_credentials==='all')for(let i=0;i<credentials.length;i++)queue_source_message(state,{owner_kind:'archive',request_id:task.ref.id,actor:'R',kind:'credential',report_ref:null,copy_index:i,credential_id:credentials[i].body.id});
  }else if(event.kind==='accepted_receipt'){task.accepted_received_at=state.sim_time;state.knowledge_seq++;}
  else if(event.kind==='report_delivery'){
    const message=state.source_messages.find(item=>item.ref.id===event.source_message_id);
    if(!message||message.sent_at===null)throw new GameError('INVALID_REQUEST');
    if(message.kind==='credential'){
      const material=task.registered_output?.kind==='survey'?task.registered_output.credentials[message.copy_index]:undefined;
      if(!material||material.body.id!==message.credential_id)throw new GameError('INVALID_REQUEST');
      state.source_credentials.push({ref:collection_ref(state.run_id,'credential_delivery',message.ref.id+'.delivery'),credential:structuredClone(material.body),credential_digest:material.digest,message_ref:message.ref,reader_request_ref:task.ref,sender:'R',recipient:'HQ',sent_at:message.sent_at,received_at:state.sim_time,knowledge_seq:++state.knowledge_seq});return;
    }
    task.terminal_received_at=state.sim_time;state.knowledge_seq++;
    if(task.outcome==='completed'&&task.intent.entry!=='survey'){
      const output=task.registered_output;
      if(output?.kind!=='notice')throw new GameError('INVALID_REQUEST');
      state.source_notices.push({ref:collection_ref(state.run_id,'source_notice_delivery',task.ref.id+'.notice-delivery'),notice:structuredClone(output.notice),notice_digest:output.digest,message_ref:message.ref,archive_read_receipt:archive_receipt(task),sender:'R',recipient:'HQ',sent_at:message.sent_at,received_at:state.sim_time,knowledge_seq:state.knowledge_seq});return;
    }
    if(message.report_ref){
      if(task.started_at===null||task.read_completed_at===null||task.registered_at===null)throw new GameError('INVALID_REQUEST');
      state.deliveries.push({ref:collection_ref(state.run_id,'delivery',task.ref.id+'.delivery'),report_ref:message.report_ref,message_ref:message.ref,sender:'R',recipient:'HQ',sent_at:message.sent_at,received_at:state.sim_time,knowledge_seq:state.knowledge_seq,archive_read_receipt:archive_receipt(task)});
    }
  }else throw new GameError('INVALID_REQUEST');
}
function archive_receipt(task:import('./knowledge-collection-state').ArchiveReadState):CollectionArchiveReceipt{
  if(task.started_at===null||task.read_completed_at===null||task.registered_at===null)throw new GameError('INVALID_REQUEST');
  return {request_ref:task.ref,reader:'R',entry:task.intent.entry,read_started_at:task.started_at,read_completed_at:task.read_completed_at,registered_at:task.registered_at,available_credential_roles:task.registered_output?.kind==='survey'?task.registered_output.credentials.map(item=>item.body.id):[]};
}

function root_registration(state:KnowledgeCollectionState,actor:'R'|'W'|'S',method:string):CollectionRootRegistration{
  return {root_ref:collection_ref(state.run_id,'source-root','root-'+actor),actor,method_ref:collection_ref(state.run_id,'method',method),scope:{id:'B',version:1},issuer:'scenario-source-registrar',issued_at:-65000,qualification:{id:'root-'+actor,version:1}};
}

export function request_source_forward(state:KnowledgeCollectionState,intent:CollectionCredentialForwardIntent){
  if(state.definition.case_ref!=='KA-SOURCE3-01'||intent.authority_ref.id!==state.definition.archive_policy.authority||!state.archive_requests.some(task=>task.ref.id===intent.reader_request_ref.id))throw new GameError('INVALID_REQUEST');
  // Admission uses the public request identity; material availability is checked only when R receives the command.
  const task:import('./knowledge-collection-state').SourceForwardState={ref:collection_ref(state.run_id,'source_forward','source-forward-'+(state.source_forwards.length+1)),intent:structuredClone(intent),materials:[],issued_at:state.sim_time,received_at:null,outcome:null,terminal_sent_at:null,terminal_received_at:null};
  state.source_forwards.push(task);dispatch_hq(state,task,'receive_source_forward');
}
export function admit_bounded_collection_control(state:KnowledgeCollectionState,envelope:import('../knowledge-collection-contracts').KnowledgeCollectionEnvelope){
  const intent=envelope.intent;
  if(intent.kind!=='forward_source_credential'&&intent.kind!=='forward_position_report'&&intent.kind!=='request_self_position'&&intent.kind!=='request_archive_read'&&intent.kind!=='return_to_headquarters')return true;
  const requests=[...state.requests,...state.archive_requests,...state.source_forwards,...state.position_requests,...state.returns];
  const queued=state.commands.find(command=>command.recipient===intent.actor&&command.status==='queued');
  const same=requests.find(task=>task.intent.actor===intent.actor&&task.intent.kind===intent.kind&&('terminal_received_at' in task?task.terminal_received_at===null:'accepted_received_at' in task?task.accepted_received_at===null:false));
  const pending=queued?requests.find(task=>task.ref.id===queued.request_id):same;
  if(!pending)return true;
  state.control_admissions.push({operation_id:envelope.operation_id,at:state.sim_time,actor:intent.actor,outcome:'busy',pending_ref:structuredClone(pending.ref)});return false;
}
async function advance_source_forward(state:KnowledgeCollectionState,task:import('./knowledge-collection-state').SourceForwardState,event:KnowledgeCollectionState['schedule'][number]){
  if(event.kind==='receive_source_forward'){
    task.received_at=state.sim_time;
    const read=state.archive_requests.find(item=>item.ref.id===task.intent.reader_request_ref.id);
    const held=read?.registered_output?.kind==='survey'?read.registered_output.credentials:[];
    const materials=task.intent.credential_roles.map(role=>held.find(item=>item.body.id===role));
    task.outcome=!read||read.intent.entry!=='survey'||read.status!=='completed'||read.registered_at===null||materials.some(item=>!item)?'not_available':state.source_messages.some(message=>message.actor==='R'&&message.optional&&(message.status==='queued'||message.status==='sending'))?'busy':state.source_messages.some(message=>message.kind==='credential'&&message.status!=='cancelled'&&message.credential_id!==undefined&&task.intent.credential_roles.includes(message.credential_id))?'already_forwarded':'completed';
    if(task.outcome!=='completed'){
      task.terminal_sent_at=queue_source_message(state,{owner_kind:'source_forward',request_id:task.ref.id,actor:'R',kind:'terminal',report_ref:null,copy_index:0}).planned_sent_at;
    }else for(const material of materials){
      if(!material)throw new GameError('INVALID_REQUEST');
      const index=task.materials.length;task.materials.push(structuredClone(material));
      const message=queue_source_message(state,{owner_kind:'source_forward',request_id:task.ref.id,actor:'R',kind:'credential',report_ref:null,copy_index:index,credential_id:material.body.id});task.terminal_sent_at=message.planned_sent_at;
    }
  }else if(event.kind==='report_delivery'){
    const message=state.source_messages.find(item=>item.ref.id===event.source_message_id);
    if(!message||message.sent_at===null)throw new GameError('INVALID_REQUEST');
    if(message.kind==='credential'){
      const material=task.materials[message.copy_index];
      if(!material||material.body.id!==message.credential_id)throw new GameError('INVALID_REQUEST');
      state.source_credentials.push({ref:collection_ref(state.run_id,'credential_delivery',message.ref.id+'.delivery'),credential:structuredClone(material.body),credential_digest:material.digest,message_ref:message.ref,reader_request_ref:task.intent.reader_request_ref,sender:'R',recipient:'HQ',sent_at:message.sent_at,received_at:state.sim_time,knowledge_seq:++state.knowledge_seq});
    }else state.knowledge_seq++;
    if(message.sent_at===task.terminal_sent_at)task.terminal_received_at=state.sim_time;
  }else throw new GameError('INVALID_REQUEST');
}

export function create_intel_work():import('./knowledge-collection-state').IntelWorkPool{
  return {resource_ref:'INTEL',capacity:1,at:0,next_ticket:1,jobs:[]};
}
export function queue_intel_work(pool:import('./knowledge-collection-state').IntelWorkPool,input:Pick<import('./knowledge-collection-state').IntelWorkJob,'id'|'kind'|'eligible_at'|'work_ms'>){
  if(!input.id||pool.jobs.some(job=>job.id===input.id)||!Number.isSafeInteger(input.eligible_at)||input.eligible_at<pool.at||!Number.isSafeInteger(input.work_ms)||input.work_ms<=0)throw new GameError('INVALID_REQUEST');
  const job:import('./knowledge-collection-state').IntelWorkJob={...input,resource_ref:'INTEL',ticket:pool.next_ticket++,used_ms:0,status:'queued',started_at:null,completed_at:null};
  pool.jobs.push(job);return job;
}
export function start_intel_work(pool:import('./knowledge-collection-state').IntelWorkPool){
  if(pool.jobs.some(job=>job.status==='processing'))return;
  const next=pool.jobs.filter(job=>job.status==='queued'&&job.eligible_at<=pool.at).sort((a,b)=>a.eligible_at-b.eligible_at||a.ticket-b.ticket)[0];
  if(next){next.status='processing';next.started_at=pool.at;}
}
export function advance_intel_work(pool:import('./knowledge-collection-state').IntelWorkPool,to:number){
  if(!Number.isSafeInteger(to)||to<pool.at)throw new GameError('INVALID_INPUT');
  while(pool.at<to){
    start_intel_work(pool);
    const active=pool.jobs.find(job=>job.status==='processing');
    if(!active){
      const eligible=pool.jobs.filter(job=>job.status==='queued').map(job=>job.eligible_at).filter(at=>at>pool.at);
      pool.at=Math.min(to,...eligible);continue;
    }
    const end=Math.min(to,pool.at+active.work_ms-active.used_ms);
    active.used_ms+=end-pool.at;pool.at=end;
    if(active.used_ms===active.work_ms){active.status='completed';active.completed_at=pool.at;}
  }
  // At the exact target, release completion first. Controls and start are separate phases.
}
export function cancel_intel_work(pool:import('./knowledge-collection-state').IntelWorkPool,id:string){
  const job=pool.jobs.find(job=>job.id===id);if(!job)throw new GameError('INVALID_REQUEST');
  if(job.status==='processing')return 'already_started';
  if(job.status==='queued'){job.status='cancelled';return 'cancelled';}
  return job.status==='cancelled'?'cancelled':'already_completed';
}
