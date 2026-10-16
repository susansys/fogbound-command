import {record,fields,valid_id} from './protocol';
import {dense_array,validate_public_map} from './spatial';
import {parse_mission_draft,mission_ref,valid_mission_expression} from './mission-protocol';
import type {MissionPlayerView,MissionRef} from './mission-contracts';
import {mission_goal_confirmed} from './mission-goal';
type Check=(x:unknown)=>boolean;
const integer:Check=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
const text:Check=x=>typeof x==='string'&&[...x].length<=2000;
const digest:Check=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const one=(...xs:unknown[]):Check=>x=>xs.includes(x);
const list=(check:Check,max=32):Check=>x=>dense_array(x)&&x.length<=max&&x.every(check);
function canonicalContent(value:unknown):unknown{return Array.isArray(value)?value.map(canonicalContent):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([key,entry])=>[key,canonicalContent(entry)])):value;}
const sameContent=(left:unknown,right:unknown)=>JSON.stringify(canonicalContent(left))===JSON.stringify(canonicalContent(right));
function shape(x:unknown,checks:Record<string,Check>):boolean{return record(x)&&fields(x,Object.keys(checks))&&Object.entries(checks).every(([key,check])=>check(x[key]));}
const time:Check=x=>shape(x,{kind:one('unknown')})||shape(x,{kind:one('known'),value:integer,evidence:valid_id});
const expiry:Check=v=>shape(v,{kind:one('timeless','unknown')})||shape(v,{kind:one('known'),value:integer});
const condition:Check=v=>shape(v,{condition:q=>record(q)&&q.kind==='compare'&&valid_mission_expression(q),result:one('T','F','U'),evidence_refs:list(valid_id),expires_at_time_ms:expiry});
const gate_for=(evaluator:'HQ'|'R'):Check=>v=>shape(v,{gate_id:valid_id,rule_version:valid_id,evaluated_by:one(evaluator),knowledge_revision:q=>integer(q)&&Number(q)>0,evaluated_at_time_ms:integer,result:one('T','F','U'),conditions:q=>dense_array(q)&&q.length>0&&q.length<=32&&q.every(condition),evidence_refs:list(valid_id),expires_at_time_ms:expiry});
const gate=gate_for('HQ');
export function mission_preview(x:unknown):boolean{
  if(!record(x)||!valid_id(x.run_id))return false;
  const run=x.run_id,bool:Check=v=>typeof v==='boolean';
  const authorization:Check=v=>{
    if(!shape(v,{status:one('met','denied'),session_role:one('staff'),grant_ref:q=>mission_ref(q,run,'authority'),dimensions:q=>shape(q,{mission:bool,actor:bool,action:bool,space:bool,time:bool,risk:bool}),code:one(null,'AUTHORITY_DENIED'),gap:text})||!record(v)||!record(v.dimensions))return false;
    const granted=Object.values(v.dimensions).every(value=>value===true);
    return granted?v.status==='met'&&v.code===null&&v.gap==='':v.status==='denied'&&v.code==='AUTHORITY_DENIED'&&typeof v.gap==='string'&&v.gap.trim().length>0;
  };
  return shape(x,{kind:one('mission_plan'),run_id:valid_id,revision:v=>integer(v)&&Number(v)>0,editing_seq:integer,draft_digest:digest,phases:list(p=>shape(p,{phase_id:valid_id,distance:v=>typeof v==='number'&&Number.isFinite(v)&&v>=0,estimated_move_ms:v=>v===null||integer(v),assumptions:list(text),gap:text,authorization,gate}),2)});
}
function linked_mission_view(view:MissionPlayerView):boolean{
  const same=(a:MissionRef<string>,b:MissionRef<string>)=>a.run_id===b.run_id&&a.kind===b.kind&&a.id===b.id&&a.version===b.version;
  const unique=(values:string[])=>new Set(values).size===values.length;
  if(!unique(view.issued_orders.map(o=>o.id))||!unique(view.reports.map(r=>r.id))||!unique(view.deliveries.map(d=>d.id))||!unique(view.deliveries.map(d=>d.report_ref))||!unique(view.held_windows.map(w=>w.order_ref))||!unique(view.phase_results.map(r=>r.order_ref))||view.resources.confirmed_at>view.sim_time)return false;
  if(view.mission&&!view.plans.some(p=>p.plan_id===view.mission!.current_plan_ref.id&&p.version===view.mission!.current_plan_ref.version))return false;
  if(!unique(view.plans.map(p=>JSON.stringify([p.plan_id,p.version]))))return false;
  for(const plan of view.plans){
    if(!unique(plan.draft.phases.map(p=>p.id))||!unique(plan.draft.routes.map(r=>r.id))||plan.draft.phases.some(p=>!plan.draft.routes.some(r=>r.id===p.activity.route_ref.id&&r.version===p.activity.route_ref.version)||p.dependencies.some(d=>!plan.draft.phases.some(q=>q.id===d.id&&q.version===d.version))))return false;
  }
  for(const order of view.issued_orders){
    const plan=view.plans.find(p=>p.plan_id===order.plan_ref.id&&p.version===order.plan_ref.version),phase=plan?.draft.phases.find(p=>p.id===order.phase_ref.id&&p.version===order.phase_ref.version),route=phase&&plan?.draft.routes.find(r=>r.id===phase.activity.route_ref.id&&r.version===phase.activity.route_ref.version);
    if(!plan||!phase||!route||!same(order.mission_ref,plan.draft.mission_ref)||!same(order.grant_ref,plan.draft.intent.delegation_ref)||order.intent_ref.id!==plan.draft.intent.id||order.intent_ref.version!==plan.draft.intent.version)return false;
    const held=view.held_windows.find(w=>w.order_ref===order.id);if(!held||held.from!==phase.earliest_start_time_ms||held.to!==phase.latest_finish_time_ms)return false;
    const received=view.deliveries.filter(d=>view.reports.some(r=>r.id===d.report_ref&&r.order_ref===order.id)).sort((a,b)=>a.received-b.received),last=view.reports.find(r=>r.id===received.at(-1)?.report_ref);
    if(order.status!==(last?.kind??'sent')||order.execution_ref!==(last?.execution_ref??null)||held.status!==(last?.kind==='accepted'?'committed':!last||last.kind==='gate_hold'?'held':'released'))return false;
  }
  if(view.held_windows.some(w=>!view.issued_orders.some(o=>o.id===w.order_ref)))return false;
  if(view.decision_records.length!==view.issued_orders.length||!unique(view.decision_records.map(r=>r.id))||!unique(view.decision_records.map(r=>r.order_ref)))return false;
  if(!unique(view.retrospective_explanations.map(e=>e.id)))return false;
  const explanation_versions=new Map<string,number>();
  for(const explanation of view.retrospective_explanations){
    const decision=view.decision_records.find(r=>r.id===explanation.decision_ref.id&&r.version===explanation.decision_ref.version);
    const expected=(explanation_versions.get(explanation.decision_ref.id)??0)+1;
    if(!decision||explanation.created_time_ms<decision.at||explanation.created_time_ms>view.sim_time||explanation.version!==expected)return false;
    explanation_versions.set(decision.id,expected);
  }
  for(const decision of view.decision_records){
    const order=view.issued_orders.find(o=>o.id===decision.order_ref),plan=view.plans.find(p=>p.plan_id===decision.plan_ref.id&&p.version===decision.plan_ref.version),phase=plan?.draft.phases.find(p=>p.id===decision.phase_ref.id&&p.version===decision.phase_ref.version),context=decision.known_then;
    if(!order||!plan||!phase||!same(decision.plan_ref,order.plan_ref)||!same(decision.phase_ref,order.phase_ref)||!same(decision.authority_ref,order.grant_ref)||decision.at!==order.issued||decision.at>view.sim_time||decision.knowledge_revision>=view.revision||!sameContent(context.plan,plan)||!same(context.mission.current_plan_ref,decision.plan_ref)||context.mission.status==='completed'||!view.mission||context.mission.object_revision>=view.mission.object_revision||!sameContent(decision.actual_intent,plan.draft.intent)||!sameContent(decision.selected_action,phase.activity)||context.resources.confirmed_at>decision.at)return false;
    const declared=order.reason?.trim()?order.reason:undefined;
    if(decision.reason_status!==(declared===undefined?'not_recorded':'recorded')||decision.declared_reason!==declared||declared===undefined&&Object.hasOwn(decision,'declared_reason'))return false;
    const candidates=context.position_knowledge.status==='conflicting'?context.position_knowledge.candidates:[context.position_knowledge];
    for(const p of candidates)if(p.observed.kind==='known'&&p.observed.value>decision.at||p.reported.kind==='known'&&p.reported.value>decision.at||p.source_event_time.kind==='known'&&p.source_event_time.value>decision.at||p.received!==null&&p.received>decision.at)return false;
    const proofs=context.selected_received_evidence;
    if(!unique(proofs.map(p=>p.delivery_ref))||proofs.length>decision.evidence_refs.length)return false;
    for(const proof of proofs){
      if(proof.reported_at>proof.received_at||proof.received_at>decision.at||!decision.evidence_refs.some(id=>id===proof.report_ref||id===proof.delivery_ref))return false;
      if(proof.kind==='mission_report'){
        const report=view.reports.find(r=>r.id===proof.report_ref),delivery=view.deliveries.find(d=>d.id===proof.delivery_ref);
        if(!report||!delivery||delivery.report_ref!==report.id||report.reported!==proof.reported_at||delivery.received!==proof.received_at)return false;
      }else{
        const {report,delivery}=proof.position_source;
        if(view.reports.some(r=>r.id===proof.report_ref)||report.id!==proof.report_ref||delivery.id!==proof.delivery_ref||delivery.report_ref!==report.id||report.run_id!==proof.run_id||delivery.run_id!==proof.run_id||report.reported_at!==proof.reported_at||report.delivery_at!==delivery.received||delivery.received!==proof.received_at||!view.geometry.scopes.some(s=>s.id===report.scope_ref)||report.observed.kind==='known'&&report.observed.value>report.reported_at||report.source_event_time.kind==='known'&&report.source_event_time.value>report.reported_at)return false;
      }
    }
    const prior=view.issued_orders.filter(o=>o.issued<decision.at),statusAt=(id:string)=>{
      const delivered=view.deliveries.filter(d=>d.received<=decision.at&&view.reports.some(r=>r.id===d.report_ref&&r.order_ref===id)).sort((a,b)=>a.received-b.received),report=view.reports.find(r=>r.id===delivered.at(-1)?.report_ref);return report?.kind??'sent';
    };
    if(!sameContent(context.prior_orders,prior.map(({id,phase_ref,plan_ref})=>({id,phase_ref,plan_ref,status:statusAt(id)})))||!sameContent(context.outbound_sent_times,prior.map(o=>o.sent)))return false;
    const held=prior.map(o=>{const phase=view.plans.find(p=>p.plan_id===o.plan_ref.id&&p.version===o.plan_ref.version)!.draft.phases.find(p=>p.id===o.phase_ref.id&&p.version===o.phase_ref.version)!,status=statusAt(o.id);return {order_ref:o.id,capability_ref:'R:move',concurrency_group:'R:execution',from:phase.earliest_start_time_ms,to:phase.latest_finish_time_ms,amount:1,status:status==='accepted'?'committed':status==='sent'||status==='gate_hold'?'held':'released'};});
    if(!sameContent(context.held_windows,held)||!sameContent(context.phase_results,view.phase_results.filter(r=>view.deliveries.some(d=>d.id===r.known_report_delivery_refs[1]&&d.received<=decision.at))))return false;
  }
  for(const report of view.reports){
    const order=view.issued_orders.find(o=>o.id===report.order_ref),delivery=view.deliveries.find(d=>d.report_ref===report.id);
    if(!order||!delivery||!same(report.phase_ref,order.phase_ref)||!same(report.plan_ref,order.plan_ref)||report.execution_ref!==order.execution_ref||report.reported>delivery.received||report.resources.confirmed_at>report.reported)return false;
    if(report.observed.kind==='known'&&report.observed.value>report.reported||report.source_event_time.kind==='known'&&report.source_event_time.value>report.reported||report.local_gate.evaluated_at_time_ms>report.reported)return false;
    if((report.kind==='refused')!==(report.refusal_reason!==null)||['accepted','arrived','blocked','cutoff'].includes(report.kind)&&report.local_gate.result!=='T'||['gate_hold','not_started'].includes(report.kind)&&report.local_gate.result==='T')return false;
    if(report.kind==='arrived'){
      const plan=view.plans.find(p=>p.plan_id===order.plan_ref.id&&p.version===order.plan_ref.version)!,phase=plan.draft.phases.find(p=>p.id===order.phase_ref.id&&p.version===order.phase_ref.version)!,route=plan.draft.routes.find(r=>r.id===phase.activity.route_ref.id&&r.version===phase.activity.route_ref.version)!;
      const scope=report.position_scope,end=route.path.at(-1)!;
      if(scope?.kind!=='point'||scope.uncertainty.kind!=='known'||scope.uncertainty.value!==0||scope.typed_geometry.position[0]!==end[0]||scope.typed_geometry.position[1]!==end[1])return false;
    }
  }
  if(view.deliveries.some(d=>!view.reports.some(r=>r.id===d.report_ref)))return false;
  for(const result of view.phase_results){
    const order=view.issued_orders.find(o=>o.id===result.order_ref),report=view.reports.find(r=>r.id===result.known_report_delivery_refs[0]),delivery=view.deliveries.find(d=>d.id===result.known_report_delivery_refs[1]);
    if(!order||!report||!delivery||report.kind!=='arrived'||report.order_ref!==order.id||delivery.report_ref!==report.id||!same(result.phase_ref,order.phase_ref)||!same(result.plan_ref,order.plan_ref)||report.observed.kind!=='known')return false;
    const plan=view.plans.find(p=>p.plan_id===order.plan_ref.id&&p.version===order.plan_ref.version)!,phase=plan.draft.phases.find(p=>p.id===order.phase_ref.id&&p.version===order.phase_ref.version)!,requirements=plan.draft.objective.verification_requirements;
    if(report.observed.value<phase.earliest_start_time_ms||report.observed.value>phase.latest_finish_time_ms||requirements.length!==1||requirements[0]!=='matching_arrival_report_and_delivery')return false;
  }
  const last=[...view.issued_orders].sort((a,b)=>b.issued-a.issued)[0],operative=last&&view.plans.find(p=>p.plan_id===last.plan_ref.id&&p.version===last.plan_ref.version);
  const goal=!!operative&&mission_goal_confirmed({draft:operative.draft,phase_results:view.phase_results,reports:view.reports,deliveries:view.deliveries,geometry:view.geometry,as_of_time_ms:view.sim_time});
  if((view.mission?.status==='completed')!==goal||(view.status==='completed')!==goal||goal&&view.can_issue)return false;
  return true;
}
export function mission_position_knowledge(value:unknown,geometry:unknown,at:number):boolean{
  if(!record(geometry)||!dense_array(geometry.scopes))return false;
  const scopes=geometry.scopes;
  const map:Check=v=>{try{validate_public_map(v);return true;}catch{return false;}};
  const scope:Check=v=>record(v)&&v.kind!=='unresolved'&&map({...geometry,scopes:[...scopes.filter(s=>!record(s)||s.id!==v.id),v]});
  const check:Check=v=>{
    const common={observed:time,reported:time,source_event_time:time,evidence_refs:list(valid_id)};
    const evidence={received:(r:unknown)=>r===null||integer(r)&&Number(r)<=at,provenance:(p:unknown)=>shape(p,{kind:one('registered_initial'),initial_evidence_ref:valid_id})||shape(p,{kind:one('delivered'),report_ref:valid_id,delivery_ref:valid_id})};
    const location:Check=q=>record(q)&&record(q.provenance)&&(q.received===null?q.provenance.kind==='registered_initial':q.provenance.kind==='delivered');
    const candidate:Check=q=>shape(q,{scope,...common,...evidence})&&location(q);
    return shape(v,{status:one('known_scope'),scope,...common,...evidence})&&location(v)
      ||shape(v,{status:one('unresolved'),...common,...evidence})&&location(v)
      ||shape(v,{status:one('conflicting'),observed:q=>record(q)&&q.kind==='known'&&time(q),candidates:q=>dense_array(q)&&q.length>=2&&q.length<=32&&q.every(candidate)});
  };
  return check(value);
}
export function mission_player_view(x:unknown):boolean{
  if(!record(x)||!valid_id(x.run_id))return false;
  const run=x.run_id;
  const map:Check=v=>{try{validate_public_map(v);return true;}catch{return false;}};
  const scope:Check=v=>record(x.geometry)&&dense_array(x.geometry.scopes)&&record(v)&&v.kind!=='unresolved'&&map({...x.geometry,scopes:[...x.geometry.scopes.filter(s=>!record(s)||s.id!==v.id),v]});
  const position:Check=v=>mission_position_knowledge(v,x.geometry,Number(x.sim_time));
  const saved:Check=v=>{
    if(!shape(v,{plan_id:valid_id,version:q=>integer(q)&&Number(q)>0,draft:q=>{try{parse_mission_draft(q,run);return true;}catch{return false;}},preview:mission_preview}))return false;
    return record(v)&&record(v.preview)&&v.preview.run_id===run;
  };
  const order:Check=v=>record(v)&&shape(v,{
    id:valid_id,origin:one('staff'),mission_ref:q=>mission_ref(q,run,'mission'),phase_ref:q=>mission_ref(q,run,'phase'),plan_ref:q=>mission_ref(q,run,'plan'),intent_ref:q=>mission_ref(q,run,'intent'),grant_ref:q=>mission_ref(q,run,'authority'),frozen_payload_digest:digest,message_ref:valid_id,execution_ref:q=>q===null||valid_id(q),supersedes_id:one(null),issued:integer,sent:integer,expiry_time_ms:integer,hq_gate:gate,status:one('sent','accepted','arrived','gate_hold','not_started','refused','cutoff','blocked'),...(Object.hasOwn(v,'reason')?{reason:text}:{})
  });
  const held:Check=v=>shape(v,{order_ref:valid_id,capability_ref:one('R:move'),concurrency_group:one('R:execution'),from:integer,to:integer,amount:one(1),status:one('held','committed','released')})&&record(v)&&Number(v.from)<Number(v.to);
  const report:Check=v=>shape(v,{id:valid_id,run_id:one(run),actor:one('R'),target:one('HQ'),kind:one('accepted','arrived','gate_hold','not_started','refused','cutoff','blocked'),order_ref:valid_id,phase_ref:q=>mission_ref(q,run,'phase'),plan_ref:q=>mission_ref(q,run,'plan'),execution_ref:q=>q===null||valid_id(q),observed:time,source_event_time:time,reported:integer,refusal_reason:one(null,'start_mismatch','window_closed','authority_denied','insufficient_movement_energy','capacity_conflict','start_unconfirmed'),position_scope:q=>q===null||scope(q),local_gate:gate_for('R'),resources:q=>shape(q,{movement_energy:integer,movement_energy_reserved:integer,equipment_energy:integer,equipment_wear:integer,confirmed_at:integer})})&&record(v)&&(['accepted','gate_hold'].includes(String(v.kind))?v.position_scope===null:record(v.position_scope)&&v.position_scope.kind==='point');
  const delivery:Check=v=>shape(v,{id:valid_id,report_ref:valid_id,received:q=>integer(q)&&Number(q)<=Number(x.sim_time)});
  const phase_result:Check=v=>shape(v,{order_ref:valid_id,phase_ref:q=>mission_ref(q,run,'phase'),plan_ref:q=>mission_ref(q,run,'plan'),known_report_delivery_refs:q=>dense_array(q)&&q.length===2&&q.every(valid_id),verification_state:one('confirmed')});
  const mission:Check=v=>v===null||shape(v,{id:one('M1'),object_revision:q=>integer(q)&&Number(q)>0,status:one('draft','active','completed'),current_plan_ref:q=>mission_ref(q,run,'plan'),support_refs:list(()=>false,0)});
  const resources:Check=v=>shape(v,{movement_energy:integer,movement_energy_reserved:integer,equipment_energy:integer,equipment_wear:integer,hq_energy:integer,hq_wear:integer,confirmed_at:integer});
  const prior_order:Check=v=>shape(v,{id:valid_id,phase_ref:q=>mission_ref(q,run,'phase'),plan_ref:q=>mission_ref(q,run,'plan'),status:one('sent','accepted','arrived','gate_hold','not_started','refused','cutoff','blocked')});
  const selected_receipt:Check=v=>record(v)&&shape(v,{kind:one('mission_report','position_report'),run_id:one(run),report_ref:valid_id,delivery_ref:valid_id,origin:one('R'),target:one('HQ'),reported_at:integer,received_at:integer,...(v.kind==='position_report'?{position_source:q=>shape(q,{report:r=>shape(r,{id:valid_id,run_id:one(run),origin:one('R'),target:one('HQ'),scope_ref:valid_id,observed:time,source_event_time:time,reported_at:integer,delivery_at:integer}),delivery:r=>shape(r,{id:valid_id,run_id:one(run),report_ref:valid_id,received:integer})})}:{})});
  const decision:Check=v=>record(v)&&shape(v,{id:valid_id,run_id:one(run),version:one(1),actor:one('staff'),operation:one('issue_mission'),knowledge_revision:q=>integer(q)&&Number(q)>0,view_digest:digest,at:integer,actual_intent:record,selected_action:q=>shape(q,{kind:one('move'),actor:one('R'),route_ref:r=>mission_ref(r,run,'route')}),plan_ref:q=>mission_ref(q,run,'plan'),phase_ref:q=>mission_ref(q,run,'phase'),authority_ref:q=>mission_ref(q,run,'authority'),order_ref:valid_id,evidence_refs:list(valid_id),reason_status:one('recorded','not_recorded'),...(Object.hasOwn(v,'declared_reason')?{declared_reason:text}:{}),known_then:q=>shape(q,{mission:r=>r!==null&&mission(r),plan:saved,position_knowledge:position,resources,phase_results:list(phase_result,2),prior_orders:list(prior_order,16),held_windows:list(held,16),outbound_sent_times:list(integer,16),selected_received_evidence:list(selected_receipt)})});
  const explanation:Check=v=>shape(v,{id:valid_id,run_id:one(run),version:q=>integer(q)&&Number(q)>0,decision_ref:q=>mission_ref(q,run,'decision'),text:q=>text(q)&&typeof q==='string'&&q.trim().length>0,created_time_ms:integer,author:one('staff'),layer:one('retrospective_inference')});
  return shape(x,{scenario_kind:one('play_mission'),run_id:valid_id,revision:v=>integer(v)&&Number(v)>0,sim_time:v=>integer(v)&&Number(v)<=910000,mode:one('command','research'),rate:one(1,2,4),paused:v=>typeof v==='boolean',finished:one(false),source_run:v=>v===null||valid_id(v),status:one('draft','ready','preparing','denied','active','completed'),geometry:map,position_knowledge:position,authority:v=>shape(v,{from:integer,to:integer}),resources,mission,plans:list(saved,32),issued_orders:list(order,16),held_windows:list(held,16),reports:list(report,32),deliveries:list(delivery,32),phase_results:list(phase_result,2),decision_records:list(decision,16),retrospective_explanations:q=>dense_array(q)&&q.every(explanation),can_issue:q=>typeof q==='boolean',next_action:text,gap:text,replay_nodes:list(v=>shape(v,{revision:q=>integer(q)&&Number(q)>0,at:integer,meaningful:q=>typeof q==='boolean',label:text}),10000),log:list(v=>shape(v,{id:valid_id,at:integer,kind:one('initial_evidence'),text,evidence:valid_id}),10000)})&&linked_mission_view(x as unknown as MissionPlayerView);
}
