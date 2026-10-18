import {useEffect,useRef,useState} from 'react';
import type {OutcomeParticipantTemplate,OutcomeInferenceNote,OutcomeInferenceRequest,OutcomeDecisionEvaluation,OutcomeDecisionEvaluationRequest,OutcomeDebriefSession,OutcomeTruthPayload,OutcomeTruthRequest,OutcomeDebriefAnswer,OutcomeDebriefQuery,OutcomeEvidenceResolution,DebriefEvidenceRef} from './outcome-contracts';
import type {Transport} from './transport';
import {clock} from './player-copy';
import {parse_outcome_decision_query} from './outcome-protocol';
import {record} from './protocol';
import {outcome_inference_receipt} from './outcome-dto';

type HistoryNode=Extract<OutcomeEvidenceResolution,{status:'answered'}>['history'];
type InferenceDraft={text:string;pending:OutcomeInferenceRequest|null};
type InferenceDrafts=Map<string,InferenceDraft>;
export function OutcomeDebrief({run_id,finished,transport,onHistory}:{run_id:string;finished:boolean;transport:Pick<Transport,'request'>;onHistory:(node:HistoryNode)=>Promise<void>}){
  const [session,setSession]=useState<OutcomeDebriefSession|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [agenda,setAgenda]=useState('task_outcome');
  const [truth,setTruth]=useState<OutcomeTruthPayload|null>(null),[acknowledgement,setAcknowledgement]=useState<'pending'|'confirmed'|'uncertain'>('pending');
  const heading=useRef<HTMLHeadingElement|null>(null),button=useRef<HTMLButtonElement|null>(null),generation=useRef(0),wasOpen=useRef(false);
  const truthRequest=useRef<OutcomeTruthRequest|null>(null),ackStarted=useRef<string|null>(null);
  const lifecycleWrite=useRef<Promise<OutcomeDebriefSession|null>|null>(null);
  const archiveWrite=useRef<Promise<boolean>|null>(null);
  const inferenceDrafts=useRef<InferenceDrafts>(new Map());
  useEffect(()=>{inferenceDrafts.current.clear();},[run_id]);
  useEffect(()=>{generation.current++;setSession(null);setTruth(null);truthRequest.current=null;ackStarted.current=null;setBusy(false);setError('');},[run_id,finished]);
  const isOpen=session!==null;
  useEffect(()=>{if(isOpen){heading.current?.focus();wasOpen.current=true;}else if(wasOpen.current){button.current?.focus();wasOpen.current=false;}},[isOpen]);
  async function markViewing(opened:OutcomeDebriefSession,token:number){
    if(opened.status==='viewing')return opened;
    try{
      const response=await transport.request({kind:'transition_outcome_debrief',envelope:{run_id:opened.run_id,run_digest:opened.run_digest,finished_seq:opened.finished_seq,expected_lifecycle_revision:opened.lifecycle_revision,operation_id:crypto.randomUUID(),status:'viewing'}}),updated=response.ok?response.debrief:undefined;
      if(!updated||updated.run_id!==opened.run_id||updated.run_digest!==opened.run_digest||updated.finished_seq!==opened.finished_seq||updated.status!=='viewing'||updated.lifecycle_revision!==opened.lifecycle_revision+1)throw Error('unconfirmed');
      if(token===generation.current)setSession(current=>current?{...current,status:updated.status,lifecycle_revision:updated.lifecycle_revision}:null);return updated;
    }catch{if(token===generation.current)setError('复盘已显示，阅读状态的保存结果尚未确认。');return null;}
  }
  // Mark viewing only after React has committed the visible debrief. Closing
  // waits for this actual metadata result before requesting the next version.
  useEffect(()=>{if(session)lifecycleWrite.current=markViewing(session,generation.current);},[isOpen]);
  async function acknowledge(payload:OutcomeTruthPayload,token:number){
    setAcknowledgement('pending');
    try{
      const response=await transport.request({kind:'confirm_outcome_truth',envelope:{run_id:payload.run_id,run_digest:payload.run_digest,finished_seq:payload.finished_seq,expected_meta_revision:payload.grant.metadata_revision,operation_id:payload.grant.operation_id,payload_digest:payload.grant.payload_digest}});
      if(token!==generation.current)return;
      const confirmation=response.ok?response.truth_confirmation:undefined;
      if(confirmation&&confirmation.run_id===payload.run_id&&confirmation.run_digest===payload.run_digest&&confirmation.finished_seq===payload.finished_seq&&confirmation.operation_id===payload.grant.operation_id&&confirmation.payload_digest===payload.grant.payload_digest){
        setSession(current=>current?{...current,truth_exposure:true,metadata_revision:confirmation.metadata_revision}:null);setAcknowledgement('confirmed');
      }else setAcknowledgement('uncertain');
    }catch{if(token===generation.current)setAcknowledgement('uncertain');}
  }
  // The effect runs after the verified payload has been committed to the visible debrief.
  useEffect(()=>{if(!truth||!isOpen||ackStarted.current===truth.grant.operation_id)return;ackStarted.current=truth.grant.operation_id;void acknowledge(truth,generation.current);},[truth,isOpen]);
  async function open(){
    const token=++generation.current;setBusy(true);setError('');setTruth(null);setAgenda('task_outcome');truthRequest.current=null;ackStarted.current=null;
    lifecycleWrite.current=null;
    try{const closed=archiveWrite.current?await archiveWrite.current:true;if(token!==generation.current)return;
      const response=await transport.request({kind:'open_outcome_debrief',run_id});if(token!==generation.current)return;
      if(response.ok&&response.debrief?.run_id===run_id)setSession(response.debrief);
      else setError(!response.ok&&response.code==='DEBRIEF_NOT_AVAILABLE'?'本次任务尚未结束，暂不能查看复盘。':'尚未取得复盘记录，请稍后重试。');
      if(response.ok&&response.debrief&&!closed)setError('上次关闭记录尚未确认；以下显示当前已保存的复盘。');
    }catch{if(token===generation.current)setError('尚未确认复盘读取结果，请稍后重试。');}finally{if(token===generation.current)setBusy(false);}
  }
  async function reveal(){
    if(!session)return;
    const token=generation.current;
    const request=truthRequest.current??{run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,expected_meta_revision:session.metadata_revision,operation_id:crypto.randomUUID()};
    truthRequest.current=request;setBusy(true);setError('');
    try{
      const response=await transport.request({kind:'request_outcome_truth',envelope:request});if(token!==generation.current)return;
      const payload=response.ok?response.outcome_truth:undefined;
      if(payload&&payload.run_id===request.run_id&&payload.run_digest===request.run_digest&&payload.finished_seq===request.finished_seq&&payload.grant.operation_id===request.operation_id)setTruth(payload);
      else setError('尚未取得可核验的终局事实，请重试。');
    }catch{if(token===generation.current)setError('尚未取得可核验的终局事实，请重试。');}finally{if(token===generation.current)setBusy(false);}
  }
  function close(){
    const opened=session;if(!opened)return;const token=++generation.current,pending=lifecycleWrite.current??markViewing(opened,token);
    setSession(null);setTruth(null);truthRequest.current=null;ackStarted.current=null;setBusy(false);setError('');
    archiveWrite.current=(async()=>{try{
      const viewed=await pending;if(!viewed)throw Error('unconfirmed');
      const response=await transport.request({kind:'transition_outcome_debrief',envelope:{run_id:viewed.run_id,run_digest:viewed.run_digest,finished_seq:viewed.finished_seq,expected_lifecycle_revision:viewed.lifecycle_revision,operation_id:crypto.randomUUID(),status:'archived'}}),updated=response.ok?response.debrief:undefined;
      if(!updated||updated.run_id!==viewed.run_id||updated.run_digest!==viewed.run_digest||updated.finished_seq!==viewed.finished_seq||updated.status!=='archived'||updated.lifecycle_revision!==viewed.lifecycle_revision+1)throw Error('unconfirmed');
      return true;
    }catch{if(token===generation.current)setError('复盘已关闭，关闭记录的保存结果尚未确认。');return false;}})();
  }
  if(!finished)return null;
  return <section aria-label='任务复盘入口'>
    {!session&&<button ref={button} disabled={busy} onClick={()=>void open()}>查看复盘</button>}
    {error&&<p role='alert'>{error}</p>}
    {session&&<section data-testid='outcome-debrief' aria-labelledby='outcome-debrief-heading'>
      <h2 id='outcome-debrief-heading' ref={heading} tabIndex={-1}>行动复盘</h2>
      <p>总部当时认知 · 以下只依据本次任务结束时总部已经收到的记录。</p>
      <h3>{({success:'任务完成',partial:'有限完成',aborted:'任务已中止',failure:'任务未完成'})[session.summary.result]}</h3>
      {session.summary.missing_people.length>0&&<div><strong>人员回收未完成</strong><p>尚无确认：{session.summary.missing_people.map(id=>id.replace(/^([RW])-person-([123])$/,'$1组$2号成员')).join('、')}。</p></div>}
      <h3>关键决定</h3>
      {session.summary.key_decisions.length===0?<p>本次没有已记录的关键决定。</p>:<ol>{session.summary.key_decisions.map(d=><li key={d.ref.id}>{clock(d.at)} · {({save_plan:'保存准备草案',request_preparation:'申请筹备',request_source_validation:'核实来源',issue_activity:'下达活动',return_and_deliver:'返回并交付',abort_outcome:'中止任务'} as Record<string,string>)[d.action]??'已记录的决定'}。{d.reason.kind==='recorded'?'当时登记理由：'+d.reason.text:'当时理由未记录。'}<OutcomeDecisionPanel session={session} decision_ref={d.ref} transport={transport}/></li>)}</ol>}
      <label>复盘议程<select aria-label='复盘议程' value={agenda} onChange={event=>setAgenda(event.target.value)}><option value='task_outcome'>任务与结局</option><option value='timeline'>关键消息与实体时间线</option><option value='participants'>实际参与者陈述</option><option value='coordination'>矛盾与协作断点</option><option value='questions'>结构化问答</option></select></label>
      {agenda==='participants'?<OutcomeParticipantPanel session={session} transport={transport} onHistory={onHistory} drafts={inferenceDrafts.current}/>:<>
        {agenda==='timeline'&&<h3>关键消息与实体时间线</h3>}
        {agenda==='coordination'&&<h3>矛盾与协作断点</h3>}
        {agenda==='questions'&&<h3>结构化问答</h3>}
        <OutcomeEvidencePanel key={agenda} session={session} transport={transport} onHistory={onHistory} drafts={inferenceDrafts.current} initialTopic={agenda==='timeline'?'when_known':agenda==='coordination'?'contradiction':'evidence'}/>
      </>}
      <p>独立分支比较：未提供。</p>
      {!truth&&<button disabled={busy} onClick={()=>void reveal()}>揭示终局事实</button>}
      {truth&&<section data-testid='outcome-truth-facts' aria-label='终局事实对照'>
        <h3>终局事实对照</h3><p>以下是任务结束后的实际账目，不代表总部当时已经知道。</p>
        <p>实际能源 {truth.facts.source.resources.energy} · 实际耐久 {truth.facts.source.resources.durability} · 实际用品 {truth.facts.source.resources.packs}</p>
        <details><summary>查看实际事件、资源账与交接核验原记录</summary><pre>{JSON.stringify({events:truth.facts.events,ledgers:truth.facts.ledgers,custody:truth.facts.custody,verification:truth.facts.verification,reports:truth.facts.reports},null,2)}</pre></details>
        <p role='status'>{acknowledgement==='confirmed'?'已记录本次事实查看。':acknowledgement==='pending'?'正在保存本次事实查看记录。':'事实已经显示，查看记录的保存结果尚未确认。'}</p>
        {acknowledgement==='uncertain'&&<button onClick={()=>void acknowledge(truth,generation.current)}>重试保存查看记录</button>}
      </section>}
      <button onClick={()=>void close()}>关闭复盘</button>
    </section>}
  </section>;
}

