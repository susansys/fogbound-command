import {useEffect,useRef,useState} from 'react';
import type {Envelope,Intent} from './contracts';
import type {IntelligencePlayerView} from './intelligence-contracts';
import type {GamePlayerView} from './play-contracts';
import type {Transport,Request} from './transport';
import type {RegionalDisplaySession} from './regional-display';
import {MapView} from './map';
import {clock,error_copy} from './player-copy';
type Props={view:IntelligencePlayerView;transport:Transport;adopt:(view:GamePlayerView)=>void;history:boolean;onHistory:(value:boolean)=>void;displaySession?:RegionalDisplaySession;onLeave:()=>Promise<void>};
export function IntelligenceWorkbench({view,transport,adopt,history,onHistory,displaySession,onLeave}:Props){
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[advance,setAdvance]=useState('21'),[selected,setSelected]=useState('R'),[pauseUnknown,setPauseUnknown]=useState(false);
  const [expanded,setExpanded]=useState<string[]>([]),[node,setNode]=useState('1');
  const current=useRef(view),pending=useRef<Envelope|null>(null),inFlight=useRef(false),nodes=useRef(view.replay_nodes);current.current=view;
  if(!history)nodes.current=view.replay_nodes;
  async function request(input:Request){
    const response=await transport.request(input);
    if(response.ok&&response.view){adopt(response.view);setError('');}
    else if(!response.ok)setError(response.code);
    return response;
  }
  async function send(envelope:Envelope){
    if(inFlight.current)return;inFlight.current=true;setBusy(true);
    try{
      const result=await request({kind:'operate',envelope});
      if(result.ok){pending.current=null;setNotice('已提交 · '+clock(result.view?.sim_time??view.sim_time));}
      else if(!['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED'].includes(result.code)){pending.current=null;if(result.code==='STALE_REVISION')await request({kind:'view',run_id:view.run_id});}
    }catch{setError('CHANNEL_UNCERTAIN');}finally{inFlight.current=false;setBusy(false);}
  }
  async function control(intent:Intent){
    if(history||pending.current||inFlight.current)return;
    if(intent.kind==='pause'){
      // The existing management queue asks Game to pause its current committed
      // revision. A delayed UI revision must not prevent a requested pause.
      inFlight.current=true;setBusy(true);
      try{const result=await request({kind:'management_pause',reason:'manual'});if(result.ok&&result.view?.paused){setPauseUnknown(false);setNotice('暂停已确认，等待明确继续。');}else setPauseUnknown(true);}catch{setError('CHANNEL_UNCERTAIN');setPauseUnknown(true);}finally{inFlight.current=false;setBusy(false);}return;
    }
    const envelope={run_id:current.current.run_id,operation_id:crypto.randomUUID(),expected_revision:current.current.revision,intent};pending.current=envelope;await send(envelope);
  }
  useEffect(()=>{
    const lost=()=>{if(current.current.mode==='command'&&!current.current.paused)void transport.request({kind:'management_pause',reason:document.hidden?'application_hidden':'focus_lost'}).then(result=>{if(result.ok&&result.view){if(!history)adopt(result.view);}else if(!result.ok)setError(result.code);}).catch(()=>setError('CHANNEL_UNCERTAIN'));};
    const hidden=()=>{if(document.hidden)lost();};window.addEventListener('blur',lost);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',lost);document.removeEventListener('visibilitychange',hidden);};
  },[transport,adopt,history]);
  async function review(){
    if(busy||pending.current)return;setBusy(true);
    try{const response=await transport.request({kind:'replay',run_id:view.run_id,to:0,node_revision:Number(node)});if(response.ok&&response.view){onHistory(true);adopt(response.view);}else if(!response.ok)setError(response.code);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function currentView(){setBusy(true);try{const response=await transport.request({kind:'current',run_id:view.run_id});if(response.ok&&response.view){onHistory(false);adopt(response.view);}else if(!response.ok)setError(response.code);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}}
  async function query(){const envelope=pending.current;if(!envelope||busy)return;setBusy(true);try{const response=await transport.request({kind:'receipt',run_id:envelope.run_id,operation_id:envelope.operation_id});if(response.ok&&response.receipt){pending.current=null;await request({kind:'view',run_id:envelope.run_id});setNotice('原操作已提交，未再次执行。');}else if(!response.ok)setError(response.code);else setNotice('尚未查到原操作收据；请保留原操作核查或重试。');}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}}
  const blocked=busy||history||!!pending.current||pauseUnknown;
  return <div className="app crisis-app mission-app intelligence-app">
    <header className="topbar"><span className="brand"><span className="brand-mark">玄</span><strong>玄枢行动</strong><span className="brand-sub">联合任务指挥部</span></span><span className="demo-badge">情报协作</span><div className="clock"><strong>{clock(view.sim_time)}</strong><span>{history?'历史只读':view.paused?'已暂停':'指挥进行中'}</span></div><label>推进速度<select aria-label="推进速度" value={view.rate} disabled={blocked} onChange={event=>void control({kind:'rate',rate:Number(event.target.value) as 1|2|4})}><option value="1">1倍</option><option value="2">2倍</option><option value="4">4倍</option></select></label><button disabled={blocked||view.mode!=='command'} onClick={()=>void control(view.paused?{kind:'continue'}:{kind:'pause',reason:'manual'})}>{view.paused?'继续行动':'暂停行动'}</button><button disabled={blocked} onClick={()=>void control({kind:'save'})}>保存行动</button></header>
    {error&&<div className="fault" role="alert">{error_copy(error)}</div>}
    {pauseUnknown&&<div className="fault"><span>暂停尚未得到确认，当前状态以重新核对结果为准。</span><button disabled={busy} onClick={()=>void (async()=>{setBusy(true);try{const result=await request({kind:'view',run_id:view.run_id});if(result.ok&&result.view){setPauseUnknown(false);setNotice(result.view.paused?'暂停已确认，等待明确继续。':'当前仍在进行，可再次请求暂停。');}}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}})()}>核对暂停状态</button></div>}
    {pending.current&&!busy&&<div className="fault"><span>原操作结果待核查，操作编号已保留。</span><button onClick={()=>void query()}>查询原操作</button><button onClick={()=>pending.current&&void send(pending.current)}>重试原操作</button></div>}
    <div className="contextbar"><strong>R／W · H—A—B</strong><span>取得两处记录并等待合法回报；本批不包含返程、交接或整局结局。</span></div>
    <div className="shell"><nav className="rail"><button className="active" onClick={()=>document.getElementById('intelligence-sources')?.focus()}>情报报告</button><button onClick={()=>document.getElementById('intelligence-history')?.focus()}>当时所知</button><button disabled={blocked} onClick={()=>void (async()=>{if(!view.paused){await control({kind:'pause',reason:'manual'});if(!current.current.paused)return;}await onLeave();})()}>更换演练任务</button></nav>
    <main className="main"><div className="workspacebar"><h1>情报与协作任务</h1><span className="outline-tag">总部视图 · 凭证尚未核实</span></div>
      <p className="operation-status" role="status">{history?'仅显示所选记录提交时总部已收到的信息。':notice||view.next_action}</p>
      <div className="workbody mission-body"><MapView view={view} selected={selected} onSelect={setSelected} planned={false} displaySession={displaySession}/>
      <aside id="intelligence-sources" tabIndex={-1} className="intelligence-sources" aria-label="总部已收原始资料">
        <section role="region" aria-label="总部最后确认的编组"><h2>最后确认的编组</h2>{view.actors.map(a=><div key={a.actor}><h3>{a.actor} · {a.role==='record_keeper'?'记录组':'作业组'} · {a.people}人</h3><p>确认于 {clock(a.confirmed_at)} · {a.position_scope} · 负重 {a.load}／{a.load_capacity} · 空间 {a.space}／{a.space_capacity}</p><p>{a.actor==='R'?'记录':'维修'}能量 {a.equipment_energy} · 耐久 {a.durability} · {a.actor==='R'?'记录':'维修'}包 {a.packs}</p>{a.link&&<p>便携联络能量 {a.link.energy} · 耐久 {a.link.durability}</p>}</div>)}</section>
        <section data-testid="intelligence-processing"><h3>一个处理席位</h3><p>开局已接受工作占用至 {clock(view.processing.initial_occupied_until)}。处理能量最后确认 {view.processing.energy_confirmed}；产品须等待合法递交。</p></section>
        <h2>已收原始资料</h2><p>蓝／绿访问凭证均待核实；转发次数不等于独立来源数。</p>
        {view.source_groups.length===0&&<p>尚未收到原文。总部没有当前源时点或现场采集进展。</p>}
        {view.source_groups.map(group=>{const report=view.received_reports.find(x=>x.report.id===group.report_ref.id)!.report,open=expanded.includes(report.id);return <article className="intelligence-source" key={report.id} data-testid={'intelligence-source-'+report.id}>
          <h3>{report.typed_payload.value==='blue'?'蓝色凭证原文':'绿色凭证原文'}</h3><p>{group.delivery_refs.length}次递交 · {group.relation==='confirmed_common_original'?'已证共同原件来源组':'共同来源关系未知'}</p><p>原始主体归因未知 · 独立来源数量未知 · 内容尚未核实</p>
          <button aria-expanded={open} aria-controls={'source-details-'+report.id} onClick={()=>setExpanded(old=>open?old.filter(id=>id!==report.id):[...old,report.id])}>{open?'收起原文及递交':'展开原文及递交'}</button>
          {open&&<div id={'source-details-'+report.id}><p className="original-report">{report.text}</p><p>{report.source_descriptor}</p><p>{report.source_event_time.kind==='unknown'?'来源时点不详':'来源时点 '+clock(report.source_event_time.value)} · 观察 {report.observed.kind==='known'?clock(report.observed.value):'时点不详'} · 发布 {clock(report.source_published)}</p><ul data-testid={'intelligence-deliveries-'+report.id}>{view.received_reports.filter(x=>group.delivery_refs.includes(x.delivery.id)).map(({delivery})=><li key={delivery.id}>收到 {clock(delivery.received)} · {delivery.forward_of?'附已收到的转交凭证':'来源关系尚未明确'}</li>)}</ul></div>}
        </article>;})}
      </aside></div>
      <footer className="mission-footer"><label>历史节点<select id="intelligence-history" aria-label="历史节点" value={node} onChange={event=>setNode(event.target.value)}><option value="1">开局 · 记录 1</option>{nodes.current.map(n=><option value={n.revision} key={n.revision}>{n.label} · 记录 {n.revision}</option>)}</select></label><button disabled={busy||!!pending.current} onClick={()=>void review()}>查看历史节点</button>{history&&<button disabled={busy} onClick={()=>void currentView()}>返回当前行动</button>}{view.mode==='research'&&!history&&<label>推进到时刻（秒）<input aria-label="推进到时刻（秒）" value={advance} onChange={event=>setAdvance(event.target.value)}/><button disabled={blocked} onClick={()=>void control({kind:'advance',to:Math.round(Number(advance)*1000)})}>推进到该时刻</button></label>}</footer>
    </main></div>
  </div>;
}
