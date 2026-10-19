import {useEffect,useRef,useState} from 'react';
import type {ConflictingActionPlayerView,SaveWorkingAssessment,FacilityCondition} from './conflicting-action-contracts';
import type {GamePlayerView} from './play-contracts';
import type {Transport,Response} from './transport';
import {clock,error_copy} from './player-copy';

type Props={view:ConflictingActionPlayerView;transport:Transport;history:boolean;blocked:boolean;adopt:(view:GamePlayerView)=>void;onBusy:(busy:boolean)=>void;onDirty:(dirty:boolean)=>void;onStorageFault:()=>void};
export function ConflictingActionWorkbench(props:Props){
 const {view,transport,history,blocked,adopt,onBusy,onDirty,onStorageFault}=props;
 const latest=view.conflicting_action.assessments.at(-1);
 const [preferred,setPreferred]=useState<FacilityCondition|'undecided'>(latest?.preferred??'undecided'),[reason,setReason]=useState(latest?.reason??''),[basis,setBasis]=useState<string[]>(latest?.basis_refs.map(r=>r.id)??[]);
 const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[unknown,setUnknown]=useState(false),[stale,setStale]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const pending=useRef<SaveWorkingAssessment|null>(null),current=useRef(view),mounted=useRef(true),inFlight=useRef(false);current.current=view;
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{onBusy(busy||unknown);},[busy,unknown,onBusy]);
 useEffect(()=>{onDirty(dirty);},[dirty,onDirty]);
 useEffect(()=>{if(!dirty)return;const leave=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[dirty]);
 const active=(run:string)=>mounted.current&&current.current.run_id===run;
 function finish(response:Response,original:SaveWorkingAssessment){
  if(!active(original.run_id))return;
  if(response.ok&&response.receipt?.run_id===original.run_id&&response.receipt.operation_id===original.operation_id&&response.view&&'conflicting_action' in response.view&&response.view.run_id===original.run_id){
   const version=(original.intent.base_ref?.version??0)+1,saved=response.view.conflicting_action.assessments.find(item=>item.ref.version===version);
   if(!saved){setUnknown(true);setError('CHANNEL_UNCERTAIN');return;}
   adopt(response.view);pending.current=null;setUnknown(false);setDirty(false);setError('');setNotice('工作研判第'+saved.ref.version+'版已登记');return;
  }
  if(response.ok){setUnknown(true);setError('CHANNEL_UNCERTAIN');return;}
  setError(response.code);
  if(['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(response.code)){setUnknown(true);if(response.code!=='CHANNEL_UNCERTAIN')onStorageFault();}
  else{pending.current=null;setUnknown(false);if(['STALE_REVISION','STALE_ASSESSMENT'].includes(response.code))setStale(true);}
 }
 async function submit(retry=false){
  if(inFlight.current||history||(!retry&&(blocked||stale||unknown)))return;
  const original=retry?pending.current:{run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'save_working_assessment' as const,base_ref:latest?.ref??null,draft:{target_scope:'B' as const,explanations:['operable','faulted'] as ['operable','faulted'],preferred,basis_refs:view.conflicting_action.reports.filter(r=>basis.includes(r.ref.id)).map(r=>r.ref),...(reason?{reason}:{})}}};
  if(!original)return;pending.current=original;inFlight.current=true;setBusy(true);setError('');
  try{finish(await transport.request({kind:'operate_conflicting_action',envelope:original}),original);}catch{if(active(original.run_id)){setUnknown(true);setError('CHANNEL_UNCERTAIN');}}finally{inFlight.current=false;if(active(original.run_id))setBusy(false);}
 }
 async function query(){
  const original=pending.current;if(!original||inFlight.current||history)return;inFlight.current=true;setBusy(true);
  try{const receipt=await transport.request({kind:'receipt',run_id:original.run_id,operation_id:original.operation_id});if(!active(original.run_id))return;if(!receipt.ok){setError(receipt.code);return;}if(!receipt.receipt){setNotice('尚未查到原研判操作收据；可继续核查或重试同一操作。');return;}const response=await transport.request({kind:'view',run_id:original.run_id});finish({...response,...(response.ok?{receipt:receipt.receipt}:{})},original);}catch{if(active(original.run_id))setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;if(active(original.run_id))setBusy(false);}
 }
 async function recheck(){
  if(busy||history||unknown)return;setBusy(true);const run=view.run_id;
  try{const response=await transport.request({kind:'view',run_id:run});if(!active(run))return;if(response.ok&&response.view&&'conflicting_action' in response.view&&response.view.run_id===run){adopt(response.view);setStale(false);setError('');setNotice('当前依据已更新，未保存输入保留；请核对后明确提交。');}else setError(response.ok?'CHANNEL_UNCERTAIN':response.code);}catch{if(active(run))setError('CHANNEL_UNCERTAIN');}finally{if(active(run))setBusy(false);}
 }
 const disabled=blocked||busy||history||unknown||view.finished||!!view.termination;
 return <section className="conflicting-action-workbench" data-testid="conflicting-action-workbench" aria-label="设施冲突与工作研判">
  <h2>冲突报告下安排B点作业</h2><p>原文均未核实，来源独立性不明。工作研判保留两种解释，不替代检查、维修或行动指令。</p>
  {view.conflicting_action.reports.length===0&&<p>总部尚未收到设施原文。</p>}
  {view.conflicting_action.reports.map(report=>{const delivery=view.conflicting_action.deliveries.find(d=>d.report_ref.id===report.ref.id)!;return <article key={report.ref.id} data-testid={'facility-original-'+report.ref.id}><h3>{report.ref.id} · 未核实</h3><p>{report.text}</p><p>事件时间不详 · 观察 {report.observed_time.kind==='known'?clock(report.observed_time.value):'不详'} · 来源报告 {report.source_reported_time.kind==='known'?clock(report.source_reported_time.value):'不详'} · 发送 {clock(delivery.sent)} · 总部收到 {clock(delivery.received)}</p></article>;})}
  <h3>工作研判（可选）</h3><p>候选解释：设施可用／设施故障。未选择偏好和未填写理由也可保存。</p>
  <label>当前偏好<select aria-label="当前偏好" value={preferred} disabled={disabled} onChange={event=>{setPreferred(event.target.value as typeof preferred);setDirty(true);}}><option value="undecided">暂不判断</option><option value="operable">倾向可用</option><option value="faulted">倾向故障</option></select></label>
  <label>研判理由（可选）<textarea aria-label="研判理由（可选）" value={reason} maxLength={1000} disabled={disabled} onChange={event=>{setReason(event.target.value);setDirty(true);}}/></label>
  {view.conflicting_action.reports.map(report=><label key={report.ref.id}><input type="checkbox" aria-label={'引用设施原文 '+report.ref.id} checked={basis.includes(report.ref.id)} disabled={disabled} onChange={event=>{setBasis(previous=>event.target.checked?[...previous,report.ref.id]:previous.filter(id=>id!==report.ref.id));setDirty(true);}}/>引用设施原文 {report.ref.id}</label>)}
  <button disabled={disabled||stale||view.conflicting_action.assessments.length>=32} onClick={()=>void submit()}>保存工作研判</button>
  {dirty&&<p>当前研判输入尚未保存。</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error_copy(error)}</p>}
  {stale&&<button disabled={busy||history} onClick={()=>void recheck()}>核对最新记录并保留输入</button>}
  {unknown&&<><p>原操作结果待核查；保留原操作编号，不另建一次保存。</p><button disabled={busy||history} onClick={()=>void query()}>查询原研判结果</button><button disabled={busy||history} onClick={()=>void submit(true)}>重试原研判操作</button></>}
  <ol aria-label="已保存工作研判">{view.conflicting_action.assessments.map(item=><li key={item.ref.version}>第{item.ref.version}版 · {item.preferred==='undecided'?'暂不判断':item.preferred==='operable'?'倾向可用':'倾向故障'} · {clock(item.recorded_at)}{item.reason&&<p>{item.reason}</p>}<p>引用：{item.basis_refs.map(ref=>ref.id).join('、')||'未引用原文'}；两种解释均保留。</p></li>)}</ol>
 </section>;
}