function OutcomeEvidencePanel({session,transport,onHistory,drafts,initialTopic='evidence'}:{session:OutcomeDebriefSession;transport:Pick<Transport,'request'>;onHistory:(node:HistoryNode)=>Promise<void>;drafts:InferenceDrafts;initialTopic?:string}){
  const [actor,setActor]=useState('HQ'),[layer,setLayer]=useState('known_then'),[topic,setTopic]=useState(initialTopic),[revision,setRevision]=useState(String(session.finished_seq)),[answer,setAnswer]=useState<OutcomeDebriefAnswer|null>(null),[resolved,setResolved]=useState<Extract<OutcomeEvidenceResolution,{status:'answered'}>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const layers:Record<string,string>={known_then:'当时认知',declared_reason:'当时声明',retrospective_inference:'事后说明',...(session.truth_exposure?{engine_event:'终局事实'}:{})};
  const topics:Record<string,string>={when_known:'何时知道',evidence:'依据什么',when_delivered:'发出后何时收到',why_wait:'为何等待',cost:'代价',contradiction:'矛盾',handover_gap:'交接与核验缺口',outcome_vs_evaluation:'结果与当时评价'};
  const actors:Record<string,string>={HQ:'总部',R:'R组',W:'W组',INTEL:'核实与处理岗位',H:'接收岗位',ArchiveSource:'档案来源'};
  const generation=useRef(0),lastQuery=useRef<OutcomeDebriefQuery|null>(null);
  useEffect(()=>()=>{generation.current++;},[]);
  function clear(){generation.current++;lastQuery.current=null;setAnswer(null);setResolved(null);setError('');}
  async function query(){
    const node=Number(revision);if(!Number.isSafeInteger(node)||node<1||node>session.finished_seq){setError('请选择本次任务已经提交的记录节点。');return;}
    const request:OutcomeDebriefQuery={run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:node,actor,layer,topic},token=++generation.current;
    setBusy(true);setError('');setAnswer(null);setResolved(null);lastQuery.current=request;
    try{const response=await transport.request({kind:'query_outcome_debrief',query:request});if(token!==generation.current)return;
      const result=response.ok?response.debrief_answer:undefined;
      if(result&&result.run_id===request.run_id&&result.run_digest===request.run_digest&&result.finished_seq===request.finished_seq&&result.actor===request.actor&&result.layer===request.layer&&result.as_of_revision===request.as_of_revision&&result.topic===request.topic)setAnswer(result);
      else setError('尚未取得可核验的当时依据，请重试。');
    }catch{if(token===generation.current)setError('尚未确认依据查询结果，请重试。');}finally{if(token===generation.current)setBusy(false);}
  }
  async function resolve(ref:DebriefEvidenceRef){
    const request=lastQuery.current;if(!request)return;const token=++generation.current;setBusy(true);setError('');setResolved(null);
    try{const response=await transport.request({kind:'resolve_outcome_evidence',query:{...request,ref}});if(token!==generation.current)return;
      const result=response.ok?response.evidence_resolution:undefined;
      if(result?.status==='answered'&&result.history.run_id===request.run_id&&result.history.actor===request.actor&&result.history.layer===request.layer&&result.history.revision<=request.as_of_revision&&JSON.stringify(result.entry.ref)===JSON.stringify(ref))setResolved(result);
      else setError('所选记录不能在这个角色与时点下核验。');
    }catch{if(token===generation.current)setError('尚未确认原始记录，请重试。');}finally{if(token===generation.current)setBusy(false);}
  }
  const entries=answer?.entries??[],ordered=initialTopic==='when_known'?entries.map((entry,index)=>({entry,index})).sort((a,b)=>{const ta=a.entry.ref.recorded_at.kind==='known'?a.entry.ref.recorded_at.value:Infinity,tb=b.entry.ref.recorded_at.kind==='known'?b.entry.ref.recorded_at.value:Infinity;return ta===tb?a.index-b.index:ta-tb;}).map(item=>item.entry):entries;
  const time=(value:DebriefEvidenceRef['recorded_at'])=>value.kind==='known'?clock(value.value):'时间未知';
  const kind={report:'报告',local_observation:'当地观察',delivery:'送达记录',event:'执行事件',decision:'当时决定',ledger:'资源账目',receipt:'行政收据'};
  return <details><summary>查看当时依据与引用</summary>
    <p>按角色在所选提交节点已经掌握的记录查看。当地观察不等于总部已经收报。</p>
    <label>依据所属角色<select aria-label='依据所属角色' value={actor} disabled={busy} onChange={event=>{clear();setActor(event.target.value);}}>{Object.entries(actors).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>依据层<select aria-label='依据层' value={layer} disabled={busy} onChange={event=>{clear();setLayer(event.target.value);}}>{Object.entries(layers).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>依据主题<select aria-label='依据主题' value={topic} disabled={busy} onChange={event=>{clear();setTopic(event.target.value);}}>{Object.entries(topics).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>依据记录节点<input aria-label='依据记录节点' type='number' min={1} max={session.finished_seq} value={revision} disabled={busy} onChange={event=>{clear();setRevision(event.target.value);}}/></label>
    <button disabled={busy} onClick={()=>void query()}>查询当时依据</button>
    {error&&<p role='alert'>{error}</p>}
    {answer&&<section aria-label='当时依据查询结果'><h3>{actors[answer.actor]} · {layers[answer.layer]} · {topics[answer.topic]}</h3>{answer.notes.map(message=><p key={message}>{message}</p>)}{answer.missing.map(message=><p key={message}>{message}</p>)}{ordered.map(entry=><article data-testid='debrief-evidence-entry' key={JSON.stringify(entry.ref)}>
      {answer.layer==='declared_reason'&&<p>{record(entry.record.reason)&&entry.record.reason.kind==='recorded'&&typeof entry.record.reason.text==='string'?'当时登记理由：'+entry.record.reason.text:'当时理由未记录。'}</p>}
      {answer.layer==='retrospective_inference'&&<p>用户事后说明：{typeof entry.record.text==='string'?entry.record.text:'正文尚未核验'}。独立登记时间（UTC）：{typeof entry.record.created_time==='string'?entry.record.created_time:'未记录'}；不代表当时已知或客观因果。</p>}
      <strong>{entry.ref.kind==='decision'&&entry.record.code?'已拒绝请求':kind[entry.ref.kind]}</strong><p>记录时刻 {time(entry.ref.recorded_at)} · 收到时刻 {time(entry.ref.received_at)}</p><button disabled={busy} onClick={()=>void resolve(entry.ref)}>定位原始记录</button><OutcomeEvidenceDecision entry={entry} session={session} transport={transport}/>
    </article>)}</section>}
    {resolved&&<OriginalOutcomeRecord source={resolved} session={session} transport={transport} onHistory={onHistory} drafts={drafts} busy={busy}/>}
  </details>;
}

function OriginalOutcomeRecord({source,session,transport,onHistory,drafts,busy}:{source:Extract<OutcomeEvidenceResolution,{status:'answered'}>;session:OutcomeDebriefSession;transport:Pick<Transport,'request'>;onHistory:(node:HistoryNode)=>Promise<void>;drafts:InferenceDrafts;busy:boolean}){
 const heading=useRef<HTMLHeadingElement|null>(null);useEffect(()=>{heading.current?.focus();},[source]);
 const time=(value:DebriefEvidenceRef['recorded_at'])=>value.kind==='known'?clock(value.value):'时间未知',layers:Record<string,string>={known_then:'当时认知',declared_reason:'当时声明',retrospective_inference:'事后说明',engine_event:'终局事实'};
 return <section data-testid='debrief-original-record'><h3 ref={heading} tabIndex={-1}>只读原始记录</h3><p>{source.history.actor} · {layers[source.history.layer]} · 提交时刻 {clock(source.history.at)}</p><p>原始收到时刻：{time(source.entry.ref.received_at)}</p><details><summary>查看原记录内容</summary><pre>{JSON.stringify(source.entry.record,null,2)}</pre></details><button disabled={busy} onClick={()=>void onHistory(source.history)}>转到该时点总部记录</button>{source.entry.ref.layer!=='retrospective_inference'&&<OutcomeInferenceEditor key={JSON.stringify(source.entry.ref)} session={session} source={source} transport={transport} drafts={drafts}/>}</section>;
}

function OutcomeParticipantPanel({session,transport,onHistory,drafts}:{session:OutcomeDebriefSession;transport:Pick<Transport,'request'>;onHistory:(node:HistoryNode)=>Promise<void>;drafts:InferenceDrafts}){
 const [template,setTemplate]=useState<OutcomeParticipantTemplate|null>(null),[resolved,setResolved]=useState<Extract<OutcomeEvidenceResolution,{status:'answered'}>|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),generation=useRef(0);
 const heading=useRef<HTMLHeadingElement|null>(null);
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{if(template)heading.current?.focus();},[template]);
 const actors:Record<string,string>={HQ:'总部',R:'R组',W:'W组',INTEL:'核实与处理岗位',H:'接收岗位',ArchiveSource:'档案来源'};
 async function load(){
  const token=++generation.current;setBusy(true);setError('');setTemplate(null);setResolved(null);
  try{const response=await transport.request({kind:'get_outcome_participants',query:{run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq}});if(token!==generation.current)return;const actual=response.ok?response.debrief_participants?.template:undefined;
   if(!actual||actual.run_id!==session.run_id||actual.run_digest!==session.run_digest||actual.finished_seq!==session.finished_seq||actual.template_version!==session.template_version)throw Error('unconfirmed');setTemplate(actual);
  }catch{if(token===generation.current)setError('本局参与记录尚未核验，请重试。');}finally{if(token===generation.current)setBusy(false);}
 }
 async function resolve(ref:DebriefEvidenceRef){
  const token=++generation.current;setBusy(true);setError('');setResolved(null);
  try{const response=await transport.request({kind:'resolve_outcome_evidence',query:{run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:ref.actor_scope,layer:ref.layer,topic:'evidence',ref}});if(token!==generation.current)return;const result=response.ok?response.evidence_resolution:undefined;
   if(result?.status!=='answered'||result.history.run_id!==session.run_id||result.history.actor!==ref.actor_scope||result.history.layer!==ref.layer||result.history.revision>session.finished_seq||JSON.stringify(result.entry.ref)!==JSON.stringify(ref))throw Error('unconfirmed');setResolved(result);
  }catch{if(token===generation.current)setError('所选角色的原始引用尚未核验，请重试。');}finally{if(token===generation.current)setBusy(false);}
 }
 return <section aria-label='实际参与者陈述'><h3 ref={heading} tabIndex={-1}>实际参与者陈述</h3><p>主动读取本局活动索引；记录组织模板不代表角色当时发言，没有声明就保留缺口。</p><button disabled={busy} onClick={()=>void load()}>读取本局参与记录</button>{error&&<p role='alert'>{error}</p>}
  {template?.participants.map(participant=><article data-testid='debrief-participant' key={participant.actor}><h4>{actors[participant.actor]}</h4><p>{participant.participation==='not_participated'?'未参与':'有本局活动记录'} · {participant.declaration==='recorded'?'有当时声明，原文见当时声明层':participant.declaration==='record_missing'?'无声明／记录缺失':'无声明／当时声明未记录'}</p>{participant.missing.map(message=><p key={message}>{message}</p>)}{participant.claims.map(claim=><section key={claim.id}><strong>记录组织模板，非角色原话。</strong><p>{claim.text}</p>{claim.evidence_refs.map((ref,index)=><p key={JSON.stringify(ref)}>本角色依据 {index+1} <button disabled={busy} onClick={()=>void resolve(ref)}>定位该引用</button></p>)}</section>)}</article>)}
  {resolved&&<OriginalOutcomeRecord source={resolved} session={session} transport={transport} onHistory={onHistory} drafts={drafts} busy={busy}/>}
 </section>;
}

function OutcomeInferenceEditor({session,source,transport,drafts}:{session:OutcomeDebriefSession;source:Extract<OutcomeEvidenceResolution,{status:'answered'}>;transport:Pick<Transport,'request'>;drafts:InferenceDrafts}){
 // Keep unconfirmed text and operation identity in the stable run owner. A
 // query, original-record switch or debrief close may destroy this editor.
 const [draft]=useState(()=>{const key=JSON.stringify(source.entry.ref);let value=drafts.get(key);if(!value){value={text:'',pending:null};drafts.set(key,value);}return value;});
 const [notes,setNotes]=useState<OutcomeInferenceNote[]>([]),[text,setText]=useState(draft.text),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(draft.pending!==null);
 const generation=useRef(0),pending=useRef<OutcomeInferenceRequest|null>(draft.pending);
 const remember=(value:OutcomeInferenceRequest|null)=>{pending.current=value;draft.pending=value;};
 const matches=(note:OutcomeInferenceNote,request:OutcomeInferenceRequest)=>note.run_id===request.run_id&&note.run_digest===request.run_digest&&note.finished_seq===request.finished_seq&&note.operation_id===request.operation_id&&note.version===request.expected_version+1&&note.text===request.text&&JSON.stringify(note.target)===JSON.stringify(request.target)&&JSON.stringify(note.basis_refs)===JSON.stringify(request.basis_refs);
 useEffect(()=>()=>{generation.current++;},[]);
 const target={ref:source.entry.ref,as_of_revision:source.history.revision};
 async function load(){
  const token=++generation.current;setBusy(true);setError('');
  try{const response=await transport.request({kind:'query_outcome_debrief',query:{run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,as_of_revision:session.finished_seq,actor:'HQ',layer:'retrospective_inference',topic:'evidence'}});if(token!==generation.current)return;
   const answer=response.ok?response.debrief_answer:undefined;if(!answer||answer.run_id!==session.run_id||answer.run_digest!==session.run_digest||answer.finished_seq!==session.finished_seq||answer.as_of_revision!==session.finished_seq||answer.actor!=='HQ'||answer.layer!=='retrospective_inference'||answer.topic!=='evidence'||!['answered','insufficient_record'].includes(answer.status)||answer.entries.some(e=>!outcome_inference_receipt({note:e.record,source_digest:e.ref.source_digest})))throw Error('unconfirmed');
   const saved=answer.entries.map(e=>e.record as OutcomeInferenceNote).filter(n=>JSON.stringify(n.target.ref)===JSON.stringify(target.ref)),request=pending.current,confirmed=request?saved.find(n=>n.operation_id===request.operation_id):undefined;
   if(confirmed&&request){if(!matches(confirmed,request))throw Error('unconfirmed');remember(null);draft.text='';setText('');setUncertain(false);}
   else if(request){setUncertain(true);setError('说明保存结果待核查，原操作编号与正文已保留。');}
   setNotes(saved);setLoaded(true);
  }catch{if(token===generation.current){setLoaded(false);setError('尚未核验既有说明版本，请重新读取。');}}finally{if(token===generation.current)setBusy(false);}
 }
 async function save(){
  if(!loaded||busy)return;const request=pending.current??{run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,operation_id:crypto.randomUUID(),expected_version:notes.at(-1)?.version??0,target,basis_refs:[],text};
  if(!request.text.trim()||request.text.length>600)return;remember(request);const token=++generation.current;setBusy(true);setError('');setUncertain(false);
  try{const response=await transport.request({kind:'append_outcome_inference',envelope:request});if(token!==generation.current)return;
   if(!response.ok&&response.code==='OBJECT_VERSION_CONFLICT'){remember(null);setLoaded(false);throw Error('version');}
   const note=response.ok?response.debrief_inference?.note:undefined;
   if(!note||!matches(note,request))throw Error('unconfirmed');
   remember(null);setNotes(current=>current.some(n=>n.id===note.id)?current:[...current,note]);draft.text='';setText('');
  }catch{if(token===generation.current){setUncertain(pending.current!==null);setError(pending.current?'说明保存结果待核查，原操作编号与正文已保留。':'说明版本已有变化，请重新读取后再保存。');}}finally{if(token===generation.current)setBusy(false);}
 }
 return <details onToggle={event=>{if(event.currentTarget.open){if(!loaded&&!busy)void load();}else{generation.current++;setBusy(false);if(pending.current){setUncertain(true);setError('说明保存结果待核查，原操作编号与正文已保留。');}}}}><summary>补充事后说明</summary>
  <p>这是你现在对所选记录的解释，保留原记录及各版说明；不作为当时声明或客观因果。</p>
  {notes.map(note=><article data-testid='user-retrospective-note' key={note.id}><strong>用户事后说明 · 第{note.version}版</strong><p>{note.text}</p><p>独立登记时间（UTC）：{note.created_time}</p><p>所依记录：{note.target.ref.id} · 节点 {note.target.as_of_revision}</p></article>)}
  {error&&<p role='alert'>{error}</p>}
  {!loaded&&<button disabled={busy} onClick={()=>void load()}>重新读取说明</button>}
  <label>事后说明正文<textarea aria-label='事后说明正文' maxLength={600} value={text} disabled={!loaded||busy||pending.current!==null} onChange={event=>{draft.text=event.target.value;setText(event.target.value);}}/></label>
  {uncertain?<button disabled={!loaded||busy} onClick={()=>void save()}>重试原说明</button>:<button disabled={!loaded||busy||!text.trim()} onClick={()=>void save()}>保存事后说明</button>}
 </details>;
}

function OutcomeDecisionPanel({session,decision_ref,transport}:{session:OutcomeDebriefSession;decision_ref:OutcomeDecisionEvaluationRequest['decision_ref'];transport:Pick<Transport,'request'>}){
 const [evaluation,setEvaluation]=useState<OutcomeDecisionEvaluation|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),generation=useRef(0);
 useEffect(()=>()=>{generation.current++;},[]);
 async function evaluate(){
  const token=++generation.current;setBusy(true);setError('');setEvaluation(null);
  const query:OutcomeDecisionEvaluationRequest={run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref};
  try{const response=await transport.request({kind:'evaluate_outcome_decision',query});if(token!==generation.current)return;const result=response.ok?response.decision_evaluation:undefined;
   if(result&&result.run_id===session.run_id&&result.run_digest===session.run_digest&&result.finished_seq===session.finished_seq&&result.decision_ref.run_id===decision_ref.run_id&&result.decision_ref.kind===decision_ref.kind&&result.decision_ref.id===decision_ref.id&&result.decision_ref.version===decision_ref.version)setEvaluation(result);
   else setError('这次决定的评价尚未核验，请重试。');
  }catch{if(token===generation.current)setError('这次决定的评价尚未确认，请重试。');}finally{if(token===generation.current)setBusy(false);}
 }
 const names={'DQ-E':'证据纪律','DQ-A':'权限合规','DQ-C':'协调完整','DQ-V':'版本一致'};
 return <details><summary>查看评价详情</summary><p>按这个决定当时已掌握的材料分别核对；后来结局不补分，不计算总分或排名。</p><button disabled={busy} onClick={()=>void evaluate()}>核对本决定评价</button>
  {error&&<p role='alert'>{error}</p>}
  {evaluation&&<section aria-label='逐决定评价'><p>{evaluation.reason_status==='not_recorded'?'当时理由未记录；未填写可选理由不作为扣分项。':'当时已登记可选理由；理由不替代所需凭证。'}</p>{evaluation.dimensions.map(d=><div key={d.rule_ref.id} role='group' aria-label={names[d.rule_ref.id]}><h4>{names[d.rule_ref.id]}：{d.result==='not_evaluable'?'不可评价':d.result}</h4>{d.missing.map(message=><p key={message}>{message==='not_applicable'?'本决定不适用这项检查。':message}</p>)}<details><summary>查看规则与引用</summary><p>规则 {d.rule_ref.id} · 版本 {d.rule_ref.version}</p><p>{d.result===0?'违反检查：':'已满足检查：'}{d.matched_conditions.join('、')||'没有可核验的检查记录'}</p><ul>{d.necessary_refs.map(ref=><li key={ref.kind+':'+ref.id+':'+ref.version}>{ref.kind} · {ref.id} · 版本 {ref.version}</li>)}</ul><p>当时记录引用 {d.known_then_refs.length} 项，均限总部当时认知。</p></details></div>)}</section>}
 </details>;
}

function OutcomeEvidenceDecision({entry,session,transport}:{entry:OutcomeDebriefAnswer['entries'][number];session:OutcomeDebriefSession;transport:Pick<Transport,'request'>}){
 if(entry.ref.kind!=='decision'||entry.ref.actor_scope!=='HQ'||entry.ref.layer!=='known_then')return null;
 try{const query=parse_outcome_decision_query({run_id:session.run_id,run_digest:session.run_digest,finished_seq:session.finished_seq,decision_ref:entry.record.ref});return <OutcomeDecisionPanel session={session} decision_ref={query.decision_ref} transport={transport}/>;}catch{return null;}
}
