import {useEffect,useRef,useState} from 'react';
import type {KnowledgeCollectionPlayerView,KnowledgeCollectionIntent,KnowledgeCollectionEnvelope,CollectionActor,CollectionRef} from './knowledge-collection-contracts';
import type {GamePlayerView} from './play-contracts';
import type {Transport,Response} from './transport';
import {HeadquartersWorkspace} from './intelligence-workbench';
import {HeadquartersFooter} from './outcome-workbench';
import {IntegratedFieldMap,type IntegratedFieldMapView} from './integrated-field-map';
import type {RegionalDisplaySession} from './regional-display';
import {clock,error_copy} from './player-copy';
import {KnowledgeCollectionReading,collectionReportTitle,collectionTimeLabel} from './knowledge-collection-reading';
import {Dialog} from './dialog';

type Props={view:KnowledgeCollectionPlayerView;transport:Transport;adopt:(view:GamePlayerView)=>void;onNewRun:(view:KnowledgeCollectionPlayerView)=>void;history:boolean;onHistory:(value:boolean)=>void;liveRunId:string|null;onLeave:()=>Promise<void>;displaySession?:RegionalDisplaySession;channelError:string;storageFault:boolean;onStorageRecovered:()=>void};
export function KnowledgeCollectionWorkbench({view,transport,adopt,onNewRun,history,onHistory,liveRunId,onLeave,displaySession,channelError,storageFault:parentStorageFault,onStorageRecovered}:Props){
  const current=useRef(view),mounted=useRef(true),inFlight=useRef(false),pending=useRef<KnowledgeCollectionEnvelope|null>(null),pausePending=useRef<Promise<boolean>|null>(null);current.current=view;
  const [busy,setBusy]=useState(false),[operationUncertain,setUncertain]=useState(false),[pauseUncertain,setPauseUncertain]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[selected,setSelected]=useState<'R'|'W'|'H'|'A'|'B'>('R');
  const uncertain=operationUncertain||pauseUncertain;
  const [localStorageFault,setLocalStorageFault]=useState(false),[noReceipt,setNoReceipt]=useState(false),[recoveryUnknown,setRecoveryUnknown]=useState(false);
  const storageFault=parentStorageFault||localStorageFault,recovery=useRef<{run_id:string;operation_id:string}|null>(null),retainedInput=useRef<KnowledgeCollectionEnvelope|null>(null);
  const [advanceTo,setAdvanceTo]=useState('32');
  const historyNow=useRef(history);historyNow.current=history;
  const nodes=useRef(view.replay_nodes);if(!history)nodes.current=view.replay_nodes;
  const [historyNode,setHistoryNode]=useState(String(view.revision)),historyOrigin=useRef<HTMLButtonElement|null>(null),restoreHistoryFocus=useRef(false);
  const [conclusion,setConclusion]=useState<'unconfirmed'|'operable'|'faulted'>('unconfirmed'),[reason,setReason]=useState(''),[basis,setBasis]=useState<string[]>([]);
  const [savedDraft,setSavedDraft]=useState(JSON.stringify({conclusion:'unconfirmed',reason:'',basis:[]})),[confirm,setConfirm]=useState<'leave'|'terminate'|'restart'|null>(null),[cancelled,setCancelled]=useState<string[]>([]);
  const restartOperation=useRef<string|null>(null);
  async function restart(){
    if(historyNow.current||inFlight.current||pending.current||pausePending.current||storageFault||recovery.current)return;
    inFlight.current=true;setBusy(true);setError('');const run=current.current.run_id,operation_id=restartOperation.current??crypto.randomUUID();restartOperation.current=operation_id;
    try{const response=await transport.request({kind:'restart',run_id:run,operation_id});if(!mounted.current||current.current.run_id!==run)return;if(response.ok&&response.view?.scenario_kind==='play_knowledge_collection'&&response.view.source_run===run&&response.view.run_id!==run){onNewRun(response.view);}else{setError(response.ok?'CHANNEL_UNCERTAIN':response.code);setUncertain(true);}}catch{if(mounted.current){setError('CHANNEL_UNCERTAIN');setUncertain(true);}}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  const leaveOrigin=useRef<HTMLButtonElement|null>(null),terminateOrigin=useRef<HTMLButtonElement|null>(null),restartOrigin=useRef<HTMLButtonElement|null>(null),dialogCancel=useRef<HTMLButtonElement|null>(null),dialogReturn=useRef<{origin:HTMLButtonElement|null;scroll:number}|null>(null);
  useEffect(()=>{if(confirm)dialogCancel.current?.focus();else if(dialogReturn.current){const restore=dialogReturn.current;dialogReturn.current=null;restore.origin?.focus({preventScroll:true});if(side.current)side.current.scrollTop=restore.scroll;}},[confirm]);
  function openConfirm(action:'leave'|'terminate'|'restart'){dialogReturn.current={origin:action==='leave'?leaveOrigin.current:action==='restart'?restartOrigin.current:terminateOrigin.current,scroll:side.current?.scrollTop??0};setConfirm(action);}
  function rememberIntent(intent:KnowledgeCollectionIntent){
    if(intent.kind==='record_collection_assessment')setSavedDraft(JSON.stringify({conclusion:intent.conclusion,reason:intent.reason??'',basis:intent.basis_refs.map(ref=>ref.id).sort()}));
    if(intent.kind==='cancel_collection')setCancelled(old=>[...old,intent.request_ref.id]);
  }
  const dirty=JSON.stringify({conclusion,reason,basis:[...basis].sort()})!==savedDraft;
  function cancelConfirm(){setConfirm(null);}
  useEffect(()=>{if(!history&&restoreHistoryFocus.current){restoreHistoryFocus.current=false;historyOrigin.current?.focus({preventScroll:true});}},[history]);
  async function readHistory(back=false){
    if(inFlight.current||pausePending.current||pending.current||recovery.current||storageFault)return;
    inFlight.current=true;setBusy(true);setError('');
    const run=liveRunId??current.current.run_id;
    try{
      const response=await transport.request(back?{kind:'current',run_id:run}:{kind:'replay',run_id:run,to:0,node_revision:Number(historyNode)});
      if(!mounted.current)return;
      if(response.ok&&response.view?.scenario_kind==='play_knowledge_collection'&&response.view.run_id===run){if(back)restoreHistoryFocus.current=true;onHistory(!back);adopt(response.view);}
      else setError(response.ok?'CHANNEL_UNCERTAIN':response.code);
    }catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  async function readParent(){
    if(historyNow.current||inFlight.current||pausePending.current||pending.current||recovery.current||storageFault||!current.current.source_run)return;
    inFlight.current=true;setBusy(true);const active=current.current;
    try{const response=await transport.request({kind:'previous',run_id:active.run_id});if(!mounted.current)return;if(response.ok&&response.view?.scenario_kind==='play_knowledge_collection'&&response.view.run_id===active.source_run&&response.view.read_only){onHistory(true);adopt(response.view);}else setError(response.ok?'CHANNEL_UNCERTAIN':response.code);}catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  const [reportId,setReportId]=useState<string|null>(null),[reportWorkspaceOpen,setReportWorkspaceOpen]=useState(false),reportOrigin=useRef<HTMLButtonElement|null>(null),side=useRef<HTMLElement|null>(null),returnScroll=useRef(0),returnPending=useRef(false);
  useEffect(()=>{if(reportWorkspaceOpen||!returnPending.current)return;returnPending.current=false;const origin=reportOrigin.current;if(origin?.isConnected&&!origin.disabled)origin.focus({preventScroll:true});else document.getElementById('ka-current-action-heading')?.focus({preventScroll:true});if(side.current)side.current.scrollTop=returnScroll.current;},[reportWorkspaceOpen]);
  function openReports(origin:HTMLButtonElement){if(!reportWorkspaceOpen){reportOrigin.current=origin;returnScroll.current=side.current?.scrollTop??0;}setReportWorkspaceOpen(true);}
  function openReport(id:string,origin:HTMLButtonElement){openReports(origin);setReportId(id);}
  function closeReport(){returnPending.current=true;setReportWorkspaceOpen(false);setReportId(null);}
  function showKnown(){returnPending.current=false;setReportWorkspaceOpen(false);setReportId(null);requestAnimationFrame(()=>document.getElementById('ka-history')?.focus());}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  function accept(response:Response,run=current.current.run_id){
    if(!mounted.current||current.current.run_id!==run||!response.ok||response.view?.scenario_kind!=='play_knowledge_collection'||response.view.run_id!==run)return false;
    if(response.view.revision>=current.current.revision)adopt(response.view);return true;
  }
  async function pause(reason:'manual'|'focus_lost'|'application_hidden'){
    if(pausePending.current)return pausePending.current;
    const run=current.current.run_id;setBusy(true);
    const work=(async()=>{try{
      const response=await transport.request({kind:'management_pause',reason});
      if(accept(response,run)&&response.ok&&response.view?.paused){setPauseUncertain(false);if(!pending.current&&!restartOperation.current)setError('');setNote('暂停已确认；请明确继续。');return true;}
      if(mounted.current&&current.current.run_id===run){setError(response.ok?'CHANNEL_UNCERTAIN':response.code);setPauseUncertain(true);}return false;
    }catch{if(mounted.current&&current.current.run_id===run){setError('CHANNEL_UNCERTAIN');setPauseUncertain(true);}return false;}
    finally{pausePending.current=null;if(mounted.current)setBusy(inFlight.current);}})();pausePending.current=work;return work;
  }
  useEffect(()=>{
    const lost=()=>{if(!historyNow.current&&current.current.mode==='command'&&(!current.current.paused||pending.current?.intent.kind==='continue'))void pause(document.hidden?'application_hidden':'focus_lost');};
    const hidden=()=>{if(document.hidden)lost();};window.addEventListener('blur',lost);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',lost);document.removeEventListener('visibilitychange',hidden);};
  },[transport]);
  async function control(intent:KnowledgeCollectionIntent){
    if(historyNow.current||inFlight.current||pausePending.current||pending.current||storageFault||recovery.current)return;
    setNoReceipt(false);
    const active=current.current,envelope={run_id:active.run_id,operation_id:crypto.randomUUID(),expected_revision:active.revision,intent};pending.current=envelope;inFlight.current=true;setBusy(true);setError('');
    try{
      const response=await transport.request({kind:'operate_knowledge_collection',envelope});
      if(!mounted.current||current.current.run_id!==envelope.run_id)return;
      if(response.ok&&response.receipt?.run_id===envelope.run_id&&response.receipt.operation_id===envelope.operation_id&&response.receipt.kind===intent.kind&&accept(response,envelope.run_id)){
        pending.current=null;rememberIntent(intent);setUncertain(false);setNote(intent.kind==='save'?'当前记录已保存。':'操作已登记；以实际收到的回报确认进展。');
        if(intent.kind==='save'&&displaySession?.run===envelope.run_id)void displaySession.save(response.receipt.revision);
      }else if(!response.ok){
        setError(response.code);const unknown=['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(response.code);setUncertain(unknown);if(['STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(response.code))setLocalStorageFault(true);if(!unknown)pending.current=null;
      }else{setError('CHANNEL_UNCERTAIN');setUncertain(true);}
    }catch{if(mounted.current){setError('CHANNEL_UNCERTAIN');setUncertain(true);}}
    finally{inFlight.current=false;if(mounted.current)setBusy(!!pausePending.current);}
  }
  async function queryOriginal(){
    const original=pending.current;if(!original||inFlight.current)return;inFlight.current=true;setBusy(true);
    try{
      const response=await transport.request({kind:'receipt',run_id:original.run_id,operation_id:original.operation_id});
      if(!mounted.current||current.current.run_id!==original.run_id)return;
      if(response.ok&&response.receipt?.run_id===original.run_id&&response.receipt.operation_id===original.operation_id&&response.receipt.kind===original.intent.kind){
        const context=response.view?response:await transport.request({kind:'view',run_id:original.run_id});
        if(accept(context,original.run_id)){pending.current=null;rememberIntent(original.intent);setUncertain(false);setError('');setNote('原操作已确认，未重复发送。');if(original.intent.kind==='save'&&displaySession?.run===original.run_id)void displaySession.save(response.receipt.revision);}
        else setNote('原收据已找到，当前记录尚未确认；编号与输入仍保留。');
      }else{if(response.ok&&!response.receipt)setNoReceipt(true);setNote(response.ok?'尚未查到原操作；编号与输入仍保留。':error_copy(response.code));}
    }catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(mounted.current)setBusy(!!pausePending.current);}
  }
  function finishRecovery(response:Response,original:{run_id:string;operation_id:string}){
    if(!mounted.current||historyNow.current||current.current.run_id!==original.run_id)return;
    if(response.ok&&response.receipt?.run_id===original.run_id&&response.receipt.operation_id===original.operation_id&&response.receipt.kind==='restore'&&Number.isSafeInteger(response.receipt.snapshot_revision)&&response.view?.paused&&accept(response,original.run_id)){
      retainedInput.current=pending.current;pending.current=null;recovery.current=null;setRecoveryUnknown(false);setLocalStorageFault(false);setNoReceipt(false);setUncertain(false);setPauseUncertain(false);setError('');onStorageRecovered();setNote('最近记录已恢复并保持暂停；原输入已保留，原业务未再次发送。');
    }else setError(response.ok?'CHANNEL_UNCERTAIN':response.code);
  }
  async function recover(){
    if(historyNow.current||inFlight.current||pausePending.current||recovery.current||pending.current&&!noReceipt)return;
    const original={run_id:current.current.run_id,operation_id:crypto.randomUUID()};recovery.current=original;setRecoveryUnknown(true);inFlight.current=true;setBusy(true);
    try{finishRecovery(await transport.request({kind:'takeover',...original}),original);}catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(mounted.current)setBusy(!!pausePending.current);}
  }
  async function queryRecovery(){
    const original=recovery.current;if(historyNow.current||!original||inFlight.current)return;inFlight.current=true;setBusy(true);
    try{const result=await transport.request({kind:'receipt',...original});if(!mounted.current||current.current.run_id!==original.run_id)return;if(!result.ok){setError(result.code);return;}if(result.receipt?.run_id!==original.run_id||result.receipt.operation_id!==original.operation_id||result.receipt.kind!=='restore'){setNote('恢复尚无确定回执，原恢复编号与输入保留。');return;}const fresh=await transport.request({kind:'view',run_id:original.run_id});finishRecovery(fresh.ok?{...fresh,receipt:result.receipt}:fresh,original);}catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(mounted.current)setBusy(!!pausePending.current);}
  }
  const ref=<K extends string>(kind:K,id:string):CollectionRef<K>=>({run_id:view.run_id,kind,id,version:1});
  function collect(actor:CollectionActor){
    void control({kind:'request_collection',actor,question_ref:ref('question','B-condition'),target_ref:ref('facility','B'),scope_ref:ref('scope',actor==='R'?'B-LIMITED':'B-QUALIFIED'),method_ref:ref('method',actor==='R'?'limited-text-collection':'qualified-facility-inspection'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:[ref('briefing','KA-BRIEF-INITIAL-'+actor)],collection_window:actor==='R'?{from:1000,to:31000}:{from:60000,to:91000},needed_by:900000,...(actor==='R'&&view.case_ref==='KA-SOURCE3-01'?{delivery_copies:3 as const}:{})});
  }
  const p=view.geometry.points,points:IntegratedFieldMapView['geometry']['points']={H:[p.H[0],p.H[1]],A:[p.A[0],p.A[1]],B:[p.B[0],p.B[1]]};
  // Presentation bounds/line lengths derive only from the lawful public points.
  // They add no movement parameters, private positions or simulation facts.
  const geometry:IntegratedFieldMapView['geometry']={id:'ka-public-hab-display-1',version:1,unit:'m',metres_per_coordinate:1,extent:[Math.max(...Object.values(points).map(point=>point[0]))+150,Math.max(...Object.values(points).map(point=>point[1]))+150],points,segments:[{id:'HA',length_m:Math.hypot(points.A[0]-points.H[0],points.A[1]-points.H[1])},{id:'AB',length_m:Math.hypot(points.B[0]-points.A[0],points.B[1]-points.A[1])}]};
  const map:IntegratedFieldMapView={run_id:view.run_id,revision:view.revision,geometry,actors:view.actors.map((actor):IntegratedFieldMapView['actors'][number]=>({id:actor.id,position:{point:[actor.position.point[0],actor.position.point[1]],received_at:actor.position.received_at}}))};
  const stopped=history||busy||uncertain||storageFault||recoveryUnknown,canIssue=!stopped&&view.can_issue;
  const advanceMillis=Math.round(Number(advanceTo)*1000),canAdvance=advanceTo.trim()!==''&&Number.isSafeInteger(advanceMillis)&&advanceMillis>=view.sim_time&&advanceMillis<=1222000&&!view.finished&&!stopped;
  const requestStatus={tasking:'等待接令回报',collecting:'采集中',processing:'等待结果递交',inconclusive:'资料仍不足',answered:'已有答复',expired:'需求已超期',cancelled:'已撤回'};
  const outcomeCopy={success:'成功',partial:'部分完成',aborted:'已中止',failure:'未完成目标'};
  const clockStatus=history?'历史记录 · 只读':view.finished?'已结束':view.mode==='research'?'手动推进':view.paused?'已暂停':'时间推进中';
  const timeControls=!history&&view.mode==='command'&&!view.finished?<><label>推进速度<select aria-label="推进速度" value={view.rate} disabled={stopped} onChange={event=>void control({kind:'rate',rate:Number(event.target.value) as 1|2|4})}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select></label>{view.paused?<button disabled={stopped} onClick={()=>void control({kind:'continue'})}>明确继续</button>:<button disabled={busy} onClick={()=>void pause('manual')}>暂停行动</button>}</>:null;
  const headingSummary=<>总部视图 · {view.mode==='command'?'指挥时间':'研究时间'}{view.result&&<span data-testid="collection-outcome-summary"> · {outcomeCopy[view.result.outcome]} · 已确认安全 {view.result.safe_people} 人</span>}</>;
  const reports=[...view.reports,...view.process_reports,...(view.termination?.cleanup_reports??[])],material=reports.find(report=>report.ref.id===reportId),deliveries=[...view.deliveries,...view.process_deliveries,...(view.termination?.cleanup_deliveries??[])];
  const surveyReceipt=view.deliveries.map(delivery=>delivery.archive_read_receipt).find(receipt=>receipt?.entry==='survey');
  function readArchive(entry:'survey'|'revocation'|'contradiction'){void control({kind:'request_archive_read',actor:'R',entry,method_ref:ref('method','B-archive-read'),authority_ref:ref('authority','KA-INITIAL'),forward_credentials:'defer'});}
  async function leave(){if(busy||uncertain||storageFault||recovery.current)return;if(!history&&!current.current.paused&&!await pause('manual'))return;await onLeave();}
  const reportList=<section aria-label="已收原文"><h3>已收原文</h3>{reports.length===0?<p>尚无已收原文。</p>:reports.map((report,index)=>{const title=collectionReportTitle(report),duplicates=reports.filter(item=>collectionReportTitle(item)===title);return <button key={report.ref.id} onClick={event=>openReport(report.ref.id,event.currentTarget)}>查看 {title}{duplicates.length>1?' · 第 '+(index+1)+' 份':''}</button>;})}</section>;
  return <div className="app mission-app integrated-workbench"><header className="topbar"><strong>玄枢行动</strong><span className="demo-badge">文字资料</span><span>虚构演练</span><span aria-label="行动时间">{clock(view.sim_time)}</span><span>{clockStatus}</span>{timeControls}<button disabled={stopped} onClick={()=>void control({kind:'save'})}>保存当前记录</button></header>
    <p role="status">{view.next_action}{!view.finished&&note&&<span> · {note}</span>}</p>
    {(error||channelError)&&<p role="alert">{error_copy(error||channelError)}</p>}{(pauseUncertain||operationUncertain&&view.mode==='command')&&<div className="fault">{pauseUncertain&&<p>暂停尚未得到确认，请核对实际暂停状态。</p>}<button disabled={busy||history} onClick={()=>void pause('manual')}>核对暂停状态</button></div>}{operationUncertain&&pending.current&&<div className="fault"><p>操作结果尚未确认；保留原输入，先查询原操作。</p><button disabled={busy} onClick={()=>void queryOriginal()}>查询原操作</button></div>}
    {!history&&!recoveryUnknown&&(noReceipt||storageFault&&!pending.current)&&<button disabled={busy} onClick={()=>void recover()}>恢复最近记录并重新核对</button>}{recoveryUnknown&&<div className="fault"><p>恢复结果待确认，原恢复编号与输入已保留。</p><button disabled={busy} onClick={()=>void queryRecovery()}>查询恢复结果</button></div>}{retainedInput.current&&<p>恢复前的原操作输入已保留，未再次执行。</p>}
    <HeadquartersWorkspace heading="文字采集与知识" summary={headingSummary} context={<><strong>R／W · H—A—B</strong><span>文字资料；媒体附件暂不支持</span></>} navigation={<><strong>总部</strong><button onClick={event=>openReports(event.currentTarget)}>情报报告</button><button onClick={showKnown}>当时所知</button><button ref={leaveOrigin} disabled={busy||uncertain||storageFault} onClick={()=>{if(dirty)openConfirm('leave');else void leave();}}>{history?'返回演练列表':'更换演练任务'}</button></>} footer={<HeadquartersFooter/>}>
    <div className={'workbody mission-body'+(reportWorkspaceOpen?' integrated-report-workspace':'')}><div className="intelligence-live-workspace" hidden={reportWorkspaceOpen} style={{display:reportWorkspaceOpen?'none':'contents'}}><IntegratedFieldMap view={map} selected={selected} onSelect={setSelected} displaySession={history?undefined:displaySession}/><aside ref={side} className="intelligence-sources" aria-label="文字采集工作台">
      <section className="current-action" aria-label="当前行动"><h2 id="ka-current-action-heading" tabIndex={-1}>当前行动</h2><p>当前对象：{selected}；地图显示总部最后确认的位置。</p><p>{view.gap}</p>
      <button disabled={!canIssue} onClick={()=>collect('R')}>请求 R 采集</button><button disabled={!canIssue} onClick={()=>collect('W')}>请求 W 检查</button>
      <p>采集窗口：R 为第 1—31 秒，W 为第 60—91 秒；当地是否开始及完成，以收到的回报为准。</p>
      <button disabled={!canIssue} onClick={()=>void control({kind:'return_to_headquarters',actor:'R',authority_ref:ref('authority','KA-INITIAL')})}>安排 R 返回</button><button disabled={!canIssue} onClick={()=>void control({kind:'return_to_headquarters',actor:'W',authority_ref:ref('authority','KA-INITIAL')})}>安排 W 返回</button>
      {view.mode==='research'&&<section aria-label="研究时间"><label>推进至（秒）<input aria-label="推进至（秒）" type="number" min={view.sim_time/1000} max={1222} step="0.001" value={advanceTo} onChange={event=>setAdvanceTo(event.target.value)}/></label><button disabled={!canAdvance} onClick={()=>void control({kind:'advance',to:advanceMillis})}>推进时间</button></section>}
      {view.collection_requests.map(request=><div key={request.ref.id}><p>{request.actor} · {requestStatus[request.status]}</p>{!['answered','expired','cancelled'].includes(request.status)&&<button disabled={!canIssue||cancelled.includes(request.ref.id)} onClick={()=>void control({kind:'cancel_collection',request_ref:request.ref,authority_ref:ref('authority','KA-INITIAL')})}>请求撤回 {request.actor} 采集</button>}{request.local_receipt&&<p>未发送前本地撤回；没有创建远端任务。</p>}</div>)}
      <button ref={terminateOrigin} disabled={!canIssue} onClick={()=>openConfirm('terminate')}>终止本次任务</button>
      {reportList}
      <section aria-label="当前设施认知"><h3>当前设施认知</h3>{view.facility_knowledge?<p>观察时设施可用 · 观察 {clock(view.facility_knowledge.observed_at)} · 总部收到 {clock(view.facility_knowledge.received_at)}</p>:<p>尚未确认；有限资料不等于设施故障。</p>}{view.correction_records.map(record=><p key={record.ref.id}>认知修正登记于 {clock(record.recorded_at)}，原研判仍保留。</p>)}</section>
      <section aria-label="研判草稿"><h3>研判草稿</h3><p>研判由总部明确保存；后到资料不改写已存判断。历史回看时保留当前草稿。</p><label>设施状况研判<select aria-label="设施状况研判" value={conclusion} disabled={stopped} onChange={event=>setConclusion(event.target.value as typeof conclusion)}><option value="unconfirmed">尚未确认</option><option value="operable">观察时可用</option><option value="faulted">判断故障</option></select></label>{view.reports.map(report=><label key={report.ref.id}><input type="checkbox" aria-label={'依据：'+collectionReportTitle(report)} checked={basis.includes(report.ref.id)} disabled={stopped} onChange={event=>setBasis(old=>event.target.checked?[...old,report.ref.id]:old.filter(id=>id!==report.ref.id))}/>{collectionReportTitle(report)}</label>)}<label>研判理由（可选）<textarea aria-label="研判理由（可选）" maxLength={2000} value={reason} disabled={stopped} onChange={event=>setReason(event.target.value)}/></label><button disabled={stopped||!basis.some(id=>view.reports.some(report=>report.ref.id===id))} onClick={()=>void control({kind:'record_collection_assessment',field:'B.condition',conclusion,basis_refs:view.reports.filter(report=>basis.includes(report.ref.id)).slice(0,10).map(report=>report.ref),...(reason.trim()?{reason}:{})})}>保存研判</button></section>
      <section aria-label="已保存研判"><h3>已保存研判</h3>{view.assessments.map(assessment=><p key={assessment.ref.id}>{clock(assessment.recorded_at)} · {assessment.conclusion==='unconfirmed'?'尚未确认':assessment.conclusion==='operable'?'观察时可用':'判断故障'} · {assessment.reason.kind==='recorded'?assessment.reason.text:'未记录理由'} · 依据 {assessment.basis_refs.length} 份</p>)}</section>
      <section aria-label="公开来源关系"><h3>公开来源关系</h3><p>内容递交 {view.source_relationships.content_delivery_count} 次 · 原文身份 {view.source_relationships.report_identity_count} 份</p><p>{view.source_relationships.global_independence.kind==='unknown'?'独立来源：未知':'已证明独立来源：'+view.source_relationships.global_independence.count}</p><p>副本、相同文字和原文数量均不证明来源独立。</p>{view.source_relationships.confirmed_pairs.map(pair=><p key={pair.credential_ref.id}>公开凭证 {pair.credential_ref.id} · 范围 {pair.scope.id} v{pair.scope.version} · {pair.status==='valid'?'有效':'已失效，原历史保留'}</p>)}{view.case_ref==='KA-SOURCE3-01'&&<><button disabled={!canIssue||view.archive_requests.some(request=>request.entry==='survey')} onClick={()=>readArchive('survey')}>请求 R 读取历史调查</button><button disabled={!canIssue||!surveyReceipt?.available_credential_roles.length} onClick={()=>{if(surveyReceipt)void control({kind:'forward_source_credential',actor:'R',recipient:'HQ',reader_request_ref:surveyReceipt.request_ref,credential_roles:surveyReceipt.available_credential_roles,authority_ref:ref('authority','KA-INITIAL')});}}>请 R 转发已读来源凭证</button>{(['revocation','contradiction'] as const).map(entry=><button key={entry} disabled={!canIssue||view.archive_requests.some(request=>request.entry===entry)} onClick={()=>readArchive(entry)}>请求读取{entry==='revocation'?'撤销':'冲突'}通知</button>)}{view.archive_requests.map(request=><p key={request.ref.id}>档案读取 · {request.status}{request.terminal_receipt?' · '+request.terminal_receipt.outcome:''}</p>)}{view.source_forward_requests.map(request=><p key={request.ref.id}>来源转发 · {request.status}{request.receipt?' · '+request.receipt.outcome:''}</p>)}</>}</section>
      <section aria-label="总部资料加工"><h3>总部资料加工</h3><p>资料准备、文字加工和逐件核验共用情报工位；加工不使原观察变新。</p><button disabled={!canIssue} onClick={()=>void control({kind:'request_hq_preparation',method_ref:ref('method','HQ-SOURCE-PREPARATION'),authority_ref:ref('authority','KA-INITIAL')})}>登记总部资料准备</button><button disabled={!canIssue||!basis.some(id=>view.reports.some(report=>report.ref.id===id))} onClick={()=>void control({kind:'request_hq_processing',method_ref:ref('method','HQ-TEXT-PROCESSING'),authority_ref:ref('authority','KA-INITIAL'),basis_refs:view.reports.filter(report=>basis.includes(report.ref.id)).slice(0,10).map(report=>report.ref)})}>加工选定原文</button>{view.hq_work.map(job=><div key={job.ref.id}><p>{job.kind==='preparation'?'资料准备':'文字加工'} · {({queued:'排队中',processing:'处理中',completed:'已完成',cancelled:'已撤回',failed:'未完成'}[job.status])} · 已用 {job.used_ms/1000} 秒</p>{job.status==='queued'&&<button disabled={!canIssue} onClick={()=>void control({kind:'cancel_hq_work',job_ref:job.ref,authority_ref:ref('authority','KA-INITIAL')})}>{job.kind==='processing'?'撤回排队加工':'撤回排队准备'}</button>}</div>)}{view.hq_products.map(product=><div key={product.ref.id}><p>{product.kind==='preparation'?'资料准备完成':'文字加工完成'} · {clock(product.completed_at)}</p>{product.source_observation_times.map((time,index)=><p key={index}>原观察：{collectionTimeLabel(time)}</p>)}{product.limits.map(limit=><p key={limit}>{limit}</p>)}</div>)}</section>
      {view.case_ref==='KA-LATE-POSITION-01'&&<section aria-label="位置资料"><h3>位置资料</h3><p>新位置和旧原文分别递交；迟到旧报告不会倒退当前已知位置。</p><button disabled={!canIssue} onClick={()=>void control({kind:'request_self_position',actor:'R',recipient:'HQ',method_ref:ref('method','self-position-registration'),authority_ref:ref('authority','KA-INITIAL')})}>请求 R 自报当前位置</button><button disabled={!canIssue||!view.collection_requests.some(request=>request.actor==='R')} onClick={()=>{const request=view.collection_requests.find(item=>item.actor==='R');if(request)void control({kind:'forward_position_report',actor:'R',recipient:'HQ',collection_request_ref:request.ref,output_role:'collection_end_self_position',authority_ref:ref('authority','KA-INITIAL')});}}>请 R 转发采集后位置原文</button>{view.position_requests.map(request=><p key={request.ref.id}>位置资料请求 · {request.terminal_receipt?'已收到 '+request.terminal_receipt.outcome:request.acknowledgement?'已收到接令回报':'等待回报'}</p>)}</section>}
      <button ref={restartOrigin} disabled={stopped} onClick={()=>openConfirm('restart')}>同情景另开新局</button>{!history&&view.source_run&&<button disabled={busy||uncertain} onClick={()=>void readParent()}>查看原局记录</button>}{restartOperation.current&&uncertain&&<><p>另开结果尚未确认，保留原操作编号。</p><button disabled={busy||storageFault} onClick={()=>void restart()}>查询原另开结果</button></>}
      <section aria-label="历史回看" id="ka-history" tabIndex={-1}><h3>历史回看</h3><label>历史节点<select aria-label="历史节点" value={historyNode} disabled={busy||uncertain} onChange={event=>setHistoryNode(event.target.value)}>{nodes.current.map(node=><option key={node.revision} value={node.revision}>{clock(node.at)} · {node.label} · #{node.revision}</option>)}</select></label><button ref={historyOrigin} disabled={history||busy||uncertain} onClick={()=>void readHistory()}>查看历史节点</button>{history&&liveRunId&&<button disabled={busy} onClick={()=>void readHistory(true)}>返回当前记录</button>}</section>
      {view.result&&<section aria-label="行动结果"><h3>{outcomeCopy[view.result.outcome]}</h3><p>已确认安全 {view.result.safe_people} 人</p><p>{view.result.missing_records.length?'尚缺记录：'+view.result.missing_records.join('、'):'两份记录目标已确认'}</p>{view.result.limits.map(limit=><p key={limit}>{limit}</p>)}</section>}
      </section></aside></div>{reportWorkspaceOpen&&<><section className="report-list" aria-label="报告列表">{!reportId&&<button onClick={closeReport}>返回当前行动</button>}{reportList}</section><div className="report-detail">{reportId?(material?<KnowledgeCollectionReading report={material} deliveries={deliveries.filter(delivery=>delivery.report_ref.id===material.ref.id)} onClose={closeReport}/>:<section aria-label="原文阅读"><button onClick={closeReport}>返回当前行动</button><p>当前记录中没有这份原文；没有使用较晚资料回填。</p></section>):<p>选择已收到的原文阅读。</p>}</div></>}</div>
    {confirm&&<Dialog title={confirm==='leave'?'保留未提交草稿':confirm==='restart'?'确认另开新局':'确认终止任务'} onClose={cancelConfirm}><h2>{confirm==='leave'?'当前有未提交的研判草稿':confirm==='restart'?'同情景另开新局，原局保留为只读':'终止后将按实际工作状态收整'}</h2><p>{confirm==='leave'?'离开会放弃本页草稿，已保存的行动记录保留。':confirm==='restart'?'新局保留同一情景和随机起源；这是重玩，不是独立首次体验。当前未提交草稿不会带入新局。':'取消终止可继续当前任务；确认后需等待实际收整回报，不会立即算作成功。'}</p><button ref={dialogCancel} onClick={cancelConfirm}>{confirm==='leave'?'留在当前记录':'继续当前任务'}</button><button disabled={busy||uncertain||storageFault} onClick={()=>{const action=confirm;setConfirm(null);if(action==='leave')void leave();else if(action==='restart')void restart();else void control({kind:'terminate_task',authority_ref:ref('authority','KA-INITIAL')});}}>{confirm==='leave'?'放弃草稿并离开':confirm==='restart'?'确认另开并保留原局':'确认终止并收整'}</button></Dialog>}
  </HeadquartersWorkspace></div>;
}
