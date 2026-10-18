import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';import {IntelligenceWorkbench,type IntelligenceWorkbenchProps} from './intelligence-workbench';import type {OutcomeActor,OutcomePlayerView,ReturnAndDeliver,AbortOutcome} from './outcome-contracts';import {error_copy,clock} from './player-copy';
import {OutcomeDebrief} from './outcome-debrief';
import type {OutcomeFairness} from './outcome-contracts';
import type {Request} from './transport';
import {parse_outcome_envelope} from './outcome-protocol';
type Props=Omit<IntelligenceWorkbenchProps,'view'|'outcomeSlot'|'extraBusy'|'onBusyChange'>&{view:OutcomePlayerView};
export function OutcomeWorkbench(props:Props){
 const{view,transport,history,adopt}=props,[choice,setChoice]=useState<OutcomeActor|'abort'|null>(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[baseBusy,setBaseBusy]=useState(false),[error,setError]=useState(''),[unknown,setUnknown]=useState(false),[faulted,setFaulted]=useState(false);
 const [fairness,setFairness]=useState<OutcomeFairness|null>(null),[fairnessFailed,setFairnessFailed]=useState(false),[fairnessAttempt,setFairnessAttempt]=useState(0);
 const [nextReason,setNextReason]=useState(''),nextReasonValue=useRef(''),submittedReason=useRef<{run_id:string;operation_id:string;text:string|undefined}|null>(null);nextReasonValue.current=nextReason;
 // Adapt only this B24 screen. The original B23 controls and the actual
 // Transport/Worker remain in use. A retry retains the first declaration for
 // the same operation even if the player has since edited the next input.
 const declarationTransport=useMemo(()=>new Proxy(transport,{get(target,key){
  if(key!=='request'){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}
  return async(input:Request)=>{
   if(input.kind==='receipt'){
    const response=await target.request(input),prior=submittedReason.current;
    if(prior&&input.run_id===prior.run_id&&input.operation_id===prior.operation_id&&response.ok&&response.receipt?.run_id===prior.run_id&&response.receipt.operation_id===prior.operation_id)setNextReason(current=>current===prior.text?'':current);
    return response;
   }
   if(input.kind!=='operate_outcome'||input.envelope.run_id!==view.run_id||!['save_plan','request_source_validation','request_preparation','issue_activity'].includes(input.envelope.intent.kind))return target.request(input);
   const envelope=input.envelope,prior=submittedReason.current,text=prior?.run_id===envelope.run_id&&prior.operation_id===envelope.operation_id?prior.text:nextReasonValue.current.trim()?nextReasonValue.current:undefined;
   submittedReason.current={run_id:envelope.run_id,operation_id:envelope.operation_id,text};
   const decorated=text===undefined?envelope:parse_outcome_envelope({...envelope,intent:{...envelope.intent,reason:text}});
   const response=await target.request({...input,envelope:decorated});
   if(response.ok&&response.receipt?.run_id===envelope.run_id&&response.receipt.operation_id===envelope.operation_id)setNextReason(current=>current===text?'':current);return response;
  };
 }}),[transport,view.run_id]);
 useEffect(()=>{
  let cancelled=false;setFairness(null);setFairnessFailed(false);
  void transport.request({kind:'get_outcome_fairness',run_id:view.run_id}).then(response=>{
   if(cancelled)return;
   if(response.ok&&response.outcome_fairness?.run_id===view.run_id)setFairness(response.outcome_fairness);else setFairnessFailed(true);
  }).catch(()=>{if(!cancelled)setFairnessFailed(true);});
  return ()=>{cancelled=true;};
 },[view.run_id,transport,fairnessAttempt]);
 const resultHeading=useRef<HTMLHeadingElement|null>(null),terminationHeading=useRef<HTMLHeadingElement|null>(null);
 const pending=useRef<ReturnAndDeliver|AbortOutcome|null>(null),inFlight=useRef(false),confirmButton=useRef<HTMLButtonElement|null>(null),returnFocus=useRef<HTMLButtonElement|null>(null),current=useRef(view);current.current=view;
 useEffect(()=>{if(choice)confirmButton.current?.focus();else returnFocus.current?.focus();},[choice]);
 useEffect(()=>{if(unknown)setChoice(null);},[unknown]);
 useEffect(()=>{if(view.finished)resultHeading.current?.focus();else if(view.termination)terminationHeading.current?.focus();},[view.finished,view.termination?.operation_id]);
 const adoptCurrent=async()=>{const r=await transport.request({kind:'view',run_id:current.current.run_id});if(r.ok&&r.view?.scenario_kind==='play_outcome')adopt(r.view);else if(!r.ok)setError(r.code);};
 async function send(original:ReturnAndDeliver|AbortOutcome){
  if(inFlight.current||history)return;inFlight.current=true;setBusy(true);setError('');
  try{const r=await transport.request({kind:'operate_outcome',envelope:original});
   if(r.ok&&r.view?.scenario_kind==='play_outcome'&&r.receipt?.operation_id===original.operation_id&&r.receipt.kind===original.intent.kind){pending.current=null;setUnknown(false);setChoice(null);adopt(r.view);}
   else if(!r.ok){setError(r.code);if(['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(r.code)){setUnknown(true);if(r.code!=='CHANNEL_UNCERTAIN')setFaulted(true);}else{pending.current=null;setUnknown(false);setChoice(null);await adoptCurrent();}}
   else{setUnknown(true);setError('CHANNEL_UNCERTAIN');}
  }catch{setUnknown(true);setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;setBusy(false);}
 }
 async function confirm(){
  if(!choice||pending.current||busy||baseBusy||history)return;const now=current.current;if(choice==='abort'){const original:AbortOutcome={run_id:now.run_id,operation_id:crypto.randomUUID(),expected_revision:now.revision,intent:{kind:'abort_outcome',...(reason.trim()?{reason}:{})}};pending.current=original;await send(original);return;}if(!now.return_candidates.find(c=>c.actor===choice)?.available){setChoice(null);return;}
  const ref=<K extends string>(kind:K,id:string)=>({run_id:now.run_id,kind,id,version:1});const basis=now.field_reports.filter(r=>r.report.actor===choice&&r.report.phase==='completed'&&['A','B'].includes(r.report.confirmation.position.site)).slice(-1).map(r=>r.delivery.ref);
  const original:ReturnAndDeliver={run_id:now.run_id,operation_id:crypto.randomUUID(),expected_revision:now.revision,intent:{kind:'return_and_deliver',actor_ref:ref('actor',choice),return_route_ref:ref('return_route',choice+'-'+now.actors.find(a=>a.actor===choice)!.position_scope+'-H'),receiver_ref:ref('receiver','H'),authority_ref:ref('authority','HQ-outcome-authority'),intent_ref:ref('return_intent','RET-'+choice),basis_delivery_refs:basis,allowed_followups:['return','handover_batch','verify_manifest','notify_HQ'],cleanup_scope:['return','personnel_reception','custody'],effective_window:{from:now.sim_time,to:now.public_rules.deadline},...(reason.trim()?{reason}:{})}};pending.current=original;await send(original);
 }
 async function query(){const original=pending.current;if(!original||inFlight.current||history)return;inFlight.current=true;setBusy(true);try{const r=await transport.request({kind:'receipt',run_id:original.run_id,operation_id:original.operation_id});if(!r.ok){setError(r.code);return;}if(r.receipt){pending.current=null;setUnknown(false);setChoice(null);setError('');await adoptCurrent();}else setError('OUTCOME_RECEIPT_ABSENT');}catch{setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;setBusy(false);}}
 function trap(event:KeyboardEvent<HTMLElement>){if(event.key==='Escape'&&!pending.current){event.preventDefault();setChoice(null);}if(event.key==='Tab'){const buttons=[...event.currentTarget.querySelectorAll<HTMLElement>('textarea:not([disabled]),button:not([disabled])')];if(buttons.length&&event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)!.focus();}else if(buttons.length&&!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0].focus();}}}
 const blocked=history||view.finished||busy||baseBusy||props.storageFault||faulted||!!pending.current,verifiedPeople=new Set(view.verification_reports.flatMap(r=>r.report.personnel.filter(p=>p.status==='verified').map(p=>p.person_id))),verifiedArtifacts=new Set(view.verification_reports.flatMap(r=>r.report.artifacts.filter(a=>a.status==='verified').map(a=>a.artifact_ref.id)));
 const status={issued:'已签发，等待当地回报',returning:'接令回报已收到，等待到达回报',arrived:'返回到达回报已收到',cutoff:'已收到时限收尾回报',hold:'已收到当地受阻回报'};
 async function evidenceHistory(node:{run_id:string;revision:number;at:number}){
  if(node.run_id!==current.current.run_id)return;setBusy(true);
  try{const response=await transport.request({kind:'replay',run_id:node.run_id,to:node.at,node_revision:node.revision});if(current.current.run_id!==node.run_id)return;
   if(response.ok&&response.view?.scenario_kind==='play_outcome'&&response.view.run_id===node.run_id&&response.view.revision===node.revision){props.onHistory(true);adopt(response.view);}else setError('CHANNEL_UNCERTAIN');
  }catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
 }
 const slot=<section className='outcome-panel' aria-label='返回交付安排'>
  {fairnessFailed&&<p role='status'>尚未确认本场景的事实查看记录。<button onClick={()=>setFairnessAttempt(n=>n+1)}>重试核对查看记录</button></p>}
  {fairness?.run_id===view.run_id&&fairness.truth_exposure&&<aside data-testid='outcome-fairness'><p>已看过本场景事实，非首次公平局。</p><p>仅反映本应用已经记录的事实查看；新局角色仍从各自的初始所知开始。</p><details><summary>查看实际来源记录</summary><ul>{fairness.sources.map(source=><li key={source.run_id+':'+source.operation_id}>来源行动 {source.run_id} · 已确认查看记录 {source.operation_id}</li>)}</ul></details></aside>}
  <section data-testid='outcome-constraints'><h3>结束条件</h3><p>两份成果按时交付、核验，总部收到确认；必要人员分别返回、接收并核对。</p><p>实体截止 {clock(view.public_rules.deadline)} · 旧回执宽限 {view.public_rules.receipt_grace/1000} 秒，不能补做工作。</p>{view.hard_boundary&&<p>公开硬截止 {clock(view.hard_boundary.hard_close_time)}，同刻优先于普通成功。</p>}{view.verification_receipt_delay!==1000&&<p>本演练的核验回执传递需 {view.verification_receipt_delay/1000} 秒。</p>}</section>
  <OutcomeDebrief run_id={view.run_id} finished={view.finished} transport={transport} onHistory={evidenceHistory}/>
  {view.progress.warning&&<p role='status'>{view.progress.message}</p>}{view.progress.waiting_until!==null&&view.sim_time<view.progress.waiting_until&&<p>已收到预计等待至 {clock(view.progress.waiting_until)} 的回报；仍以实际后续回报为准，不延长期限。</p>}
  {view.outcome&&<section data-testid='outcome-result' aria-label='任务结果'><h2 ref={resultHeading} tabIndex={-1}>{({success:'任务完成',partial:'有限完成（partial）',aborted:'已中止',failure:'任务未完成'})[view.outcome.result]}</h2><p>结束时刻 {clock(view.outcome.finished_at)} · 主评分截止 {clock(view.outcome.scoring_cutoff)}</p><p>合格成果 {view.outcome.qualified_artifacts.length} 份 · 已确认人员 {view.outcome.confirmed_people.length} 人</p>{view.outcome.missing_people.length>0&&<div><strong>人员回收未完成</strong><p>未确认人员：{view.outcome.missing_people.map(id=>id.replace(/^([RW])-person-([0-9]+)$/,'$1组$2号成员')).join('、')}</p><p>未收到的确认保留为未完成，不能当作安全或已释放。</p></div>}{view.hard_boundary&&view.outcome.finished_at===view.hard_boundary.hard_close_time&&<p>已到公开硬截止，按公开规则优先结束；已取得的明细继续保留。</p>}<p>已确认处理能源余量 {view.processing.energy_confirmed}，仍预约 {view.processing.energy_reserved}。</p><details><summary>查看成果与人员分项记录</summary><ul>{view.outcome.artifact_status.map(item=><li key={item.id}>成果 {item.id}：取得 {item.acquired_at===null?'未收到凭证':clock(item.acquired_at)}；交付 {item.delivered_at===null?'未收到凭证':clock(item.delivered_at)}；核验 {item.verified_at===null?'未收到凭证':clock(item.verified_at)}；总部确认 {item.confirmed_at===null?'未收到凭证':clock(item.confirmed_at)}。{item.qualified?'已计入主目标':'未计入主目标'}{item.post_cutoff_effect?'，含期后未计效果':''}。</li>)}</ul><ul>{view.outcome.personnel_status.map(item=><li key={item.id}>{item.id.replace(/^([RW])-person-([0-9]+)$/,'$1组$2号成员')}：返回 {item.returned_at===null?'未收到凭证':clock(item.returned_at)}；接收 {item.received_at===null?'未收到凭证':clock(item.received_at)}；核对 {item.verified_at===null?'未收到凭证':clock(item.verified_at)}；总部确认 {item.confirmed_at===null?'未收到凭证':clock(item.confirmed_at)}。</li>)}</ul></details></section>}
  {view.termination?<section data-testid='outcome-termination'><h2 ref={terminationHeading} tabIndex={-1}>{view.finished?'收尾已封存':'任务中止，正在收尾'}</h2><p>中止已于 {clock(view.termination.effective_at)} 在总部生效，不可撤回；收尾截止 {clock(view.termination.cleanup_deadline)}。</p><p>各方收到消息后才改变当地行动。仅继续原范围内的返回、人员交接核对和既有物保管，不再新增主任务。</p><ul aria-label='中止接令回报'>{view.termination.notification_targets.map(actor=>{const received=view.abort_reports.find(item=>item.report.actor===actor);return <li key={actor}>{actor}：{received?'接令回报已收到 '+clock(received.delivery.received):'尚未收到接令回报'}</li>;})}</ul></section>:<button disabled={blocked} onClick={e=>{returnFocus.current=e.currentTarget;setReason('');setChoice('abort');}}>中止本次任务</button>}
  <h2>分别返回，先到先交</h2><p>每组确认一次；编组和接收方收到安排、核对当地条件后，继续完成返回、交接和核验。不必等另一组到齐。</p>
  {view.return_candidates.map(candidate=>{const plan=view.return_plans.find(p=>p.actor===candidate.actor);return <article key={candidate.actor} data-testid={'outcome-return-'+candidate.actor}><h3>{candidate.actor}组</h3><p>{plan?status[plan.status]:candidate.available?'可安排返回总部':'尚不能安排返回'}</p>{!plan&&candidate.missing.map(text=><p key={text}>{text}</p>)}<button disabled={blocked||!candidate.available} onClick={e=>{returnFocus.current=e.currentTarget;setReason('');setChoice(candidate.actor);}}>安排{candidate.actor}返回交付</button></article>;})}
  <div data-testid='outcome-reception'><h3>总部接收</h3><p>已确认接收 {view.handover.received_personnel} 人 / {view.handover.capacity} 人</p><p>每批3人，交接25秒；以收到的接收回报为准。</p></div>
  <ul aria-label='接收与核验反馈'>{view.reception_reports.filter((item,index,all)=>!all.slice(index+1).some(later=>later.report.batch_ref.id===item.report.batch_ref.id)).map(item=>{
   const report=item.report,verification=view.verification_reports.find(v=>v.report.reception_ref.id===report.batch_ref.id),feedback=view.verification_feedback.filter(v=>v.report.reception_ref.id===report.batch_ref.id).at(-1);
   return <li key={report.batch_ref.id}>{report.phase==='completed'?(verification?<p>{report.subject_actor}组交接回报已收到，核验回报已收到</p>:feedback?<p>{report.subject_actor}组{feedback.report.phase==='accepted'?'核验岗位已接令，等待完成回报':feedback.report.phase==='queued'?'核验排队：'+feedback.report.reason:feedback.report.phase==='hold'?'核验暂缓：'+feedback.report.reason:'已收到核验时限回报'}</p>:<p>{report.subject_actor}组交接回报已收到，等待核验回报</p>):<p>{report.subject_actor}组：{report.phase==='hold'?'接收暂缓，'+report.reason:report.phase==='accepted'?'接收方已接令，等待完成回报':'已收到接收时限回报'}</p>}<small>总部收到 {clock(verification?.delivery.received??feedback?.delivery.received??item.delivery.received)} · 依据已送达回报</small></li>;
  })}</ul>
  <div data-testid='outcome-verification'><h3>核验回报</h3><p>已核验 {verifiedPeople.size} 人 · {verifiedArtifacts.size} 份成果</p><p>每批核验20秒，使用同一个处理席位与2份处理能源。交接回报不代替核验确认。</p></div>
  {error&&<p role='alert'>{error==='OUTCOME_RECEIPT_ABSENT'?'尚未查到原提交；请先核对最近记录，再决定是否重试同一提交。':error_copy(error)}</p>}{unknown&&<div className='outcome-pending'><p>{pending.current?.intent.kind==='abort_outcome'?'这次中止安排的提交结果尚未确认，原编号已保留。':'这次返回安排的提交结果尚未确认，原编号已保留。'}</p><button disabled={busy||history} onClick={()=>void query()}>{pending.current?.intent.kind==='abort_outcome'?'核对中止提交':'核对返回提交'}</button><button disabled={busy||history||faulted} onClick={()=>pending.current&&void send(pending.current)}>{pending.current?.intent.kind==='abort_outcome'?'重试同一中止提交':'重试同一返回提交'}</button></div>}
  {choice&&<div className='outcome-dialog-backdrop'><section role='dialog' aria-modal='true' aria-labelledby='outcome-confirm-title' className='outcome-dialog' onKeyDown={trap}><h2 id='outcome-confirm-title'>{choice==='abort'?'确认中止任务':'确认返回交付'}</h2>{choice==='abort'?<><p>中止一旦在总部生效便不可撤回。各地必须收到消息后才执行；当前未确认的人员与成果不会自动变为安全。</p><label>中止理由（可选）<textarea aria-label='中止理由（可选）' maxLength={600} value={reason} disabled={busy||!!pending.current} onChange={event=>setReason(event.target.value)}/></label></>:<><p>{choice}组返回总部H，随后按当地收到的安排分批交付、核验并回报总部。</p><p>只继续这份有限安排；不会自动追加采集或维修。签发不等于编组已经接受。</p><p>当前总部时刻 {clock(view.sim_time)}。核对后再确认。</p><label>返回理由（可选）<textarea aria-label='返回理由（可选）' maxLength={600} value={reason} disabled={busy||!!pending.current} onChange={event=>setReason(event.target.value)}/></label></>}<button disabled={busy||!!pending.current} onClick={()=>setChoice(null)}>继续查看</button><button ref={confirmButton} disabled={busy||baseBusy||!!pending.current} onClick={()=>void confirm()}>{choice==='abort'?'确认中止任务':'确认返回交付'}</button></section></div>}
 </section>;
 return <IntelligenceWorkbench {...props} transport={declarationTransport} view={view} primaryStopped={!!view.termination||view.finished} finished={view.finished} outcomeSlot={<>{!view.finished&&!view.termination&&<label>下次关键操作的理由（可选）<textarea aria-label='下次关键操作的理由（可选）' maxLength={600} value={nextReason} disabled={blocked} onChange={event=>setNextReason(event.target.value)}/><small>随下一次保存准备、核实来源、申请筹备或下达活动登记；不填写也可提交。</small></label>}{slot}</>} extraBusy={busy||!!pending.current} onBusyChange={setBaseBusy} storageFault={props.storageFault||faulted} onStorageRecovered={()=>{setFaulted(false);props.onStorageRecovered();}}/>;
}
