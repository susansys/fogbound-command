import {useEffect,useRef,useState} from 'react';
import type {Envelope,Intent} from './contracts';
import type {MissionDraft,MissionPlayerView,MissionPreview,SavePlanEnvelope,IssueMissionEnvelope,ConditionExpr,MissionOrder,MissionReport} from './mission-contracts';
import type {GamePlayerView} from './play-contracts';
import type {Transport,Response} from './transport';
import type {RegionalDisplaySession} from './regional-display';
import {MapView} from './map';
import {clock,error_copy} from './player-copy';
import {parse_mission_draft} from './mission-protocol';
import {GameError} from './contracts';

function initial_draft(view:MissionPlayerView):MissionDraft{
  if(view.plans.length)return structuredClone(view.plans.at(-1)!.draft);
  const run_id=view.run_id,ref=<K extends string>(kind:K,id:string)=>({run_id,kind,id,version:1});
  const ready:ConditionExpr={kind:'compare',field_ref:'capability.ready',operator:'eq',typed_value:true};
  return {run_id,plan_id:'plan-M1',mission_ref:ref('mission','M1'),intent:{id:'intent-M1',version:1,purpose:'',desired_end_state:'',key_tasks:['沿登记走廊移动'],priorities:['先A后B'],constraint_refs:['registered-corridors'],acceptable_risk:'registered_low',delegation_ref:ref('authority','B22-STATIC-GRANT')},objective:{id:'objective-M1',purpose:'抵达目标点并等待合法确认',success_expr:{kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:'B'},failure_expr:{kind:'not',child:ready},deadline_time_ms:900000,verification_requirements:['matching_arrival_report_and_delivery'],priority:1,dependencies:[]},phases:[{id:'P1',version:1,kind:'move',dependencies:[],entry_gate:ready,exit_gate:{kind:'compare',field_ref:'phase.confirmed',operator:'eq',typed_value:true},earliest_start_time_ms:1000,latest_finish_time_ms:31000,activity:{kind:'move',actor:'R',route_ref:ref('route','route-P1')}},{id:'P2',version:1,kind:'move',dependencies:[ref('phase','P1')],entry_gate:ready,exit_gate:{kind:'compare',field_ref:'phase.confirmed',operator:'eq',typed_value:true},earliest_start_time_ms:33000,latest_finish_time_ms:64000,activity:{kind:'move',actor:'R',route_ref:ref('route','route-P2')}}],routes:[{id:'route-P1',version:1,path:[[50,150],[150,150]]},{id:'route-P2',version:1,path:[[150,150],[250,150]]}],actor_assignments:['R'],support_windows:[],assumptions:[],evidence_refs:view.position_knowledge.status==='conflicting'?[]:[...view.position_knowledge.evidence_refs],decision_points:[],note:''};
}
function canonical(value:unknown):unknown{return Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)])):value;}
async function digest(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');}
type Pending={kind:'save_plan';envelope:SavePlanEnvelope;seq:number;digest:string}|{kind:'operate_mission';envelope:Envelope}|{kind:'issue_mission';envelope:IssueMissionEnvelope};
type IssueReview={preview:MissionPreview;phase_id:string;seq:number};
type Recovery={run_id:string;operation_id:string;original:Pending|null};
function order_status(order:MissionOrder){
  const labels:Record<MissionOrder['status'],string>={sent:'已登记并发送；等待接令回报，结果尚未确认',accepted:'接令已知；等待完成回报，结果尚未确认',arrived:'抵达回报已收；核对合法阶段凭证',gate_hold:'现场曾回报条件未满足；本次不会自动恢复，等待终止回报',not_started:'未开始终止回报已收；可准备新版本重试',refused:'拒绝回报已收；可准备新版本重试',blocked:'受阻终止回报已收；本次移动已终止',cutoff:'截止终止回报已收；本次移动已终止'};
  return labels[order.status];
}
function ReceivedReports({view}:{view:MissionPlayerView}){
  const labels:Record<MissionReport['kind'],string>={accepted:'接令回报',arrived:'抵达回报',gate_hold:'条件等待回报',not_started:'未开始终止回报',refused:'拒绝回报',cutoff:'截止终止回报',blocked:'受阻终止回报'};
  const reasons:Record<NonNullable<MissionReport['refusal_reason']>,string>={start_mismatch:'起点与命令不符',start_unconfirmed:'缺少当前唯一精确起点凭证',window_closed:'时间窗不足',authority_denied:'现场授权不满足',insufficient_movement_energy:'现场移动库存不足',capacity_conflict:'现场同能力占用冲突'};
  const time=(value:MissionReport['observed'])=>value.kind==='known'?clock(value.value):'未知';
  return <section data-testid="mission-reports" aria-label="总部已收任务回报"><h2>总部已收任务回报</h2><p>只列实际送达的回报；原件、发送与总部收到分开记录。回报反映当时情况，不表示当前现场状态。</p>{view.reports.length===0&&<p>尚无合法收到的任务回报。</p>}{view.reports.map(report=>{
    const delivery=view.deliveries.find(d=>d.report_ref===report.id);if(!delivery)return null;
    return <article data-testid="mission-report" key={report.id}><h3>{report.phase_ref.id} · 版本 {report.phase_ref.version} · {labels[report.kind]}</h3><p>来源 R → 总部 · 计划版本 {report.plan_ref.version}</p><p>观察时刻：{time(report.observed)} · 源事件时间：{time(report.source_event_time)}</p><p>发送时刻：{clock(report.reported)} · 总部收到：{clock(delivery.received)}</p>{report.refusal_reason&&<p>{reasons[report.refusal_reason]}</p>}{report.kind==='gate_hold'&&<p>现场当时门槛{report.local_gate.result==='F'?'不满足':'未知'}；本次不会自动恢复，须等待合法终止回报。</p>}<details><summary>查看回报凭证与当时资源</summary><p>现场核对：{clock(report.local_gate.evaluated_at_time_ms)} · {report.local_gate.result==='T'?'满足':report.local_gate.result==='F'?'不满足':'未知'}</p><p>资源样本时刻：{clock(report.resources.confirmed_at)} · 移动能量 {report.resources.movement_energy} · 预约 {report.resources.movement_energy_reserved} · 联络能量 {report.resources.equipment_energy} · 设备耐久 {report.resources.equipment_wear}</p><p>回报 {report.id} · 递交 {delivery.id}</p></details></article>;
  })}</section>;
}
function GateSummary({phase,at}:{phase:MissionPreview['phases'][number];at:number}){
  const gate=phase.gate,expiry=gate.expires_at_time_ms,expired=expiry.kind==='known'&&at>=expiry.value;
  const result=expired?'U':gate.result,labels={T:'满足',F:'不满足',U:'未知，需核对依据'};
  const proofs:Record<string,string>={'B22-INITIAL-CAPABILITY':'能力登记凭证','B22-INITIAL-POSITION':'初始位置凭证','B22-STATIC-GRANT':'既有参谋预授权'};
  const timing=expired?'上次核对依据已过期':expiry.kind==='known'?`依据有效至 ${clock(expiry.value)}`:expiry.kind==='unknown'?'到期时刻未知':'不设自动到期';
  return <><p>{phase.phase_id} · 总部进入门槛：{labels[result]} · 核对 {clock(gate.evaluated_at_time_ms)}</p><p>依据：{gate.evidence_refs.length?gate.evidence_refs.map(id=>proofs[id]??`凭证 ${id}`).join('、'):'尚缺可用凭证'}。{timing}；下达时仍会重核。</p></>;
}
type Props={view:MissionPlayerView;transport:Transport;adopt:(view:GamePlayerView)=>void;history:boolean;onHistory:(value:boolean)=>void;onLeave:()=>Promise<void>;displaySession?:RegionalDisplaySession;channelError:string;storageFault:boolean;onStorageRecovered:()=>void};
export function MissionWorkbench({view,transport,adopt,history,onHistory,onLeave,displaySession,channelError,storageFault,onStorageRecovered}:Props){
  const [editingDraft,setDraft]=useState(()=>initial_draft(view));
  const [editingRoutes,setRouteTexts]=useState(()=>Object.fromEntries(initial_draft(view).routes.map(r=>[r.id,r.path.map(p=>p.map(String))])));
  const [selected,setSelected]=useState('R'),[routeIndex,setRouteIndex]=useState(0),[workspace,setWorkspace]=useState('tasks');
  const [editingPreview,setPreview]=useState<MissionPreview|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState({code:'',field_path:undefined as string|undefined}),[notice,setNotice]=useState('');
  const error=failure.code;
  function setError(code:string,field_path?:string){setFailure({code,field_path});}
  const [dirty,setDirty]=useState(false),[uncertain,setUncertain]=useState(false),[advance,setAdvance]=useState('1'),[historyNode,setHistoryNode]=useState('1');
  const [noReceipt,setNoReceipt]=useState(false),[recoveryUnknown,setRecoveryUnknown]=useState(false);
  const [issueReview,setIssueReview]=useState<IssueReview|null>(null),[reason,setReason]=useState('');
  const issueInFlight=useRef(false);
  const sequence=useRef(0),current=useRef(view),historyRef=useRef(history),pending=useRef<Pending|null>(null);
  const recoveryPending=useRef<Recovery|null>(null);
  const saveInFlight=useRef(false),controlInFlight=useRef(false);
  current.current=view;historyRef.current=history;
  const draft=history?initial_draft(view):editingDraft;
  const routeTexts=history?Object.fromEntries(draft.routes.map(r=>[r.id,r.path.map(p=>p.map(String))])):editingRoutes;
  const preview=history?view.plans.at(-1)?.preview??null:editingPreview;
  const activeRoute=draft.routes[routeIndex]??draft.routes[0];
  function changed(){sequence.current++;setDirty(true);setPreview(null);setIssueReview(null);setError('');}
  function update(change:(value:MissionDraft)=>void){const next=structuredClone(draft);change(next);setDraft(next);changed();}
  function form():MissionDraft{
    const value=structuredClone(draft);
    for(const route of value.routes)route.path=(routeTexts[route.id]??[]).map(p=>{
      if(p.length!==2||p.some(s=>!s.trim()||!Number.isFinite(Number(s))))throw Error('INVALID_REQUEST');
      return [Number(p[0]),Number(p[1])];
    });
    return parse_mission_draft(value,current.current.run_id);
  }
  function adoptCurrent(next:GamePlayerView){if(next.scenario_kind==='play_mission'&&next.run_id===current.current.run_id&&next.revision>=current.current.revision){current.current=next;adopt(next);}}
  async function readCurrent(){const result=await transport.request({kind:'view',run_id:current.current.run_id});if(!result.ok)throw Error(result.code);if(!result.view)throw Error('CHANNEL_UNCERTAIN');adoptCurrent(result.view);return result.view;}
  async function handle(result:Response,original:Pending){
    if(!result.ok){setError(result.code,result.field_path);if(['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED'].includes(result.code)){setUncertain(true);return;}
      pending.current=null;setUncertain(false);setNoReceipt(false);if(['STALE_REVISION','OBJECT_VERSION_CONFLICT'].includes(result.code)){setPreview(null);if(result.mission_view&&result.mission_view.run_id===original.envelope.run_id)adoptCurrent(result.mission_view);else await readCurrent();setNotice('情况已更新；输入保留，请重新预览后保存。');}return;
    }
    if(!result.receipt||!result.view||result.receipt.operation_id!==original.envelope.operation_id||result.view.run_id!==original.envelope.run_id){setUncertain(true);setError('CHANNEL_UNCERTAIN');return;}
    adoptCurrent(result.view);pending.current=null;setUncertain(false);setNoReceipt(false);setError('');
    if(original.kind==='save_plan'){
      const matched=sequence.current===original.seq?await digest(form()):null;
      if(sequence.current===original.seq&&matched===original.digest){setDirty(false);setNotice('任务草案已保存；尚未下达，不会执行或占用资源。');}
      else setNotice('原编辑已保存；当前输入仍有未保存改动。');
    }else if(original.kind==='issue_mission'){setIssueReview(null);setNotice('当前阶段已下达并发送；等待接令回报，结果尚未确认。');}
    else setNotice(original.envelope.intent.kind==='save'?'当前行动已保存；任务编辑仍须单独保存草案。':result.view.paused?'暂停已确认，请明确继续。':'控制操作已确认。');
  }
  async function send(original:Pending){if(historyRef.current)return;setBusy(true);setError('');try{const result=await transport.request(original.kind==='save_plan'?{kind:'save_plan',envelope:original.envelope}:original.kind==='issue_mission'?{kind:'issue_mission',envelope:original.envelope}:{kind:'operate_mission',envelope:original.envelope});await handle(result,original);return result;}catch{setUncertain(true);setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}}
  async function checkIssue(confirm=false){
    if(historyRef.current||busy||dirty||storageFault||pending.current||recoveryPending.current||issueInFlight.current)return;
    const reviewed=issueReview,seq=sequence.current;issueInFlight.current=true;setBusy(true);setError('');
    try{
      const latest=await readCurrent();if(latest.scenario_kind!=='play_mission'||!latest.mission)return;
      const plan=latest.plans.find(p=>p.plan_id===latest.mission!.current_plan_ref.id&&p.version===latest.mission!.current_plan_ref.version);
      if(!plan||await digest(form())!==await digest(plan.draft)){setIssueReview(null);setNotice('请先保存当前编辑，再核对下达。');return;}
      const phase=plan.draft.phases.find(p=>!latest.issued_orders.some(o=>o.phase_ref.id===p.id&&o.phase_ref.version===p.version));
      if(!phase){setIssueReview(null);setNotice('已保存阶段均已有指令，请查看回报。');return;}
      const response=await transport.request({kind:'preview_mission',run_id:latest.run_id,revision:latest.revision,editing_seq:seq,draft:plan.draft});
      if(!response.ok){setError(response.code,response.field_path);setIssueReview(null);return;}
      const checked=response.mission_preview;
      if(!checked||checked.run_id!==latest.run_id||checked.revision!==latest.revision||checked.editing_seq!==seq||checked.draft_digest!==await digest(plan.draft)){setError('CHANNEL_UNCERTAIN');return;}
      if(historyRef.current||seq!==sequence.current)return;
      setIssueReview({preview:checked,phase_id:phase.id,seq});
      if(!confirm)return;
      if(!reviewed||reviewed.phase_id!==phase.id||reviewed.seq!==seq||reviewed.preview.draft_digest!==checked.draft_digest){setNotice('下达内容已更新，请再次核对后明确确认。');return;}
      const input:IssueMissionEnvelope={run_id:latest.run_id,operation_id:crypto.randomUUID(),expected_revision:latest.revision,intent:{kind:'issue_mission',expected_object_revision:latest.mission.object_revision,plan_ref:structuredClone(latest.mission.current_plan_ref),phase_ref:{run_id:latest.run_id,kind:'phase',id:phase.id,version:phase.version},grant_ref:structuredClone(plan.draft.intent.delegation_ref),preview:checked,evidence_refs:[...plan.draft.evidence_refs],...(reason.trim()?{reason}: {})}};
      const original:Pending={kind:'issue_mission',envelope:input};pending.current=original;await send(original);
    }catch{setError('CHANNEL_UNCERTAIN');}finally{issueInFlight.current=false;setBusy(false);}
  }
  async function previewDraft(){
    if(history||busy||storageFault||recoveryPending.current)return;setBusy(true);setError('');const seq=sequence.current,revision=current.current.revision,run=current.current.run_id;
    try{const value=form(),expected=await digest(value),result=await transport.request({kind:'preview_mission',run_id:run,revision,editing_seq:seq,draft:value});
      if(!result.ok){setError(result.code,result.field_path);if(result.code==='STALE_REVISION')await readCurrent();return;}
      const next=result.mission_preview;
      if(next&&current.current.run_id===run&&sequence.current===seq&&current.current.revision===revision&&next.run_id===run&&next.revision===revision&&next.editing_seq===seq&&next.draft_digest===expected)setPreview(next);
    }catch(e){setError(e instanceof GameError?e.code:e instanceof Error&&e.message==='INVALID_REQUEST'?'INVALID_REQUEST':'CHANNEL_UNCERTAIN',e instanceof GameError?e.field_path:undefined);}finally{setBusy(false);}
  }
  async function saveDraft(){
    if(history||busy||storageFault||pending.current||recoveryPending.current||saveInFlight.current)return;saveInFlight.current=true;setBusy(true);
    try{
      const value=form(),expected=await digest(value),seq=sequence.current;
      if(!editingPreview||editingPreview.editing_seq!==seq||editingPreview.draft_digest!==expected){setPreview(null);setNotice('请先按当前情况预览任务，再保存草案。');return;}
      for(let attempt=0;attempt<3;attempt++){
        if(historyRef.current||sequence.current!==seq)return;
        const v=current.current,fresh=await transport.request({kind:'preview_mission',run_id:v.run_id,revision:v.revision,editing_seq:seq,draft:value});
        if(!fresh.ok){if(fresh.code==='STALE_REVISION'){await readCurrent();continue;}setError(fresh.code,fresh.field_path);return;}
        const checked=fresh.mission_preview;
        if(!checked||checked.run_id!==v.run_id||checked.revision!==v.revision||checked.editing_seq!==seq||checked.draft_digest!==expected){setError('CHANNEL_UNCERTAIN');return;}
        if(historyRef.current||sequence.current!==seq)return;setPreview(checked);
        const envelope:SavePlanEnvelope={run_id:v.run_id,operation_id:crypto.randomUUID(),expected_revision:v.revision,intent:{kind:'save_plan',base_plan_ref:v.mission?.current_plan_ref??null,expected_object_revision:v.mission?.object_revision??0,draft:value}};
        const original:Pending={kind:'save_plan',envelope,seq,digest:expected};pending.current=original;
        const result=await send(original);
        if(!result||result.ok||result.code!=='STALE_REVISION'||pending.current)return;
        // Only this definitive rejected write permits a fresh operation identity.
      }
      setNotice('情况持续更新；输入仍保留，请重新核对任务后再保存。');
    }catch(e){setError('INVALID_REQUEST',e instanceof GameError?e.field_path:undefined);}finally{saveInFlight.current=false;setBusy(false);}
  }
  async function control(intent:Intent){
    if(historyRef.current||busy||storageFault||pending.current||recoveryPending.current||controlInFlight.current)return;
    controlInFlight.current=true;
    try{
      for(let attempt=0;attempt<3;attempt++){
        if(historyRef.current)return;
        const original:Pending={kind:'operate_mission',envelope:{run_id:current.current.run_id,operation_id:crypto.randomUUID(),expected_revision:current.current.revision,intent}};
        pending.current=original;
        const result=await send(original);
        // handle() refreshes the public view after a definite stale rejection.
        // Unknown outcomes keep pending.current and must keep the original id.
        if(!result||result.ok||result.code!=='STALE_REVISION'||pending.current)return;
      }
      setNotice('情况持续更新；操作未确认，请核对后重试。');
    }finally{controlInFlight.current=false;}
  }
  async function query(){const original=pending.current;if(!original||busy||recoveryPending.current)return;setBusy(true);try{const r=await transport.request({kind:'receipt',run_id:original.envelope.run_id,operation_id:original.envelope.operation_id});if(!r.ok){setError(r.code);return;}if(!r.receipt){setNoReceipt(true);setNotice('尚未查到已提交结果；原操作身份与输入均已保留。');return;}await handle({request_id:r.request_id,ok:true,receipt:r.receipt,view:await readCurrent()},original);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}}
  async function finishRecovery(restored:Response,attempt:Recovery){
    if(!restored.ok){setError(restored.code);return;}
    if(!restored.view||restored.view.scenario_kind!=='play_mission'||restored.view.run_id!==attempt.run_id||!restored.view.paused||restored.receipt?.kind!=='restore'||restored.receipt.operation_id!==attempt.operation_id){setError('CHANNEL_UNCERTAIN');return;}
    adoptCurrent(restored.view);recoveryPending.current=null;setRecoveryUnknown(false);setNoReceipt(false);setPreview(null);onStorageRecovered();
    // A confirmed restore does not resolve the older uncertain save/control.
    // Reuse that older identity until its actual receipt or rejection is known.
    if(attempt.original)await send(attempt.original);
    else{setError('');setNotice('最近已提交记录已恢复；输入保留，当前已暂停，请核对后明确继续。');}
  }
  async function recover(){
    if(busy||historyRef.current)return;
    let attempt=recoveryPending.current;
    if(!attempt){
      const original=pending.current;if(original&&!noReceipt||!original&&!storageFault)return;
      attempt={run_id:original?.envelope.run_id??current.current.run_id,operation_id:crypto.randomUUID(),original};
      recoveryPending.current=attempt;
    }
    setBusy(true);setRecoveryUnknown(true);
    try{
      await finishRecovery(await transport.request({kind:'takeover',run_id:attempt.run_id,operation_id:attempt.operation_id}),attempt);
    }catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function queryRecovery(){
    const attempt=recoveryPending.current;if(!attempt||busy||historyRef.current)return;setBusy(true);
    try{
      const result=await transport.request({kind:'receipt',run_id:attempt.run_id,operation_id:attempt.operation_id});
      if(!result.ok){setError(result.code);return;}
      if(!result.receipt){setNotice('尚未查到恢复回执；原恢复编号已保留，可重试原恢复操作。');return;}
      await finishRecovery({request_id:result.request_id,ok:true,receipt:result.receipt,view:await readCurrent()},attempt);
    }catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  useEffect(()=>{
    const pause=()=>{if(current.current.mode!=='command'||current.current.paused)return;void transport.request({kind:'management_pause',reason:document.hidden?'application_hidden':'focus_lost'}).then(r=>{if(r.ok&&r.view){if(!historyRef.current)adoptCurrent(r.view);}else if(!r.ok)setError(r.code);}).catch(()=>setError('CHANNEL_UNCERTAIN'));};
    const hidden=()=>{if(document.hidden)pause();};window.addEventListener('blur',pause);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('blur',pause);document.removeEventListener('visibilitychange',hidden);};
  },[transport]);
  function chooseGoal(target:'A'|'B'){const base=initial_draft({...view,plans:[]});if(target==='A'){base.phases=base.phases.slice(0,1);base.routes=base.routes.slice(0,1);}update(x=>{x.objective.success_expr={kind:'compare',field_ref:'position.scope',operator:'eq',typed_value:target};x.phases=base.phases;x.routes=base.routes;});setRouteTexts(Object.fromEntries(base.routes.map(r=>[r.id,r.path.map(p=>p.map(String))])));setRouteIndex(0);}
  async function review(){setBusy(true);try{const r=await transport.request({kind:'replay',run_id:view.run_id,to:0,node_revision:Number(historyNode)});if(r.ok&&r.view){onHistory(true);adopt(r.view);}else if(!r.ok)setError(r.code);}finally{setBusy(false);}}
  async function returnCurrent(){const r=await transport.request({kind:'current',run_id:view.run_id});if(r.ok&&r.view){onHistory(false);adopt(r.view);}else if(!r.ok)setError(r.code);}
  const blocked=history||busy||uncertain||storageFault||recoveryUnknown;
  const phaseHasOpenOrder=(id:string)=>current.current.issued_orders.some(order=>order.phase_ref.id===id&&['sent','accepted','gate_hold'].includes(order.status));
  const retryOrder=!dirty?[...view.issued_orders].reverse().find(order=>!phaseHasOpenOrder(order.phase_ref.id)&&['refused','not_started'].includes(order.status)&&draft.phases.some(phase=>phase.id===order.phase_ref.id&&phase.version===order.phase_ref.version)):undefined;
  function prepareRetry(order:MissionOrder){
    if(blocked||dirty||phaseHasOpenOrder(order.phase_ref.id))return;
    const currentOrder=current.current.issued_orders.find(value=>value.id===order.id);
    if(!currentOrder||!['refused','not_started'].includes(currentOrder.status))return;
    try{
      const next=form(),phase=next.phases.find(value=>value.id===order.phase_ref.id&&value.version===order.phase_ref.version);
      if(!phase)return;
      const route=next.routes.find(value=>value.id===phase.activity.route_ref.id&&value.version===phase.activity.route_ref.version);if(!route)return;
      const latestPhase=(id:string)=>Math.max(...current.current.plans.flatMap(plan=>plan.draft.phases.filter(p=>p.id===id).map(p=>p.version)));
      phase.version=latestPhase(phase.id)+1;route.version=Math.max(...current.current.plans.flatMap(plan=>plan.draft.routes.filter(r=>r.id===route.id).map(r=>r.version)))+1;phase.activity.route_ref.version=route.version;
      for(const dependent of next.phases.filter(value=>value.dependencies.some(ref=>ref.id===phase.id))){
        if(current.current.issued_orders.some(value=>value.phase_ref.id===dependent.id)){setError('STATE_CONFIRMATION_REQUIRED');return;}
        dependent.version=latestPhase(dependent.id)+1;dependent.dependencies=dependent.dependencies.map(ref=>ref.id===phase.id?{...ref,version:phase.version}:ref);
      }
      next.evidence_refs=current.current.position_knowledge.status==='conflicting'?[]:[...current.current.position_knowledge.evidence_refs];
      setDraft(next);setRouteTexts(Object.fromEntries(next.routes.map(value=>[value.id,value.path.map(point=>point.map(String))])));changed();setReason('');setNotice(`${phase.id} 新版本重试草案已准备；请调整时间窗，重新预览、保存并明确下达。旧指令与回报保留。`);
    }catch{setError('INVALID_REQUEST');}
  }
  return <div className="app crisis-app mission-app">
    <header className="topbar"><span className="brand"><span className="brand-mark">玄</span><strong>玄枢行动</strong><span className="brand-sub">联合任务指挥部</span></span><span className="demo-badge">任务规划</span><div className="clock"><strong>{clock(view.sim_time)}</strong><span>{storageFault?'进度未确认':history?'历史只读':view.paused?'已暂停':'指挥进行中'}</span></div><button disabled={blocked||view.mode!=='command'} onClick={()=>void control(view.paused?{kind:'continue'}:{kind:'pause',reason:'manual'})}>{view.paused?'继续行动':'暂停行动'}</button><button disabled={blocked} onClick={()=>void control({kind:'save'})}>保存行动</button></header>
    {(error||channelError)&&<div role="alert" className="fault">{error_copy(error||channelError,error?failure.field_path:undefined)}</div>}
    {storageFault&&!pending.current&&!recoveryUnknown&&<div className="fault"><span>推进尚未得到可靠提交确认。当前输入保留，恢复后保持暂停。</span><button disabled={busy||history} onClick={()=>void recover()}>恢复最近记录并重新核对</button></div>}
    {recoveryUnknown&&<div className="fault"><span>恢复结果待查核，恢复编号、原操作与输入已保留。</span><button disabled={busy||history} onClick={()=>void queryRecovery()}>查询恢复结果</button><button disabled={busy||history} onClick={()=>void recover()}>重试原恢复操作</button></div>}
    {uncertain&&!recoveryUnknown&&<div className="fault"><span>{pending.current?.kind==='issue_mission'?'下达结果待查核，输入与原操作已保留。':'保存状态待查核，输入与原操作已保留。'}</span><button disabled={busy} onClick={()=>void query()}>{pending.current?.kind==='issue_mission'?'查询下达结果':'查询保存结果'}</button><button disabled={busy} onClick={()=>pending.current&&void send(pending.current)}>重试原操作</button>{noReceipt&&<button disabled={busy} onClick={()=>void recover()}>恢复最近记录并重新核对</button>}</div>}
    <div className="contextbar"><strong>R · H—A—B 公开走廊</strong><span>仅移动；支援未安排。总部以合法收到的回报确认结果。</span></div>
    <div className="shell"><nav className="rail">{[['map','态势地图'],['report','情报报告'],['tasks','任务规划'],['log','指挥记录'],['review','行动复盘']].map(([id,label])=><button key={id} className={workspace===id?'active':''} onClick={()=>setWorkspace(id)}>{label}</button>)}<button disabled={busy||uncertain} onClick={()=>void (async()=>{if(!current.current.paused){await control({kind:'pause',reason:'manual'});if(!current.current.paused)return;}await onLeave();})()}>更换演练任务</button></nav>
    <main className="main"><div className="workspacebar"><h1>结构化任务</h1><span className="outline-tag">总部视图 · 未安排支援</span></div><p className="operation-status" data-testid="mission-save-state">{view.mission?`已保存版本 ${view.mission.current_plan_ref.version} · ${view.issued_orders.length?'已下达冻结版本 '+view.issued_orders.at(-1)!.plan_ref.version:'未下达'}${dirty?' · 有未保存编辑':''}`:'尚未保存 · 未下达'}</p><p data-testid="mission-readiness">{view.can_issue?'可直接下达':view.status==='preparing'?'需核实条件':view.status==='denied'?'当前条件不允许':view.status==='completed'?'目标已确认':'当前阶段'} · {view.gap}</p>{notice&&<p role="status" className="operation-status">{notice}</p>}
      <section data-testid="mission-phase-results" aria-label="合法阶段凭证">{view.phase_results.length?view.phase_results.map(result=><p key={result.order_ref}>{result.phase_ref.id} · 版本 {result.phase_ref.version} · 合法抵达已确认 · 计划版本 {result.plan_ref.version}</p>):<p>尚无合法抵达确认；须等待总部收到匹配回报。</p>}</section><div className="workbody mission-body">
        {(workspace==='tasks'||workspace==='map')&&<MapView view={view} selected={selected} onSelect={setSelected} planned={false} displaySession={history?undefined:displaySession} routeDraft={(routeTexts[activeRoute.id]??[]).filter(p=>p.length===2&&p.every(v=>v.trim()&&Number.isFinite(Number(v)))).map(p=>[Number(p[0]),Number(p[1])])} onRoutePoint={history?undefined:p=>{setRouteTexts(old=>({...old,[activeRoute.id]:[...(old[activeRoute.id]??[]),p.map(String)]}));changed();}}/>}
        {workspace==='tasks'?<section className="mission-editor" aria-label="任务草案"><div className="mission-fields"><label>任务目的<input aria-label="任务目的" value={draft.intent.purpose} readOnly={history} onChange={e=>update(x=>{x.intent.purpose=e.target.value;})}/></label><label>期望结果<input aria-label="期望结果" value={draft.intent.desired_end_state} readOnly={history} onChange={e=>update(x=>{x.intent.desired_end_state=e.target.value;})}/></label><label>窄目标<select aria-label="窄目标" disabled={history} value={draft.objective.success_expr.kind==='compare'?String(draft.objective.success_expr.typed_value):'B'} onChange={e=>chooseGoal(e.target.value as 'A'|'B')}><option value="A">抵达 A 并等待确认</option><option value="B">经 A 抵达 B 并等待确认</option></select></label>
          {draft.phases.map((phase,index)=><fieldset key={phase.id} disabled={history}><legend>阶段 {index+1} · R 移动</legend><label>前置阶段<select aria-label={`阶段 ${index+1} 前置阶段`} value={phase.dependencies[0]?.id??''} onChange={e=>update(x=>{x.phases[index].dependencies=e.target.value?[{run_id:view.run_id,kind:'phase',id:e.target.value,version:1}]:[];})}><option value="">无前置</option>{draft.phases.map(p=><option key={p.id} value={p.id}>{p.id}</option>)}</select></label><div className="mission-window">{(['earliest_start_time_ms','latest_finish_time_ms'] as const).map((field,i)=><label key={field}>{i?'最晚结束（毫秒）':'最早开始（毫秒）'}<input aria-label={`阶段 ${index+1} ${i?'最晚结束':'最早开始'}`} type="number" value={phase[field]} onChange={e=>update(x=>{x.phases[index][field]=Number(e.target.value);})}/></label>)}</div></fieldset>)}
          <label>编辑阶段路线<select aria-label="编辑阶段路线" value={routeIndex} onChange={e=>setRouteIndex(Number(e.target.value))}>{draft.routes.map((r,i)=><option key={r.id} value={i}>阶段 {i+1}</option>)}</select></label><ol className="mission-points">{(routeTexts[activeRoute.id]??[]).map((p,i)=><li key={i}><span>{i+1}</span>{p.map((v,axis)=><input key={axis} aria-label={`路线点 ${i+1} ${axis?'y':'x'}`} value={v} inputMode="decimal" readOnly={history} onChange={e=>{setRouteTexts(old=>({...old,[activeRoute.id]:old[activeRoute.id].map((point,j)=>j===i?point.map((n,a)=>a===axis?e.target.value:n):point)}));changed();}}/>)}<button aria-label={`删除路线点 ${i+1}`} disabled={history} onClick={()=>{setRouteTexts(old=>({...old,[activeRoute.id]:old[activeRoute.id].filter((_,j)=>j!==i)}));changed();}}>删</button></li>)}</ol><button disabled={history} onClick={()=>{setRouteTexts(old=>({...old,[activeRoute.id]:[...(old[activeRoute.id]??[]),['','']]}));changed();}}>新增路线点</button><label>任务备注（仅供记录）<textarea aria-label="任务备注（仅供记录）" value={draft.note} readOnly={history} onChange={e=>update(x=>{x.note=e.target.value;})}/></label><p>执行字段仅为 R 移动。备注不会触发维修或其他行动；阅读和编辑不会暂停时间。</p>
          {issueReview&&<section aria-label="当前阶段下达核对"><h2>{issueReview.phase_id} · 下达前核对</h2><p>总部依据齐备仍需现场接令复核。使用既有参谋预授权，不产生新的批准。</p>{issueReview.preview.phases.filter(p=>p.phase_id===issueReview.phase_id).map(p=><div key={p.phase_id}><p>{p.authorization.status==='met'?'预授权已覆盖':p.authorization.gap}</p><GateSummary phase={p} at={view.sim_time}/></div>)}<label>下达理由（可留空）<textarea aria-label="下达理由（可留空）" value={reason} readOnly={history} onChange={e=>setReason(e.target.value)}/></label><button className="primary" disabled={blocked||dirty} onClick={()=>void checkIssue(true)}>确认下达 {issueReview.phase_id}</button><button disabled={busy} onClick={()=>setIssueReview(null)}>返回核对</button></section>}
          {preview&&<section data-testid="mission-preview"><h2>公开估计与假设</h2>{preview.phases.map(p=><div key={p.phase_id}><p>{p.phase_id} · {p.distance} 图上米 · {p.estimated_move_ms===null?'耗时待核实':`${p.estimated_move_ms/1000} 秒`} {p.assumptions.join('；')} {p.gap}</p><p>{p.phase_id} · {p.authorization.status==='met'?'既有参谋预授权已覆盖':p.authorization.gap}</p><GateSummary phase={p} at={view.sim_time}/></div>)}<p>核对不会产生新的批准记录。估计不含消息等待，不能代替下达或现场接令。</p></section>}
        </div><div className="mission-actions"><button disabled={blocked||dirty||!view.mission} onClick={()=>void checkIssue()}>核对当前阶段</button><button disabled={blocked} onClick={()=>void previewDraft()}>预览任务</button><button className="primary" disabled={blocked||!preview} onClick={()=>void saveDraft()}>保存草案</button>{retryOrder&&<button disabled={blocked} onClick={()=>prepareRetry(retryOrder)}>准备 {retryOrder.phase_ref.id} 新版本重试</button>}</div></section>:workspace==='map'?<aside className="inspector"><h2>公开位置依据</h2><p>{selected}</p><p>仅显示总部已有的位置范围；绘制路线不会下达命令。</p><button onClick={()=>setWorkspace('tasks')}>返回任务规划</button></aside>:<article className="content-view">{workspace==='report'?<><ReceivedReports view={view}/><h2>位置依据</h2><p>当前依据：{view.position_knowledge.status==='known_scope'?view.position_knowledge.scope.id:'位置尚未核实'}</p></>:workspace==='review'?<><h2>保存版本与历史记录</h2><p>历史只能查看；返回当前行动后才能编辑与保存。</p><label>历史节点<select aria-label="历史节点" value={historyNode} onChange={e=>setHistoryNode(e.target.value)}><option value="1">开局</option>{view.replay_nodes.map(n=><option key={n.revision} value={n.revision}>{n.label} · 记录 {n.revision}</option>)}</select></label><button disabled={busy} onClick={()=>void review()}>查看历史节点</button>{history&&<button onClick={()=>void returnCurrent()}>返回当前行动</button>}</>:<><h2>指挥记录</h2>{view.log.map(x=><p key={x.id}>{clock(x.at)} · {x.text}</p>)}</>}</article>}
      </div><footer className="mission-footer"><span data-testid="mission-resources">移动能量 {view.resources.movement_energy} · 联络能量 {view.resources.equipment_energy} · 总部能量 {view.resources.hq_energy}</span><span data-testid="mission-orders">{view.issued_orders.length?`已发送 ${view.issued_orders.length} 条指令；${view.issued_orders.at(-1)!.phase_ref.id} · 版本 ${view.issued_orders.at(-1)!.phase_ref.version} · ${order_status(view.issued_orders.at(-1)!)}` : '尚未下达；无执行或预约'}</span>{view.mode==='research'&&!history&&<label>推进到时刻（秒）<input aria-label="推进到时刻（秒）" value={advance} onChange={e=>setAdvance(e.target.value)}/><button disabled={blocked} onClick={()=>void control({kind:'advance',to:Math.round(Number(advance)*1000)})}>推进到该时刻</button></label>}</footer>
    </main></div>
  </div>;
}
