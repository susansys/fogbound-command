import {GameError} from '../contracts';
import type {CollectionActor,CollectionRef,CollectionReport,CollectionRequestIntent,CollectionCancelIntent} from '../knowledge-collection-contracts';
import type {CollectionRequestState,KnowledgeCollectionState} from './knowledge-collection-state';
import {canonical} from './snapshot';
import {hash} from './scenario';

export function collection_ref<K extends string>(run_id:string,kind:K,id:string):CollectionRef<K>{return {run_id,kind,id,version:1};}
function collection_policy(state:KnowledgeCollectionState,actor:CollectionActor){return actor==='R'?state.definition.collection:state.definition.inspection;}
function sort_events(state:KnowledgeCollectionState){
  const phase={gate_change:-1,collection_complete:0,registration_complete:0,receive_collection:1,accepted_receipt:1,report_delivery:1,cancel_received:1,window_close:1,start_collection:2,hq_send:2,ir_expiry:3};
  state.schedule.sort((a,b)=>a.at-b.at||phase[a.kind]-phase[b.kind]||a.sequence-b.sequence);
}
function enqueue(state:KnowledgeCollectionState,request_id:string,kind:KnowledgeCollectionState['schedule'][number]['kind'],at:number,command_id?:string){
  state.schedule.push({at,sequence:++state.event_sequence,kind,request_id,...(command_id?{command_id}:{})});sort_events(state);
}
function dispatch_hq(state:KnowledgeCollectionState,task:CollectionRequestState,kind:'receive_collection'|'cancel_received'){
  const sent=Math.max(state.sim_time,state.hq_sender_free_at),received=sent+state.definition.control_receipt.sender_ms;
  const ref=collection_ref(state.run_id,'message',task.ref.id+(kind==='receive_collection'?'.dispatch':'.cancel-dispatch'));
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
  for(const actor of ['R','W'] as const){
    const profile=state.definition.actors[actor],task=state.requests.find(request=>request.intent.actor===actor&&(request.status==='collecting'||request.status==='registering'));
    const rate=task?.status==='collecting'?profile.collection_uj_per_ms:task?.status==='registering'?profile.registration_uj_per_ms:profile.idle_uj_per_ms;
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
  if(content.record_ref){state.records.push({ref:content.record_ref,holder:actor,mass_kg:state.definition.actors[actor].blank_record_kg,report_ref:content.ref,canonical_content:JSON.stringify(canonical(content)),content_digest});state.actors[actor].blank_record=false;}
  task.registered_at=cancelled?null:state.sim_time;task.status=cancelled?'cancelled':observation?'completed':'failed';
  task.report_sent_at=Math.max(state.sim_time,state.actors[actor].sender_free_at);
  state.actors[actor].sender_free_at=task.report_sent_at+policy.sender_ms;
  enqueue(state,task.ref.id,'report_delivery',state.actors[actor].sender_free_at);
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
    const task=state.requests.find(request=>request.ref.id===event.request_id);
    if(!task)throw new GameError('INVALID_REQUEST');
    if(event.command_id){
      const command=state.commands.find(command=>command.ref.id===event.command_id);
      if(!command||command.status==='cancelled')throw new GameError('INVALID_REQUEST');
      if(event.kind==='hq_send'){command.sent_at=state.sim_time;command.status='sending';continue;}
      command.delivered_at=state.sim_time;command.status='delivered';
    }
    const policy=collection_policy(state,task.intent.actor);
    if(event.kind==='ir_expiry'){
      const requirement=state.requirements.find(ir=>ir.request_id===task.ref.id)!;
      if(!['answered','inconclusive','cancelled','expired'].includes(requirement.status)){requirement.status='expired';state.knowledge_seq++;}
    }else if(event.kind==='receive_collection'){
      task.received_at=state.sim_time;task.status='waiting';
      state.collection_tasks.push({ref:collection_ref(state.run_id,'collection_task',task.ref.id+'.task'),request_id:task.ref.id,requirement_ref:state.requirements.find(ir=>ir.request_id===task.ref.id)!.ref,source_actor:task.intent.actor,labor_ref:task.intent.actor+':LABOR',device_ref:task.intent.actor+':COLLECTOR',window:structuredClone(task.intent.collection_window),scope_ref:structuredClone(task.intent.scope_ref),method_ref:structuredClone(task.intent.method_ref),authority_ref:structuredClone(task.intent.authority_ref),basis_refs:structuredClone(task.intent.basis_refs),status:'allocated',started_at:null,observed_at:null});
      const actor=state.actors[task.intent.actor];
      task.accepted_sent_at=Math.max(state.sim_time,actor.sender_free_at);
      task.accepted_stage=state.gates[task.intent.actor]==='unknown'?'waiting_gate':state.gates[task.intent.actor]==='not_met'?'refused_gate':task.planned_start_at>state.sim_time?'waiting_window':'collecting';
      const ackAt=task.accepted_sent_at+policy.sender_ms;
      actor.sender_free_at=ackAt;enqueue(state,task.ref.id,'accepted_receipt',ackAt);
      enqueue(state,task.ref.id,'start_collection',task.planned_start_at);
      enqueue(state,task.ref.id,'window_close',task.intent.collection_window.to);
    }else if(event.kind==='start_collection'){
      const actor=state.actors[task.intent.actor];
      if(actor.position[0]!==250||actor.position[1]!==150)throw new GameError('INVALID_REQUEST');
      if(state.gates[task.intent.actor]==='unknown')continue;
      if(state.gates[task.intent.actor]==='not_met'){stop_collection_work(state,task,'local_gate_not_met');continue;}
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
      state.observations.push({ref:collection_ref(state.run_id,'observation',task.ref.id+'.observation'),request_id:task.ref.id,observed_at:state.sim_time,actual_scope:[actual],sample:task.intent.actor==='R'?{kind:'limited_indication'}:{kind:'facility_condition',condition:state.facility.condition,object_version:state.facility.version}});
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
      if(!report||task.report_sent_at===null)throw new GameError('INVALID_REQUEST');
      state.deliveries.push({ref:collection_ref(state.run_id,'delivery',task.ref.id+'.delivery'),report_ref:report.ref,message_ref:collection_ref(state.run_id,'message',task.ref.id+'.terminal'),sender:task.intent.actor,recipient:'HQ',sent_at:task.report_sent_at,received_at:state.sim_time,knowledge_seq:++state.knowledge_seq});
      task.report_received_at=state.sim_time;
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
