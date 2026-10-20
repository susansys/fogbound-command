import type {IntegratedFieldPlayerView} from './integrated-field-contracts';
import {IntegratedFieldMap} from './integrated-field-map';
import {useEffect,useRef,useState} from 'react';
import type {IntegratedFieldEnvelope as Envelope,IntegratedFieldIntent as Intent} from './integrated-field-contracts';
import type {Transport,Response} from './transport';
import type {GamePlayerView} from './play-contracts';
import {error_copy} from './player-copy';
type Props={view:IntegratedFieldPlayerView;transport:Transport;adopt:(view:GamePlayerView)=>void;onLeave:()=>Promise<void>;channelError:string;storageFault:boolean;history:boolean};
export function IntegratedFieldWorkbench({view,transport,adopt,onLeave,channelError,storageFault,history}:Props){
  const catalog=view.model_catalog;
  const current=useRef(view),adoptRef=useRef(adopt),pending=useRef<Envelope|null>(null);current.current=view;adoptRef.current=adopt;
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[uncertain,setUncertain]=useState(false);
  const [actor,setActor]=useState<'R'|'W'>('R'),[target,setTarget]=useState<'H'|'A'|'B'>('A'),[advanceTo,setAdvanceTo]=useState('1');
  function adoptResponse(response:Response){
    if(response.ok&&response.view?.scenario_kind==='play_integrated_field'&&response.view.run_id===current.current.run_id){adoptRef.current(response.view);return true;}return false;
  }
  async function pause(reason:'manual'|'focus_lost'|'application_hidden'){
    if(history)return false;if(current.current.paused)return true;
    try{const response=await transport.request({kind:'management_pause',reason});if(adoptResponse(response)&&response.ok&&response.view?.paused){setNote('暂停已确认');return true;}setError(response.ok?'STORAGE_UNCONFIRMED':response.code);}catch{setError('CHANNEL_UNCERTAIN');}return false;
  }
  useEffect(()=>{
    if(history)return;
    const lost=()=>{if(current.current.mode==='command'&&!current.current.paused)void pause(document.hidden?'application_hidden':'focus_lost');};
    const hidden=()=>{if(document.hidden)lost();};window.addEventListener('blur',lost);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',lost);document.removeEventListener('visibilitychange',hidden);};
  },[transport,history]);
  async function send(envelope:Envelope){
    if(history)return;
    setBusy(true);setError('');
    try{
      const response=await transport.request({kind:'operate_integrated_field',envelope});
      if(adoptResponse(response)){pending.current=null;setUncertain(false);setNote(envelope.intent.kind==='save'?'已保存至 '+(response.ok?response.view!.sim_time/1000:0)+' 秒':envelope.intent.kind==='integrated_move'?'移动命令已签发，等待当地接令及回报':envelope.intent.kind==='advance'?'时间推进已确认':'继续已确认');}
      else if(!response.ok){setError(response.code);if(['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED'].includes(response.code))setUncertain(true);else{pending.current=null;const fresh=await transport.request({kind:'view',run_id:envelope.run_id});adoptResponse(fresh);}}
      else{setError('CHANNEL_UNCERTAIN');setUncertain(true);}
    }catch{setError('CHANNEL_UNCERTAIN');setUncertain(true);}finally{setBusy(false);}
  }
  async function control(intent:Extract<Intent,{kind:'save'|'continue'|'advance'|'integrated_move'}>){
    if(history||busy||pending.current||storageFault)return;const active=current.current;
    const envelope={run_id:active.run_id,operation_id:crypto.randomUUID(),expected_revision:active.revision,intent};pending.current=envelope;await send(envelope);
  }
  async function recover(){
    const envelope=pending.current;if(history||!envelope||busy)return;setBusy(true);
    try{const receipt=await transport.request({kind:'receipt',run_id:envelope.run_id,operation_id:envelope.operation_id});if(!receipt.ok){setError(receipt.code);return;}if(receipt.receipt){const fresh=await transport.request({kind:'view',run_id:envelope.run_id});if(adoptResponse(fresh)){pending.current=null;setUncertain(false);setError('');setNote('原操作已确认');}}else await send(envelope);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  const unavailable=history||busy||uncertain||storageFault;
  return <div className="app integrated-workbench"><header className="topbar"><span className="brand"><span className="brand-mark">玄</span><strong>玄枢行动</strong></span><span>总部视图 · {view.mode==='command'?'指挥时间':'研究时间'}</span><output role="timer" aria-label="行动时刻" aria-live="off">{(view.sim_time/1000).toFixed(3)} 秒</output>
      {view.mode==='command'&&(view.paused?<button disabled={unavailable||view.finished} onClick={()=>void control({kind:'continue'})}>继续行动</button>:<button disabled={unavailable} onClick={()=>{setBusy(true);void pause('manual').finally(()=>setBusy(false));}}>暂停行动</button>)}
      <button disabled={unavailable} onClick={()=>void control({kind:'save'})}>保存行动</button><button disabled={busy||uncertain} onClick={()=>{setBusy(true);void (async()=>{if(history||await pause('manual'))await onLeave();})().finally(()=>setBusy(false));}}>返回演练列表</button>
    </header>
    {history&&<p className="integrated-receipt">正在查看历史记录，只读。</p>}
    {(error||channelError)&&<div className="fault" role="alert">{error_copy(error||channelError)}{storageFault&&<button onClick={()=>window.location.reload()}>返回最近记录</button>}{uncertain&&<button disabled={busy} onClick={()=>void recover()}>核对并重试原操作</button>}</div>}
    <div className="integrated-receipt" role="status">{note}</div>
    <main className="integrated-content"><h1>综合现场任务</h1><p>依照已经收到的材料组织行动。模型中的情景量与现实测量分开记录。</p><IntegratedFieldMap view={view}/>
      <section aria-label="移动与返程"><h2>移动与返程</h2><p>HA 与 AB 为登记路径，发送服务 1 秒；位置仅随总部收到的当地回报更新。</p>
        {view.actors.map(value=><p key={value.id}>{value.id} 最后确认：{value.position.point.join(', ')} m；观察 {value.position.observed_at/1000} 秒，收到 {value.position.received_at/1000} 秒。{value.position.evidence.endsWith('-blocked')?'当地已报告停候。':value.position.evidence.endsWith('-refused')?'当地已报告无法执行该移动。':''}</p>)}
        <label>行动组<select aria-label="行动组" value={actor} disabled={unavailable} onChange={event=>setActor(event.target.value as 'R'|'W')}><option value="R">R</option><option value="W">W</option></select></label>
        <label>移动目的地<select aria-label="移动目的地" value={target} disabled={unavailable} onChange={event=>setTarget(event.target.value as 'H'|'A'|'B')}><option value="H">H</option><option value="A">A</option><option value="B">B</option></select></label>
        <button disabled={unavailable||!view.can_issue} onClick={()=>void control({kind:'integrated_move',actor,target,model_ref:view.model_catalog.model_ref})}>下达移动命令</button>
        {view.mode==='research'&&<><label>推进到时刻（秒）<input aria-label="推进到时刻（秒）" type="number" min={view.sim_time/1000} max={910} step="0.001" value={advanceTo} disabled={unavailable} onChange={event=>setAdvanceTo(event.target.value)}/></label><button disabled={unavailable||view.finished||!advanceTo.trim()||!Number.isSafeInteger(Math.round(Number(advanceTo)*1000))||Number(advanceTo)*1000<=view.sim_time||Number(advanceTo)>910} onClick={()=>void control({kind:'advance',to:Math.round(Number(advanceTo)*1000)})}>推进时间</button></>}
      </section>
      <section aria-label="模型与参数目录"><h2>模型与参数目录</h2><p className="integrated-assumption">条件情景值，非现实校准</p><p>{catalog.model_ref.id} · 版本 {catalog.model_ref.version}</p>
        <div className="integrated-catalog-grid"><section><h3>几何</h3>{catalog.geometry.segments.map(segment=><p key={segment.id}>{segment.id}：{segment.length_m} m</p>)}</section>
        {catalog.configurations.map(config=><section key={config.actor}><h3>{config.actor} 携行：{config.load_kg} kg</h3><p>已占 {config.occupied_l} L / 容量 {config.capacity_l} L</p><p>{config.actor==='R'?'平板':'工具'} {config.equipment.mass_kg} kg{config.equipment.battery_included?'（已含电池）':''}</p><p>{config.equipment.battery_wh} Wh = {config.equipment.battery_nominal_j} J</p><p>本局可用 {config.equipment.battery_available_j} J（80% 条件预算）</p>{config.storage_bytes!==undefined&&<p>模型存储容量 {config.storage_bytes/1000000000} GB</p>}</section>)}</div>
        <table><caption>参数来源分类</caption><thead><tr><th scope="col">参数</th><th scope="col">值</th><th scope="col">类别与说明</th></tr></thead><tbody>{catalog.parameters.map(parameter=><tr key={parameter.id}><th scope="row">{parameter.id}</th><td>{parameter.value} {parameter.unit}</td><td>{parameter.category} · {parameter.label}<br/><small>来源 {parameter.source_ref.id} · 登记版本 {parameter.source_ref.version}</small></td></tr>)}</tbody></table>
        <details><summary>来源与版本</summary>{catalog.sources.map(source=><section key={source.id}><h3>{source.id} · 登记版本 {source.version}</h3><p>{source.document_version}</p><p>{source.publication_date??'资料发布日期未知'}；{source.sales_sku??'完整销售 SKU 未知'}</p>{source.url&&<a href={source.url} target="_blank" rel="noreferrer">查看原始公开资料</a>}</section>)}</details>
        <p>GB 表示模型中的逻辑字节量；实际保存受控小型合成载荷，不读取私人文件或复制 GB 文件。</p>
      </section>
    </main></div>;
}
