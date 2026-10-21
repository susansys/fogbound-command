import type {IntegratedFieldPlayerView} from './integrated-field-contracts';
import {IntegratedFieldMap} from './integrated-field-map';
import {useEffect,useRef,useState} from 'react';
import type {IntegratedFieldEnvelope as Envelope,IntegratedFieldIntent as Intent} from './integrated-field-contracts';
import type {Transport,Response} from './transport';
import type {GamePlayerView} from './play-contracts';
import {error_copy} from './player-copy';
import {HeadquartersWorkspace} from './intelligence-workbench';
import {HeadquartersReceivedRecords,HeadquartersFooter} from './outcome-workbench';
import type {RegionalDisplaySession} from './regional-display';
type Props={view:IntegratedFieldPlayerView;transport:Transport;adopt:(view:GamePlayerView)=>void;onLeave:()=>Promise<void>;channelError:string;storageFault:boolean;history:boolean;onHistory:(history:boolean)=>void;liveRunId:string|null;onStorageRecovered:()=>void;displaySession?:RegionalDisplaySession};
export function IntegratedFieldWorkbench({view,transport,adopt,onLeave,channelError,storageFault,history,onHistory,liveRunId,onStorageRecovered,displaySession}:Props){
  const catalog=view.model_catalog;
  const current=useRef(view),adoptRef=useRef(adopt),pending=useRef<Envelope|null>(null);current.current=view;adoptRef.current=adopt;
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[uncertain,setUncertain]=useState(false),[pauseWaiting,setPauseWaiting]=useState(false),[pauseUnknown,setPauseUnknown]=useState(false),[noReceipt,setNoReceipt]=useState(false),[localFault,setLocalFault]=useState(false),[recoveryUnknown,setRecoveryUnknown]=useState(false),[historyNode,setHistoryNode]=useState('1');
  const inFlight=useRef(false),historyNow=useRef(history),mounted=useRef(true),pausePromise=useRef<Promise<boolean>|null>(null),recovery=useRef<{run_id:string;operation_id:string}|null>(null),nodes=useRef(view.replay_nodes);historyNow.current=history;if(!history)nodes.current=view.replay_nodes;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [actor,setActor]=useState<'R'|'W'>('R'),[target,setTarget]=useState<'H'|'A'|'B'>('A'),[advanceTo,setAdvanceTo]=useState('1');
  const [selected,setSelected]=useState<'R'|'W'|'H'|'A'|'B'>('R');
  function selectObject(id:typeof selected){setSelected(id);if(!history){if(id==='R'||id==='W')setActor(id);else setTarget(id);}}
  function adoptResponse(response:Response){
    if(mounted.current&&!historyNow.current&&response.ok&&response.view?.scenario_kind==='play_integrated_field'&&response.view.run_id===current.current.run_id){if(response.view.revision>=current.current.revision)adoptRef.current(response.view);return true;}return false;
  }
  function pause(reason:'manual'|'focus_lost'|'application_hidden'):Promise<boolean>{
    if(historyNow.current)return Promise.resolve(false);if(pausePromise.current)return pausePromise.current;
    if(current.current.paused&&pending.current?.intent.kind!=='continue')return Promise.resolve(true);
    const run=current.current.run_id;setPauseWaiting(true);
    const work=(async()=>{try{
      const response=await transport.request({kind:'management_pause',reason});
      if(!mounted.current||historyNow.current||current.current.run_id!==run)return false;
      if(adoptResponse(response)&&response.ok&&response.view?.paused){setPauseUnknown(false);setNote('暂停已确认');return true;}
      setPauseUnknown(true);setError(response.ok?'STORAGE_UNCONFIRMED':response.code);
    }catch{if(mounted.current&&current.current.run_id===run){setPauseUnknown(true);setError('CHANNEL_UNCERTAIN');}}finally{pausePromise.current=null;if(mounted.current)setPauseWaiting(false);}return false;})();pausePromise.current=work;return work;
  }
  useEffect(()=>{
    if(history)return;
    const lost=()=>{if(current.current.mode==='command'&&(!current.current.paused||pending.current?.intent.kind==='continue'))void pause(document.hidden?'application_hidden':'focus_lost');};
    const hidden=()=>{if(document.hidden)lost();};window.addEventListener('blur',lost);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',lost);document.removeEventListener('visibilitychange',hidden);};
  },[transport,history]);
  async function send(envelope:Envelope){
    if(historyNow.current||inFlight.current)return;
    inFlight.current=true;setBusy(true);setError('');setNoReceipt(false);
    try{
      const response=await transport.request({kind:'operate_integrated_field',envelope});
      if(!mounted.current||historyNow.current||current.current.run_id!==envelope.run_id)return;
      if(response.ok&&response.receipt?.run_id===envelope.run_id&&response.receipt.operation_id===envelope.operation_id&&response.receipt.kind===envelope.intent.kind&&adoptResponse(response)){
       pending.current=null;setUncertain(false);setNote(envelope.intent.kind==='save'?'已保存至 '+response.view!.sim_time/1000+' 秒':envelope.intent.kind==='integrated_move'?'移动命令已签发，等待当地接令及回报':envelope.intent.kind==='integrated_activity'?'现场命令已签发，等待当地接令及回报':envelope.intent.kind==='integrated_prepare'?'资料校验与准备已登记，等待共享席位确认':envelope.intent.kind==='advance'?'时间推进已确认':envelope.intent.kind==='rate'?'推进速度已确认':'继续已确认');
       if(envelope.intent.kind==='save'&&displaySession?.run===response.view!.run_id)void displaySession.save(response.view!.revision);
      }else if(!response.ok){setError(response.code);if(['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(response.code)){setUncertain(true);if(response.code!=='CHANNEL_UNCERTAIN')setLocalFault(true);}else{pending.current=null;setUncertain(false);const fresh=await transport.request({kind:'view',run_id:envelope.run_id});adoptResponse(fresh);}}
      else{setError('CHANNEL_UNCERTAIN');setUncertain(true);}
    }catch{if(mounted.current){setError('CHANNEL_UNCERTAIN');setUncertain(true);}}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  async function control(intent:Extract<Intent,{kind:'save'|'continue'|'advance'|'rate'|'integrated_move'|'integrated_activity'|'integrated_prepare'}>){
    if(historyNow.current||inFlight.current||pausePromise.current||pending.current||storageFault||localFault||recovery.current)return;const active=current.current;
    const envelope={run_id:active.run_id,operation_id:crypto.randomUUID(),expected_revision:active.revision,intent};pending.current=envelope;await send(envelope);
  }
  async function queryOriginal(){
    const envelope=pending.current;if(historyNow.current||!envelope||inFlight.current)return;inFlight.current=true;setBusy(true);
    try{const receipt=await transport.request({kind:'receipt',run_id:envelope.run_id,operation_id:envelope.operation_id});if(!mounted.current||historyNow.current||current.current.run_id!==envelope.run_id)return;if(!receipt.ok){setError(receipt.code);return;}if(receipt.receipt?.run_id===envelope.run_id&&receipt.receipt.operation_id===envelope.operation_id&&receipt.receipt.kind===envelope.intent.kind){const fresh=await transport.request({kind:'view',run_id:envelope.run_id});if(adoptResponse(fresh)){pending.current=null;setUncertain(false);setNoReceipt(false);setError('');setNote('原操作已确认，未再次执行');}}else{setNoReceipt(true);setNote('尚未查到原操作收据；原编号和输入仍保留。');}}catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  function finishRecovery(response:Response,original:{run_id:string;operation_id:string}){
   if(!mounted.current||historyNow.current||current.current.run_id!==original.run_id)return;
   if(response.ok&&response.view?.scenario_kind==='play_integrated_field'&&response.view.run_id===original.run_id&&response.view.paused&&response.receipt?.run_id===original.run_id&&response.receipt.operation_id===original.operation_id&&response.receipt.kind==='restore'){
    adoptResponse(response);recovery.current=null;setRecoveryUnknown(false);setLocalFault(false);setError('');onStorageRecovered();setNote('最近记录已恢复并保持暂停；原输入与待查操作保留，请核对后明确继续。');
   }else setError(response.ok?'CHANNEL_UNCERTAIN':response.code);
  }
  async function recover(){
   if(historyNow.current||inFlight.current||pending.current&&!noReceipt)return;inFlight.current=true;setBusy(true);const original=recovery.current??{run_id:current.current.run_id,operation_id:crypto.randomUUID()};recovery.current=original;setRecoveryUnknown(true);
   try{finishRecovery(await transport.request({kind:'takeover',...original}),original);}catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  async function queryRecovery(){
   const original=recovery.current;if(historyNow.current||!original||inFlight.current)return;inFlight.current=true;setBusy(true);
   try{const result=await transport.request({kind:'receipt',...original});if(!mounted.current||historyNow.current||current.current.run_id!==original.run_id)return;if(!result.ok){setError(result.code);return;}if(!result.receipt){setNote('恢复尚无确定回执；原恢复编号保留。');return;}const fresh=await transport.request({kind:'view',run_id:original.run_id});finishRecovery(fresh.ok?{...fresh,receipt:result.receipt}:fresh,original);}catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  async function queryPause(){if(inFlight.current)return;inFlight.current=true;setBusy(true);try{const result=await transport.request({kind:'view',run_id:current.current.run_id});if(adoptResponse(result)&&result.ok){setPauseUnknown(false);setNote(result.view!.paused?'暂停已确认，等待明确继续。':'当前仍在进行，可再次请求暂停。');}else if(!result.ok)setError(result.code);}catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(mounted.current)setBusy(false);}}
  async function readHistory(){
   if(busy||pausePromise.current||pending.current||storageFault||localFault||recovery.current)return;setBusy(true);
   try{const response=await transport.request({kind:'replay',run_id:view.run_id,to:0,node_revision:Number(historyNode)});if(mounted.current&&response.ok&&response.view?.scenario_kind==='play_integrated_field'&&response.view.run_id===view.run_id){onHistory(true);adoptRef.current(response.view);}else if(!response.ok)setError(response.code);}catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{if(mounted.current)setBusy(false);}
  }
  async function currentView(){if(busy)return;setBusy(true);const run=liveRunId??view.run_id;try{const response=await transport.request({kind:'current',run_id:run});if(mounted.current&&response.ok&&response.view?.scenario_kind==='play_integrated_field'&&response.view.run_id===run){onHistory(false);adoptRef.current(response.view);}else if(!response.ok)setError(response.code);}catch{if(mounted.current)setError('CHANNEL_UNCERTAIN');}finally{if(mounted.current)setBusy(false);}}
  async function leave(){if(inFlight.current||pending.current||recovery.current)return;setBusy(true);try{if(historyNow.current||await pause('manual'))await onLeave();}finally{if(mounted.current)setBusy(false);}}
  const unavailable=history||busy||uncertain||pauseWaiting||pauseUnknown||storageFault||localFault||recoveryUnknown;
  const historyControls=<footer className="mission-footer"><label>历史节点<select id="intelligence-history" aria-label="历史节点" value={historyNode} onChange={event=>setHistoryNode(event.target.value)}><option value="1">开局 · 记录 1</option>{nodes.current.filter(node=>node.revision!==1).map(node=><option key={node.revision} value={node.revision}>{node.label} · 记录 {node.revision}</option>)}</select></label><button disabled={busy||!!pending.current||pauseWaiting||pauseUnknown||storageFault||localFault||recoveryUnknown} onClick={()=>void readHistory()}>查看历史节点</button>{history&&<button disabled={busy} onClick={()=>void currentView()}>{liveRunId?'返回当前行动':'返回当前记录'}</button>}{view.mode==='research'&&!history&&<label>推进到时刻（秒）<input aria-label="推进到时刻（秒）" type="number" min={view.sim_time/1000} max={910} step="0.001" value={advanceTo} disabled={unavailable} onChange={event=>setAdvanceTo(event.target.value)}/><button disabled={unavailable||view.finished||!advanceTo.trim()||!Number.isSafeInteger(Number(advanceTo)*1000)||Number(advanceTo)*1000<=view.sim_time||Number(advanceTo)>910} onClick={()=>void control({kind:'advance',to:Number(advanceTo)*1000})}>推进时间</button></label>}</footer>;
  const received=[...view.activity_reports].sort((a,b)=>a.received_at-b.received_at||a.id.localeCompare(b.id)).map(report=>({id:report.id,at:report.received_at,sender:report.actor,kind:'工序回报',text:`${report.actor} ${({read:'读取',observe:'观察',inspect:'检查',repair:'维修'})[report.action]} ${report.target} · ${({accepted:'当地已接令，结果待回报',completed:'当地已完成',refused:'当地拒绝，未开始作业',blocked:'当地工作停止'})[report.phase]}；观察 ${report.observed_at/1000} 秒，收到 ${report.received_at/1000} 秒`}));
  const from=view.actors.find(value=>value.id===actor)!.position.point[0],to=view.geometry.points[target][0],middle=view.geometry.points.A[0],haDistance=Math.max(0,Math.min(Math.max(from,to),middle)-Math.min(from,to)),abDistance=Math.abs(to-from)-haDistance;
  const speed=(id:string)=>catalog.parameters.find(parameter=>parameter.id===id)!.value;
  const lowerMs=Math.ceil(haDistance/speed('P-MOVE-HA')*1000)+Math.ceil(abDistance/speed('P-MOVE-AB-DRY')*1000),upperMs=Math.ceil(haDistance/speed('P-MOVE-HA')*1000)+Math.ceil(abDistance/speed('P-MOVE-AB-WET')*1000);
  return <div className="app crisis-app mission-app intelligence-app outcome-app integrated-workbench"><header className="topbar"><span className="brand"><span className="brand-mark">玄</span><strong>玄枢行动</strong><span className="brand-sub">联合任务指挥部</span></span><span className="demo-badge">综合现场</span><div className="clock"><strong><output role="timer" aria-label="行动时刻" aria-live="off">{(view.sim_time/1000).toFixed(3)} 秒</output></strong><span>{storageFault||localFault||recoveryUnknown?'进度未确认':history?'历史只读':view.finished?'已结束':view.paused?'已暂停':'指挥进行中'}</span></div><label>推进速度<select aria-label="推进速度" value={view.rate} disabled={unavailable} onChange={event=>void control({kind:'rate',rate:Number(event.target.value) as 1|2|4})}><option value="1">1倍</option><option value="2">2倍</option><option value="4">4倍</option></select></label>
      <button disabled={unavailable||view.finished||view.mode!=='command'} onClick={()=>view.paused?void control({kind:'continue'}):void pause('manual')}>{view.paused?'继续行动':'暂停行动'}</button>
      <button disabled={unavailable} onClick={()=>void control({kind:'save'})}>保存行动</button>
    </header>
    {history&&<p className="integrated-receipt">正在查看历史记录，只读。</p>}
    {(error||channelError)&&<div className="fault" role="alert">{error_copy(error||channelError)}</div>}
    {pauseUnknown&&<div className="fault"><span>暂停尚未得到确认，当前状态需要重新核对。</span><button disabled={busy} onClick={()=>void queryPause()}>核对暂停状态</button></div>}
    {uncertain&&pending.current&&!recoveryUnknown&&<div className="fault"><span>原操作结果待核查，操作编号与输入已保留。</span><button disabled={busy} onClick={()=>void queryOriginal()}>查询原操作</button><button disabled={busy||storageFault||localFault} onClick={()=>pending.current&&void send(pending.current)}>重试原操作</button>{noReceipt&&<button disabled={busy} onClick={()=>void recover()}>恢复最近记录并重新核对</button>}</div>}
    {(storageFault||localFault)&&!pending.current&&!recoveryUnknown&&<div className="fault"><span>推进尚未得到可靠提交确认。当前输入保留，恢复后保持暂停。</span><button disabled={busy||history} onClick={()=>void recover()}>恢复最近记录并重新核对</button></div>}
    {recoveryUnknown&&<div className="fault"><span>恢复结果待核查，原恢复编号和输入已保留。</span><button disabled={busy||history} onClick={()=>void queryRecovery()}>查询恢复结果</button><button disabled={busy||history} onClick={()=>void recover()}>重试原恢复操作</button></div>}
    <HeadquartersWorkspace context={<><strong>R／W · H—A—B</strong><span>依照已收材料组织采集、作业、返回与交付，等待合法回报。</span></>} navigation={<><button className="active" onClick={()=>document.getElementById('intelligence-sources')?.focus()}>情报报告</button><button onClick={()=>document.getElementById('intelligence-history')?.focus()}>当时所知</button><button disabled={busy||uncertain||pauseWaiting||recoveryUnknown} onClick={()=>void leave()}>更换演练任务</button></>} heading="综合现场任务" summary={<>总部视图 · {view.mode==='command'?'指挥时间':'研究时间'}</>} records={<HeadquartersReceivedRecords rows={received} description="按总部收到时刻排列；此处为已收工序回报摘要"/>} footer={<HeadquartersFooter/>}>
    <div className="workbody mission-body"><div className="intelligence-live-workspace" style={{display:'contents'}}><IntegratedFieldMap view={view} selected={selected} onSelect={selectObject} displaySession={history?undefined:displaySession}/><aside id="intelligence-sources" tabIndex={-1} className="intelligence-sources" aria-label="总部已收原始资料"><p className="operation-status" role="status">{history?'仅显示所选记录提交时总部已收到的信息。':<>{view.next_action}{note&&<span> · {note}</span>}</>}</p><section className="current-action" aria-label="当前行动"><h2 id="current-action-heading" tabIndex={-1}>当前行动</h2><p>当前对象：{selected}；选择与阅读不发送命令。</p>
      <section aria-label="准备与维修"><h2>准备与维修</h2><p>资料校验与准备共用 INTEL 席位。维修必须引用同一计划的批准和已收到的检查结果。</p>
        <button disabled={unavailable||!view.can_issue||view.preparation!==null} onClick={()=>void control({kind:'integrated_prepare',plan_ref:{run_id:view.run_id,id:'B33-PLAN-1',version:1},model_ref:view.model_catalog.model_ref})}>安排资料校验与准备</button>
        <p>{view.preparation?({queued:'准备计划等待共享席位',validating:'正在校验开局资料凭证',preparing:'正在进行计划准备',approved:'同一计划准备已批准'})[view.preparation.status]:'尚未安排准备。'}</p>
        <button disabled={unavailable||!view.can_issue||!view.preparation} onClick={()=>{if(view.preparation)void control({kind:'integrated_activity',actor:'W',action:'inspect',target:'B',plan_ref:view.preparation.plan_ref,model_ref:view.model_catalog.model_ref,basis_refs:[]});}}>W 检查 B</button>
        <button disabled={unavailable||!view.can_issue||view.preparation?.status!=='approved'||!view.activity_reports.some(report=>report.actor==='W'&&report.action==='inspect'&&report.phase==='completed')} onClick={()=>{const prep=view.preparation,inspection=view.activity_reports.find(report=>report.actor==='W'&&report.action==='inspect'&&report.phase==='completed');if(prep?.approval_ref&&inspection)void control({kind:'integrated_activity',actor:'W',action:'repair',target:'B',plan_ref:prep.plan_ref,model_ref:view.model_catalog.model_ref,basis_refs:[{run_id:view.run_id,id:inspection.id,version:1},prep.approval_ref]});}}>W 维修 B</button>
        <p>{view.facility_knowledge?`B 最后确认：${({faulted:'连接件故障',unverified_after_replacement:'换件后尚未功能确认',operable:'功能可用'})[view.facility_knowledge.condition]}；${view.facility_knowledge.method==='functional'?'功能复核':'诊断观察'}，版本 ${view.facility_knowledge.version}，观察 ${view.facility_knowledge.observed_at/1000} 秒，收到 ${view.facility_knowledge.received_at/1000} 秒。`:'B 当前功能状态未知；以合法回报为准。'}</p>
      </section>
      <section aria-label="移动与返程"><h2>移动与返程</h2><p>HA 与 AB 为登记路径，发送服务 1 秒；位置仅随总部收到的当地回报更新。</p>
        {view.actors.map(value=><p key={value.id}>{value.id} 最后确认：{value.position.point.join(', ')} m；观察 {value.position.observed_at/1000} 秒，收到 {value.position.received_at/1000} 秒。{value.position.evidence.endsWith('-blocked')?'当地已报告停候。':value.position.evidence.endsWith('-refused')?'当地已报告无法执行该移动。':''}</p>)}
        <label>行动组<select aria-label="行动组" value={actor} disabled={unavailable} onChange={event=>{const value=event.target.value as 'R'|'W';setActor(value);setSelected(value);}}><option value="R">R</option><option value="W">W</option></select></label>
        <label>移动目的地<select aria-label="移动目的地" value={target} disabled={unavailable} onChange={event=>{const value=event.target.value as 'H'|'A'|'B';setTarget(value);setSelected(value);}}><option value="H">H</option><option value="A">A</option><option value="B">B</option></select></label>
        <button disabled={unavailable||!view.can_issue} onClick={()=>void control({kind:'integrated_move',actor,target,model_ref:view.model_catalog.model_ref})}>下达移动命令</button>
        <p>条件预计：按最后确认位置，路径 {Math.abs(to-from)} m；移动 {lowerMs/1000}{upperMs===lowerMs?'':`—${upperMs/1000}`} 秒，另加至少 1 秒发送。不含其他排队与当地拒绝；干／湿全程是假设范围，非统计区间。依据 P-MOVE-HA／P-MOVE-AB-DRY／P-MOVE-AB-WET，均为 C 情景值。</p>
      </section>
      <section aria-label="现场读取"><h2>现场读取</h2><p>条件预计 {catalog.parameters.find(parameter=>parameter.id==='P-READ')!.value/1000} 秒：准备、复制、摘要核验、收尾四阶段。以上为作者情景值（C），依据 P-READ 来源登记版本；收尾成功并收到回报后才列入成果。</p>
        <button disabled={unavailable||!view.can_issue||!view.actors.some(value=>value.id==='R'&&value.position.point.every((coordinate,index)=>coordinate===view.geometry.points.A[index]))} onClick={()=>{const position=view.actors.find(value=>value.id==='R')!.position;void control({kind:'integrated_activity',actor:'R',action:'read',target:'A',model_ref:view.model_catalog.model_ref,basis_refs:[{run_id:view.run_id,id:position.evidence,version:1},{run_id:view.run_id,id:'opening-A-access',version:1}]});}}>读取 A 资料</button>
        {view.activity_reports.map(report=><p key={report.id}><button onClick={()=>selectObject(report.target)}>选择回报对象 {report.target}</button> {report.actor} {({read:'读取',observe:'观察',inspect:'检查',repair:'维修'})[report.action]} {report.target}：{({accepted:'当地已接令，最终结果待回报',completed:'当地已完成',refused:'当地条件不满足，未开始该作业',blocked:'实体工作已停止，未生成完整成果'})[report.phase]}；观察 {report.observed_at/1000} 秒，收到 {report.received_at/1000} 秒。</p>)}
        {view.artifacts.map(artifact=><p key={artifact.id}>已核验成果 {artifact.source}：{artifact.logical_size_bytes/1000000000} GB；观察 {artifact.observed_at/1000} 秒，收到 {artifact.received_at/1000} 秒。</p>)}
        <p>GB 为模型逻辑数据量。存档仅包含受控小型合成载荷与核验记录。</p>
      </section>
      </section><section aria-label="任务目标"><h2>目标：取得 A／B 记录并组织交付</h2><p>实体截止 {view.public_rules.deadline/1000} 秒；之后 {view.public_rules.receipt_grace/1000} 秒只接收已有回报，不延长作业。</p>{(['A','B'] as const).map(site=><p key={site}>{site}：{view.artifacts.some(artifact=>artifact.source===site)?'已收到读取完成回报；交接与终局核验另行确认':'等待合法成果回报'}</p>)}</section>
      <details className="integrated-model-details"><summary>模型与参数目录</summary><section aria-label="模型与参数目录"><h2>模型与参数目录</h2><p className="integrated-assumption">条件情景值，非现实校准</p><p>{catalog.model_ref.id} · 版本 {catalog.model_ref.version}</p>
        <div className="integrated-catalog-grid"><section><h3>几何</h3>{catalog.geometry.segments.map(segment=><p key={segment.id}>{segment.id}：{segment.length_m} m</p>)}</section>
        {catalog.configurations.map(config=><section key={config.actor}><h3>{config.actor} 携行：{config.load_kg} kg</h3><p>已占 {config.occupied_l} L / 容量 {config.capacity_l} L</p><p>{config.actor==='R'?'平板':'工具'} {config.equipment.mass_kg} kg{config.equipment.battery_included?'（已含电池）':''}</p><p>{config.equipment.battery_wh} Wh = {config.equipment.battery_nominal_j} J</p><p>开局预算 {config.equipment.battery_available_j} J（80% 条件预算；不是当前剩余读数）</p>{config.storage_bytes!==undefined&&<p>模型存储容量 {config.storage_bytes/1000000000} GB</p>}</section>)}</div>
        <table><caption>参数来源分类</caption><thead><tr><th scope="col">参数</th><th scope="col">值</th><th scope="col">类别与说明</th></tr></thead><tbody>{catalog.parameters.map(parameter=><tr key={parameter.id}><th scope="row">{parameter.id}</th><td>{parameter.value} {parameter.unit}</td><td>{parameter.category} · {parameter.label}<br/><small>来源 {parameter.source_ref.id} · 登记版本 {parameter.source_ref.version}</small></td></tr>)}</tbody></table>
        <details><summary>来源与版本</summary>{catalog.sources.map(source=><section key={source.id}><h3>{source.id} · 登记版本 {source.version}</h3><p>{source.document_version}</p><p>{source.publication_date??'资料发布日期未知'}；{source.sales_sku??'完整销售 SKU 未知'}</p>{source.url&&<a href={source.url} target="_blank" rel="noreferrer">查看原始公开资料</a>}</section>)}</details>
        <p>GB 表示模型中的逻辑字节量；实际保存受控小型合成载荷，不读取私人文件或复制 GB 文件。</p>
      </section></details>{historyControls}
    </aside></div></div></HeadquartersWorkspace></div>;
}
