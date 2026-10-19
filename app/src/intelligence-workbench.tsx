import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {OutcomePlayerView} from './outcome-contracts';
import {parse_outcome_envelope} from './outcome-protocol';
import type {Envelope,Intent} from './contracts';
import type {IntelligencePlayerView,SaveIntelligencePlan,IntelligencePreparationRequest,IntelligenceActivityRequest} from './intelligence-contracts';
import type {IntelligenceSourceRequest} from './intelligence-protocol';
import type {GamePlayerView} from './play-contracts';
import type {Transport,Request,Response} from './transport';
import type {RegionalDisplaySession} from './regional-display';
import {MapView} from './map';
import {clock,error_copy} from './player-copy';
export type IntelligenceWorkbenchProps={view:IntelligencePlayerView|OutcomePlayerView;transport:Transport;adopt:(view:GamePlayerView)=>void;onNewRun:(view:IntelligencePlayerView|OutcomePlayerView)=>void;outcomeSlot?:ReactNode;outcomeFrame?:{records:ReactNode;footer:ReactNode};primaryStopped?:boolean;finished?:boolean;extraBusy?:boolean;onBusyChange?:(busy:boolean)=>void;history:boolean;liveRunId:string|null;onHistory:(value:boolean)=>void;displaySession?:RegionalDisplaySession;onLeave:()=>Promise<void>;channelError:string;storageFault:boolean;onStorageRecovered:()=>void};
export function IntelligenceWorkbench({view,transport,adopt,onNewRun,history,liveRunId,onHistory,displaySession,onLeave,channelError,storageFault,onStorageRecovered,outcomeSlot,outcomeFrame,extraBusy=false,onBusyChange,primaryStopped=false,finished=false}:IntelligenceWorkbenchProps){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[advance,setAdvance]=useState('21'),[selected,setSelected]=useState('R'),[pauseUnknown,setPauseUnknown]=useState(false);
  const [expanded,setExpanded]=useState<string[]>([]),[node,setNode]=useState('1');
  const sourceReturn=useRef<{id:string;scrollTop:number}|null>(null);
  const [rejection,setRejection]=useState<{run_id:string;kind:string;operation:string;submitted:string}|null>(null),[recheckOpen,setRecheckOpen]=useState(false);
  const purposeInput=useRef<HTMLTextAreaElement>(null),rejectedControl=useRef<string|null>(null);
  const [purpose,setPurpose]=useState(view.plan?.purpose??'取得B处记录');
  const [restartConfirm,setRestartConfirm]=useState(false),[restartPending,setRestartPending]=useState<{run_id:string;operation_id:string}|null>(null);
  const [storageUnconfirmed,setStorageUnconfirmed]=useState(false),[recoveryUnknown,setRecoveryUnknown]=useState(false),[noReceipt,setNoReceipt]=useState(false);
  const recoveryPending=useRef<{run_id:string;operation_id:string}|null>(null),hasStorageFault=storageFault||storageUnconfirmed;
  const restartPendingRef=useRef<typeof restartPending>(null);
  const current=useRef(view),pending=useRef<Envelope|SaveIntelligencePlan|IntelligenceSourceRequest|IntelligencePreparationRequest|IntelligenceActivityRequest|null>(null),inFlight=useRef(false),nodes=useRef(view.replay_nodes);current.current=view;
  if(!history)nodes.current=view.replay_nodes;
  async function request(input:Request,clearError=true){
    const routed:Request=current.current.scenario_kind==='play_outcome'&&'envelope' in input&&['save_plan','request_source_validation','request_preparation','issue_activity','operate_intelligence'].includes(input.kind)?{kind:'operate_outcome',envelope:parse_outcome_envelope(input.envelope)}:input;
    const response=await transport.request(routed);
    if(response.ok&&response.view){adopt(response.view);if(clearError)setError('');}
    else if(!response.ok){setError(response.code);if(['STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(response.code))setStorageUnconfirmed(true);}
    return response;
  }
  async function send(envelope:Envelope|SaveIntelligencePlan|IntelligenceSourceRequest|IntelligencePreparationRequest|IntelligenceActivityRequest){
    if(inFlight.current)return;inFlight.current=true;setNoReceipt(false);setBusy(true);
    setRejection(null);setRecheckOpen(false);rejectedControl.current=document.activeElement instanceof HTMLElement?document.activeElement.id||null:null;
    const intent=envelope.intent;
    const submitted=intent.kind==='save_plan'?{operation:'保存准备草案',submitted:intent.draft.purpose}:intent.kind==='request_preparation'?{operation:'提交准备申请',submitted:'准备草案第'+intent.plan_ref.version+'版'}:intent.kind==='request_source_validation'?{operation:'请求核实原文',submitted:'引用已收递交凭证'+intent.basis_delivery_refs.length+'份；不代表独立来源数'}:intent.kind==='issue_activity'?{operation:'下达现场指令',submitted:current.current.field_options.find(option=>option.intent.activity_ref.id===intent.activity_ref.id)?.label??'原活动名称当前无法确认'}:null;
    try{
      const result=envelope.intent.kind==='issue_activity'?await request({kind:'issue_activity',envelope}):envelope.intent.kind==='save_plan'?await request({kind:'save_plan',envelope}):envelope.intent.kind==='request_source_validation'?await request({kind:'request_source_validation',envelope}):envelope.intent.kind==='request_preparation'?await request({kind:'request_preparation',envelope}):await request({kind:'operate_intelligence',envelope:envelope as Envelope});
      if(result.ok){pending.current=null;setNotice('已提交 · '+clock(result.view?.sim_time??view.sim_time));}
      else if(!['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED'].includes(result.code)){pending.current=null;if(result.code==='STALE_REVISION'){if(submitted&&current.current.run_id===envelope.run_id)setRejection({run_id:envelope.run_id,kind:intent.kind,...submitted});await request({kind:'view',run_id:view.run_id},false);}}
    }catch{setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;setBusy(false);}
  }
  async function savePlan(){
    if(history||pending.current||inFlight.current||hasStorageFault||recoveryPending.current)return;
    const now=current.current,envelope:SaveIntelligencePlan={run_id:now.run_id,operation_id:crypto.randomUUID(),expected_revision:now.revision,intent:{kind:'save_plan',base_plan_ref:now.plan?.ref??null,draft:{purpose,repair_packs:2}}};
    pending.current=envelope;await send(envelope);
  }
  async function validateSource(ids:string[]){
    if(history||pending.current||inFlight.current||hasStorageFault||recoveryPending.current)return;
    const now=current.current,envelope:IntelligenceSourceRequest={run_id:now.run_id,operation_id:crypto.randomUUID(),expected_revision:now.revision,intent:{kind:'request_source_validation',basis_delivery_refs:ids.map(id=>({run_id:now.run_id,kind:'report_delivery',id,version:1}))}};
    pending.current=envelope;await send(envelope);
  }
  async function requestPreparation(){
    const now=current.current;if(history||pending.current||inFlight.current||hasStorageFault||recoveryPending.current||!now.plan)return;
    const envelope:IntelligencePreparationRequest={run_id:now.run_id,operation_id:crypto.randomUUID(),expected_revision:now.revision,intent:{kind:'request_preparation',plan_ref:now.plan.ref}};
    pending.current=envelope;await send(envelope);
  }
  async function issueActivity(intent:IntelligenceActivityRequest['intent']){
    if(history||pending.current||inFlight.current||hasStorageFault||recoveryPending.current)return;const now=current.current,envelope={run_id:now.run_id,operation_id:crypto.randomUUID(),expected_revision:now.revision,intent};pending.current=envelope;await send(envelope);
  }
  async function control(intent:Intent){
    if(history||pending.current||inFlight.current||hasStorageFault||recoveryPending.current)return;
    if(intent.kind==='pause'){
      // The existing management queue asks Game to pause its current committed
      // revision. A delayed UI revision must not prevent a requested pause.
      inFlight.current=true;setBusy(true);
      try{const result=await request({kind:'management_pause',reason:'manual'});if(result.ok&&result.view?.paused){setPauseUnknown(false);setNotice('暂停已确认，等待明确继续。');}else setPauseUnknown(true);}catch{setError('CHANNEL_UNCERTAIN');setPauseUnknown(true);}finally{inFlight.current=false;setBusy(false);}return;
    }
    const envelope={run_id:current.current.run_id,operation_id:crypto.randomUUID(),expected_revision:current.current.revision,intent};pending.current=envelope;await send(envelope);
  }
  useEffect(()=>{
    // A pending continue can outlive the last confirmed paused view. Focus loss
    // must still reach Game after that original control, without inventing an ack.
    const lost=()=>{const requestedRun=current.current.run_id;if(!hasStorageFault&&!recoveryPending.current&&current.current.mode==='command'&&(!current.current.paused||pending.current?.intent.kind==='continue'))void transport.request({kind:'management_pause',reason:document.hidden?'application_hidden':'focus_lost'}).then(result=>{if(result.ok&&result.view){if(!history&&!restartPendingRef.current&&current.current.run_id===requestedRun&&result.view.run_id===requestedRun)adopt(result.view);}else if(!result.ok)setError(result.code);}).catch(()=>setError('CHANNEL_UNCERTAIN'));};
    const hidden=()=>{if(document.hidden)lost();};window.addEventListener('blur',lost);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',lost);document.removeEventListener('visibilitychange',hidden);};
  },[transport,adopt,history,hasStorageFault]);
  async function review(){
    if(busy||pending.current||restartPending||hasStorageFault||recoveryPending.current)return;setBusy(true);
    try{const response=await transport.request({kind:'replay',run_id:view.run_id,to:0,node_revision:Number(node)});if(response.ok&&response.view){onHistory(true);adopt(response.view);}else if(!response.ok)setError(response.code);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function currentView(){setBusy(true);try{const response=await transport.request({kind:'current',run_id:liveRunId??view.run_id});if(response.ok&&response.view){if(liveRunId){onHistory(false);adopt(response.view);}else await onLeave();}else if(!response.ok)setError(response.code);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}}
  async function previous(){if(busy||history||pending.current||restartPending||hasStorageFault||recoveryPending.current)return;setBusy(true);try{const response=await transport.request({kind:'previous',run_id:view.run_id});if(response.ok&&response.view){onHistory(true);adopt(response.view);}else if(!response.ok)setError(response.code);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}}
  async function restart(){
    if(history||inFlight.current||pending.current||pauseUnknown||hasStorageFault||recoveryPending.current)return;
    const original=restartPendingRef.current??{run_id:view.run_id,operation_id:crypto.randomUUID()};restartPendingRef.current=original;setRestartPending(original);inFlight.current=true;setBusy(true);
    try{const response=await transport.request({kind:'restart',...original});
      if(response.ok&&(response.view?.scenario_kind==='play_intelligence'||response.view?.scenario_kind==='play_outcome')&&response.view.run_id!==original.run_id&&response.view.source_run===original.run_id){restartPendingRef.current=null;onHistory(false);onNewRun(response.view);}
      else{const code=response.ok?'CHANNEL_UNCERTAIN':response.code;setError(code);if(!['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED'].includes(code)){restartPendingRef.current=null;setRestartPending(null);}}
    }catch{setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;setBusy(false);}
  }
  async function query(){const envelope=pending.current;if(!envelope||busy)return;setBusy(true);try{const response=await transport.request({kind:'receipt',run_id:envelope.run_id,operation_id:envelope.operation_id});if(response.ok&&response.receipt){setNoReceipt(false);pending.current=null;await request({kind:'view',run_id:envelope.run_id});setNotice('原操作已提交，未再次执行。');}else if(!response.ok)setError(response.code);else{setNoReceipt(true);setNotice('尚未查到原操作收据；请保留原操作核查或重试。');}}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}}
  function finishRecovery(response:Response,original:{run_id:string;operation_id:string}){
    if(!response.ok){setError(response.code);return;}
    if((response.view?.scenario_kind!=='play_intelligence'&&response.view?.scenario_kind!=='play_outcome')||response.view.run_id!==original.run_id||!response.view.paused||response.receipt?.kind!=='restore'||response.receipt.operation_id!==original.operation_id){setError('CHANNEL_UNCERTAIN');return;}
    adopt(response.view);recoveryPending.current=null;setRecoveryUnknown(false);setStorageUnconfirmed(false);setNoReceipt(false);onStorageRecovered();setError('');setNotice('最近已提交记录已恢复；输入与待查原操作保留，当前已暂停，请核对后明确继续。');
  }
  async function recover(){
    if(history||busy||restartPendingRef.current||pending.current&&!noReceipt)return;
    const original=recoveryPending.current??{run_id:current.current.run_id,operation_id:crypto.randomUUID()};recoveryPending.current=original;setRecoveryUnknown(true);setBusy(true);
    try{finishRecovery(await transport.request({kind:'takeover',...original}),original);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function queryRecovery(){
    const original=recoveryPending.current;if(!original||busy||history)return;setBusy(true);
    try{const receipt=await transport.request({kind:'receipt',...original});if(!receipt.ok){setError(receipt.code);return;}if(!receipt.receipt){setNotice('尚未查到恢复回执；原恢复编号已保留，可重试原恢复操作。');return;}const response=await transport.request({kind:'view',run_id:original.run_id});if(!response.ok){setError(response.code);return;}finishRecovery({...response,receipt:receipt.receipt},original);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  const deadlineGap=(kind:'preparation'|'source_validation')=>{const gap=view.processing.estimated_complete_at[kind]-view.public_rules.deadline;return view.sim_time<view.public_rules.deadline&&gap>0?<p>按总部公开席位队列、已接受次序和注册工时估计，假定无新增请求且连续处理，预计晚于实体截止{gap}毫秒；仍可在截止前申请，截止时仅结算已做工作。</p>:null;};
  useEffect(()=>{onBusyChange?.(busy||!!pending.current||pauseUnknown||!!restartPending||hasStorageFault||recoveryUnknown);},[busy,pauseUnknown,restartPending,hasStorageFault,recoveryUnknown,onBusyChange]);
  const blocked=extraBusy||busy||history||!!pending.current||pauseUnknown||!!restartPending||hasStorageFault||recoveryUnknown;
  const verificationCopy=view.access.blue==='verified'&&view.access.green==='verified'?'蓝／绿凭证已核实':view.access.green==='verified'?'绿色凭证已核实':view.access.blue==='verified'?'蓝色凭证已核实':'凭证尚未核实';
  const preparationCopy=view.preparation.status==='under_review'?'准备审查中，尚未批准':view.preparation.status==='approved'?'准备批准已收到；只对应本版草案，不代表现场维修完成。':view.preparation.status==='not_approved'?'准备未获批准；已确认用品与已有承诺不足。':'尚未提交准备申请；保存不预留处理能量或维修包。';
  const sourceArticle=(group:(typeof view.source_groups)[number])=>{const report=view.received_reports.find(x=>x.report.id===group.report_ref.id)!.report,open=expanded.includes(report.id);return <article className="intelligence-source" key={report.id} data-testid={'intelligence-source-'+report.id}>
          <h3>{report.typed_payload.value==='blue'?'蓝色凭证原文':'绿色凭证原文'}</h3><p>{group.delivery_refs.length}次递交 · {group.relation==='confirmed_common_original'?'已证共同原件来源组':'共同来源关系未知'}</p><p>原始主体归因未知 · 独立来源数量未知 · {view.access[report.typed_payload.value]==='verified'?'核实结论已收到；原文声明保持原样':'内容尚未核实'}</p>
          <button id={'source-toggle-'+report.id} aria-expanded={open} aria-controls={'source-details-'+report.id} onClick={()=>setExpanded(old=>open?old.filter(id=>id!==report.id):[...old,report.id])}>{open?'收起原文及递交':'展开原文及递交'}</button>
          {deadlineGap('source_validation')}<button id={'validate-source-'+report.id} disabled={blocked||primaryStopped} onClick={()=>void validateSource(group.delivery_refs)}>请求核实这份原文</button>
          {open&&<div id={'source-details-'+report.id} tabIndex={outcomeFrame?-1:undefined}><p className="original-report">{report.text}</p><p>{report.source_descriptor}</p><p>{report.source_event_time.kind==='unknown'?'来源时点不详':'来源时点 '+clock(report.source_event_time.value)} · 观察 {report.observed.kind==='known'?clock(report.observed.value):'时点不详'} · 发布 {clock(report.source_published)}</p><ul data-testid={'intelligence-deliveries-'+report.id}>{view.received_reports.filter(x=>group.delivery_refs.includes(x.delivery.id)).map(({delivery})=><li key={delivery.id}>收到 {clock(delivery.received)} · {delivery.forward_of?'附已收到的转交凭证':'来源关系尚未明确'}</li>)}</ul></div>}
        </article>;};
  const activeGroup=outcomeFrame?view.source_groups.find(group=>group.report_ref.id===expanded.at(-1)):undefined;
  const activeReportId=activeGroup?.report_ref.id??null,lastActiveReport=useRef<string|null>(null);
  useEffect(()=>{if(activeReportId)document.getElementById('source-details-'+activeReportId)?.focus();else if(lastActiveReport.current){const returnTo=sourceReturn.current,control=document.getElementById(returnTo?.id??('source-toggle-'+lastActiveReport.current)),container=document.getElementById('intelligence-sources');if(returnTo&&container)container.scrollTop=returnTo.scrollTop;control?.focus({preventScroll:true});control?.scrollIntoView({block:'nearest'});sourceReturn.current=null;}lastActiveReport.current=activeReportId;},[activeReportId]);
  const reportWorkspace=activeGroup&&<><section className='report-list' aria-label='已收原始资料列表'><button onClick={()=>setExpanded([])}>返回当前行动</button><div className='content-head'><h2>已收原始资料</h2><p>原文与递交分别保留</p></div>{view.source_groups.map(group=>{const report=view.received_reports.find(item=>item.report.id===group.report_ref.id)!.report;return <button className={'report-row'+(report.id===activeReportId?' selected':'')} key={report.id} aria-pressed={report.id===activeReportId} onClick={()=>setExpanded([report.id])}><strong>{report.typed_payload.value==='blue'?'蓝色凭证原文':'绿色凭证原文'}</strong><span>{group.delivery_refs.length}次已收递交</span></button>;})}</section><section className='report-detail' aria-label='已收原文详情'>{sourceArticle(activeGroup)}</section></>;
  const historyControls=<footer className="mission-footer"><label>历史节点<select id="intelligence-history" aria-label="历史节点" value={node} onChange={event=>setNode(event.target.value)}><option value="1">开局 · 记录 1</option>{nodes.current.map(n=><option value={n.revision} key={n.revision}>{n.label} · 记录 {n.revision}</option>)}</select></label><button disabled={busy||!!pending.current||!!restartPending||hasStorageFault||recoveryUnknown} onClick={()=>void review()}>查看历史节点</button>{history&&<button disabled={busy} onClick={()=>void currentView()}>{liveRunId?'返回当前行动':'返回演练入口'}</button>}{!history&&view.source_run&&<button disabled={blocked} onClick={()=>void previous()}>查看上一场记录</button>}{!history&&<button disabled={blocked} onClick={()=>setRestartConfirm(true)}>重开这场演练</button>}{restartConfirm&&<section role='region' aria-label='重开确认'><p>新局使用相同场景和起始条件，原行动保留为只读。新局保持暂停，等待明确继续；这不算独立的首次体验。</p><button disabled={busy||!!restartPending} onClick={()=>setRestartConfirm(false)}>保留当前行动</button><button disabled={busy} onClick={()=>void restart()}>{restartPending?'重试同一重开':'确认重开'}</button>{restartPending&&<p>原重开操作编号已保留；结果未知时只重试本操作，不创建第二个新局。</p>}</section>}{view.mode==='research'&&!history&&<label>推进到时刻（秒）<input aria-label="推进到时刻（秒）" value={advance} onChange={event=>setAdvance(event.target.value)}/><button disabled={blocked||finished} onClick={()=>void control({kind:'advance',to:Math.round(Number(advance)*1000)})}>推进到该时刻</button></label>}</footer>;
  const operationStatus=<p className="operation-status" role="status">{history?'仅显示所选记录提交时总部已收到的信息。':<>{view.next_action}{notice&&<span> · {notice}</span>}</>}</p>;
  return <div className={"app crisis-app mission-app intelligence-app"+(outcomeFrame?" outcome-app":"")}>
    <header className="topbar"><span className="brand"><span className="brand-mark">玄</span><strong>玄枢行动</strong><span className="brand-sub">联合任务指挥部</span></span><span className="demo-badge">{view.scenario_kind==='play_outcome'?'返回交付':'情报协作'}</span><div className="clock"><strong>{clock(view.sim_time)}</strong><span>{hasStorageFault||recoveryUnknown?'进度未确认':history?'历史只读':finished?'已结束':view.paused?'已暂停':'指挥进行中'}</span></div><label>推进速度<select aria-label="推进速度" value={view.rate} disabled={blocked} onChange={event=>void control({kind:'rate',rate:Number(event.target.value) as 1|2|4})}><option value="1">1倍</option><option value="2">2倍</option><option value="4">4倍</option></select></label><button disabled={blocked||finished||view.mode!=='command'} onClick={()=>void control(view.paused?{kind:'continue'}:{kind:'pause',reason:'manual'})}>{view.paused?'继续行动':'暂停行动'}</button><button disabled={blocked} onClick={()=>void control({kind:'save'})}>保存行动</button></header>
    {(error||channelError)&&<div className="fault" role="alert">{error_copy(error||channelError)}</div>}
    {hasStorageFault&&!pending.current&&!recoveryUnknown&&<div className="fault"><span>推进尚未得到可靠提交确认。当前输入保留，恢复后保持暂停。</span><button disabled={busy||history||!!restartPending} onClick={()=>void recover()}>恢复最近记录并重新核对</button></div>}
    {recoveryUnknown&&<div className="fault"><span>恢复结果待核查，恢复编号、原操作与输入已保留。</span><button disabled={busy||history} onClick={()=>void queryRecovery()}>查询恢复结果</button><button disabled={busy||history} onClick={()=>void recover()}>重试原恢复操作</button></div>}
    {pauseUnknown&&<div className="fault"><span>暂停尚未得到确认，当前状态以重新核对结果为准。</span><button disabled={busy} onClick={()=>void (async()=>{setBusy(true);try{const result=await request({kind:'view',run_id:view.run_id});if(result.ok&&result.view){setPauseUnknown(false);setNotice(result.view.paused?'暂停已确认，等待明确继续。':'当前仍在进行，可再次请求暂停。');}}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}})()}>核对暂停状态</button></div>}
    {pending.current&&!busy&&!recoveryUnknown&&<div className="fault"><span>原操作结果待核查，操作编号已保留。</span><button onClick={()=>void query()}>查询原操作</button><button onClick={()=>pending.current&&void send(pending.current)}>重试原操作</button>{noReceipt&&<button onClick={()=>void recover()}>恢复最近记录并重新核对</button>}</div>}
    <div className="contextbar"><strong>R／W · H—A—B</strong><span>{view.scenario_kind==='play_outcome'?'取得两处记录，组织两组返回总部、交付并等待核验回报。':'取得两处记录并等待合法回报；本批不包含返程、交接或整局结局。'}</span></div>
    <div className="shell"><nav className="rail"><button className="active" onClick={()=>document.getElementById('intelligence-sources')?.focus()}>情报报告</button><button onClick={()=>document.getElementById('intelligence-history')?.focus()}>当时所知</button><button disabled={blocked} onClick={()=>void (async()=>{if(!view.paused){await control({kind:'pause',reason:'manual'});if(!current.current.paused)return;}await onLeave();})()}>更换演练任务</button></nav>
    <main className="main"><div className="workspacebar"><h1>{view.scenario_kind==='play_outcome'?'返回与交付任务':'情报与协作任务'}</h1><span className="outline-tag">总部视图 · {verificationCopy}</span></div>
      {!outcomeFrame&&operationStatus}
      <div className={"workbody mission-body"+(activeGroup?" intel-layout workspace-report":"")}>{activeGroup?reportWorkspace:<><MapView view={view} selected={selected} onSelect={setSelected} planned={false} displaySession={history?undefined:displaySession}/>
      <aside id="intelligence-sources" tabIndex={-1} className="intelligence-sources" aria-label="总部已收原始资料">
        {outcomeFrame&&operationStatus}
        <section className={"current-action"+(view.preparation.status==='approved'?" current-action-field":"")+(view.artifact_reports.length>=2?" current-action-return":"")} aria-label="当前行动"><h2 id="current-action-heading" tabIndex={-1}>当前行动</h2>{error==='STALE_REVISION'&&rejection?.run_id===view.run_id&&!history&&!pending.current&&!hasStorageFault&&!recoveryUnknown&&!restartPending&&<div className="rejection-context"><p>本次{rejection.operation}未提交；情况记录已更新。</p><button disabled={busy} onClick={()=>setRecheckOpen(true)}>查看本次提交与当前依据</button>{recheckOpen&&<section className="rejection-review" aria-label="本次拒绝复核"><h3>本次被拒绝的提交</h3><p>{rejection.operation}：{rejection.submitted}</p><h3>当前总部已知资料</h3><p>{view.plan?'已保存草案第'+view.plan.ref.version+'版：'+view.plan.purpose:'草案尚未保存'}</p><p>{view.source_groups.length?'已有原文与递交可通过“查看当前已收资料”阅读；不据递交次数判断独立来源。':'尚未收到原文；当前来源依据不明。'}</p><p>{view.next_action}</p><p>资料仍会变化；查看不等于批准、保存或保证下次提交成功。新尝试仍需明确操作。</p><button onClick={()=>{setRecheckOpen(false);if(rejection.kind==='save_plan')purposeInput.current?.focus();else (document.getElementById(rejectedControl.current??'')??document.getElementById('current-action-heading'))?.focus();}}>{rejection.kind==='save_plan'?'返回准备编辑':'返回当前操作'}</button></section>}</div>}
        <section data-testid="intelligence-plan"><h3>准备草案</h3>{outcomeFrame&&<button id="current-action-source-return" disabled={busy||view.source_groups.length===0} onClick={()=>{const group=view.source_groups[0];if(!group)return;sourceReturn.current={id:"current-action-source-return",scrollTop:document.getElementById("intelligence-sources")?.scrollTop??0};setExpanded([group.report_ref.id]);}}>查看当前已收资料</button>}<label>准备目的<textarea ref={purposeInput} aria-label="准备目的" value={purpose} disabled={blocked||primaryStopped} maxLength={2000} onChange={event=>setPurpose(event.target.value)}/></label><button disabled={blocked||primaryStopped||!purpose.trim()} onClick={()=>void savePlan()}>保存准备草案</button>{view.plan?<><p>草案第{view.plan.ref.version}版 · {view.plan.purpose}。{preparationCopy}</p>{view.preparation.status==='not_requested'&&deadlineGap('preparation')}<button id="current-preparation-submit" disabled={blocked||primaryStopped||purpose!==view.plan.purpose||view.preparation.status!=='not_requested'} onClick={()=>void requestPreparation()}>提交准备申请</button>{purpose!==view.plan.purpose&&<p>当前编辑尚未保存；请先保存再申请。</p>}</>:<p>草案尚未保存。编辑与保存均不代替准备申请。</p>}</section>
        <section data-testid="intelligence-field"><h2>逐次下达现场指令</h2><p>每次只下达一个阶段；签发后等待接令与终态回报。</p>{view.field_options.map(option=><div key={option.intent.activity_ref.id}><button id={'field-action-'+option.intent.activity_ref.id} disabled={blocked||primaryStopped||!option.available} onClick={()=>void issueActivity(option.intent)}>下达{option.label}</button>{option.available&&option.estimated_complete_at>view.public_rules.deadline&&<p>{option.label}：按总部最后确认的负载和注册工时估计，若现在签发，预计晚于实体截止{option.estimated_complete_at-view.public_rules.deadline}毫秒；仍可尝试，截止时仅结算已做工作。</p>}{option.missing.length>0&&<p>{option.label}：{option.missing.join('；')}</p>}</div>)}{view.field_activities.map(order=><p key={order.ref.id}>{view.field_options.find(o=>o.intent.activity_ref.id===order.activity)?.label} · {({issued:'已签发，等待接令回报',accepted:'接令回报已收到，等待终态回报',completed:'完成回报已收到',refused:'当地条件受阻回报已收到',cutoff:'截止回报已收到'})[order.status]} · 签发 {clock(order.issued_at)}</p>)}</section>
        <div className="current-action-outcome">{outcomeSlot}</div></section><section data-testid="intelligence-target"><h2>{view.scenario_kind==='play_outcome'?'目标：取得A／B记录并组织交付':'本批目标：取得A／B记录的现场回报'}</h2><p>实体截止{clock(view.public_rules.deadline)}；截止后{view.public_rules.receipt_grace/1000}秒只接收既有回报，不延长作业时间。</p>{['A','B'].map(site=><p key={site}>{site}：{view.artifact_reports.some(r=>r.report.artifact!.site===site)?'回报称现场已生成':'等待成果回报'}</p>)}<p>{view.scenario_kind==='play_outcome'?'收到采集回报后，还须分别确认返回交付。各组到达后分批接收，不必等另一组；核验结果以总部收到的回报为准。':'收到两处回报只完成本批采集里程碑；记录仍须保管，返程、交接与整局结局留待后续。'}</p></section>
        <section data-testid="intelligence-artifacts"><h3>成果回报</h3>{view.artifact_reports.length===0?<p>等待成果回报；当地发生与总部收到分开记录。</p>:view.artifact_reports.map(({report,delivery})=><p key={delivery.ref.id}>{report.artifact!.site} · 回报称现场已生成 · 当地 {clock(report.artifact!.created_at)} · 总部收到 {clock(delivery.received)}。保管方{report.artifact!.custody_holder}；尚未交接或终局核验。</p>)}</section>
        <section role="region" aria-label="总部最后确认的编组"><h2>最后确认的编组</h2>{view.actors.map(a=><div key={a.actor}><h3>{a.actor} · {a.role==='record_keeper'?'记录组':'作业组'} · {a.people}人</h3><p>确认于 {clock(a.confirmed_at)} · {a.position_scope} · 负重 {a.load}／{a.load_capacity} · 空间 {a.space}／{a.space_capacity}</p><p>{a.actor==='R'?'记录':'维修'}能量 {a.equipment_energy} · 耐久 {a.durability} · {a.actor==='R'?'记录':'维修'}包 {a.packs}</p>{a.link&&<p>便携联络能量 {a.link.energy} · 耐久 {a.link.durability}</p>}</div>)}</section>
        <section role="region" aria-label="总部已知的任务前提"><h3>已知任务前提</h3><p>{view.repair_condition.site}{view.repair_condition.status==='required'?'需维修 · 开局公开条件':'维修完成回报已收到'} · 确认于 {clock(view.repair_condition.confirmed_at)}。</p><p>{verificationCopy}；B处记录还须携带已收维修凭证。</p></section>
        <section data-testid="intelligence-processing"><h3>一个处理席位</h3><p>开局已接受工作占用至 {clock(view.processing.initial_occupied_until)}。处理能量最后确认 {view.processing.energy_confirmed} · 已预留 {view.processing.energy_reserved}；产品须等待合法递交。</p>{view.processing.queue.map(item=><p key={item.ref.id}>{item.kind==="preparation"?"准备":"核实"}{item.status==='queued'?'待处理':item.status==='running'?'中':item.status==='completed'?'工作完成，产品另行递交':'已截止'} · 已做 {item.work_done_ms/1000}／{item.work_required_ms/1000} 秒{item.started_at!==null?' · 开始 '+clock(item.started_at):''}</p>)}</section>
        <section data-testid="intelligence-assessments"><h3>已收核实结论</h3>{view.assessments.length===0?<p>尚未收到核实产品；收到原文不等于核实。</p>:view.assessments.map(({assessment,delivery})=><p key={assessment.ref.id}>{assessment.conclusion.value==='green'?'绿色':'蓝色'}凭证已核实 · 完成 {clock(assessment.completed_at)} · 收到 {clock(delivery.received)}。原文保留，不据此增加独立来源数。</p>)}</section>
        <section data-testid="intelligence-supply-commitments"><h3>总部已确认的用品计划预约</h3>{view.supply_commitments.length===0?<p>尚无已收到的用品预约；入队不会独占W的维修包。</p>:view.supply_commitments.map(r=><p key={r.ref.id}>W 维修包 · 总部计划已预留 {r.quantity} · 第{r.plan_ref.version}版 · 生成于 {clock(r.from)}。这不是当地实际预约或用品消耗。</p>)}</section>
        {view.preparation_results.length>0&&<section><h3>已收准备决定</h3>{view.preparation_results.map(({result,delivery})=><p key={result.ref.id}>第{result.plan_ref.version}版 · {result.purpose} · {result.status==='approved'?'批准已收到':'用品与已有承诺不足，未批准'} · 完成 {clock(result.completed_at)} · 收到 {clock(delivery.received)}</p>)}</section>}
        <h2>已收原始资料</h2><p>蓝色凭证{view.access.blue==='verified'?'已核实':'待核实'} · 绿色凭证{view.access.green==='verified'?'已核实':'待核实'}；转发次数不等于独立来源数。</p>
        {view.source_groups.length===0&&<p>尚未收到原文。总部没有当前源时点或现场采集进展。</p>}
        {view.source_groups.map(sourceArticle)}
        {outcomeFrame&&historyControls}
      </aside></>}</div>
      {outcomeFrame?.records}
      {!outcomeFrame&&historyControls}
    </main></div>
    {outcomeFrame?.footer}
  </div>;
}
