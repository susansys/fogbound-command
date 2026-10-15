import {useEffect,useRef,useState} from 'react';
import type {Intent,Envelope} from './contracts';
import type {GamePlayerView,PlayPlayerView} from './play-contracts';
import type {SpatialScope} from './spatial';
import type {Transport} from './transport';
import type {RegionalDisplaySession} from './regional-display';
import {MapView} from './map';
import {clock,error_copy} from './player-copy';
import {MapTrifold,Binoculars,ChatCenteredText,ClockCounterClockwise,ArrowsClockwise} from '@phosphor-icons/react';

const kind_copy={point:'点位',area:'区域',region_set:'分离区域集合',edge:'边线',corridor:'通行走廊',unresolved:'待定位'};
const points=(value:readonly (readonly number[])[])=>value.map(p=>p.map(x=>x.toFixed(2)).join(', ')).join(' → ');
function ScopeRead({scope}:{scope:SpatialScope}){
  return <><h3>{scope.id} · {kind_copy[scope.kind]}</h3>
    {scope.kind==='point'&&<p>坐标 {points([scope.typed_geometry.position])}</p>}
    {scope.kind==='area'&&<><p>外环 {points(scope.typed_geometry.outer)}</p><p>孔 {scope.typed_geometry.holes.length}</p>{scope.typed_geometry.holes.map((ring,i)=><p key={i}>孔 {i+1}：{points(ring)}</p>)}</>}
    {scope.kind==='region_set'&&<p>分别包含：{scope.typed_geometry.area_refs.join('、')}。这些区域之间的空白不属于此范围。</p>}
    {scope.kind==='edge'&&<><p>边线 {points(scope.typed_geometry.line)}</p><p>边线不代表有宽度的可通行区域。</p></>}
    {scope.kind==='corridor'&&<><p>中心线 {points(scope.typed_geometry.centerline)}</p><p>宽 {scope.typed_geometry.width} 图上米；平端边界属于通行域。</p></>}
    {scope.kind==='unresolved'&&<p>待定位，没有可用的图上位置；请从资料列表阅读。</p>}
    <p>{scope.uncertainty.kind==='known'?`误差 ${scope.uncertainty.value} 图上米`:'误差未知'} · 输入精度 {scope.precision} 图上米</p>
  </>;
}
type Props={view:PlayPlayerView;transport:Transport;adopt:(view:GamePlayerView)=>void;history:boolean;onHistory:(value:boolean)=>void;onLeave:()=>Promise<void>;displaySession?:RegionalDisplaySession;displayStatus:string;channelError:string;storageFault:boolean};
export function PlayWorkbench({view,transport,adopt,history,onHistory,onLeave,displaySession,displayStatus,channelError,storageFault}:Props){
  const [selected,setSelected]=useState('R'),[workspace,setWorkspace]=useState<'map'|'scopes'|'log'|'review'>('map');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState(''),[reviewTo,setReviewTo]=useState('0');
  const current=useRef(view);current.current=view;
  const pending=useRef<Envelope|null>(null),operationInFlight=useRef(false);
  const scope=selected==='R'?(view.position_knowledge.status==='known_scope'?view.position_knowledge.scope:undefined):view.geometry.scopes.find(x=>x.id===selected);
  async function control(intent:Intent){
    if(history||storageFault||operationInFlight.current)return;
    operationInFlight.current=true;setBusy(true);setError('');
    const original=pending.current??{run_id:current.current.run_id,operation_id:crypto.randomUUID(),expected_revision:current.current.revision,intent};pending.current=original;
    try{
      const result=await transport.request({kind:'operate',envelope:original});
      if(result.ok&&result.view){adopt(result.view);pending.current=null;if(original.intent.kind==='save'){
        setNote(`行动已保存：提交 ${result.receipt?.revision??'待核查'}。地图显示正在单独确认。`);
        const mapSaved=await displaySession?.save(result.view.revision);setNote(`行动已保存：提交 ${result.receipt?.revision??'待核查'}；${mapSaved?'地图显示也已独立保存并读回':'地图显示尚未确认保存'}。`);
      }}else if(!result.ok){setError(result.code);if(!['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED'].includes(result.code))pending.current=null;}
    }catch{setError('CHANNEL_UNCERTAIN');}
    finally{operationInFlight.current=false;setBusy(false);}
  }
  async function query(){
    const original=pending.current;if(!original||busy)return;setBusy(true);
    try{const r=await transport.request({kind:'receipt',run_id:original.run_id,operation_id:original.operation_id});if(r.ok&&r.receipt){const current=await transport.request({kind:'view',run_id:original.run_id});if(current.ok&&current.view){adopt(current.view);pending.current=null;setError('');setNote('原操作已登记，当前进度已读回。');}}else if(!r.ok)setError(r.code);else setNote('尚未查到原操作；可保留原操作并重试。');}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  useEffect(()=>{
    const lost=()=>{if(current.current.mode==='command'&&!current.current.paused)void transport.request({kind:'management_pause',reason:document.hidden?'application_hidden':'focus_lost'}).then(r=>{if(r.ok&&r.view&&!history)adopt(r.view);else if(!r.ok)setError(r.code);}).catch(()=>setError('CHANNEL_UNCERTAIN'));};
    const hidden=()=>{if(document.hidden)lost();};window.addEventListener('blur',lost);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',lost);document.removeEventListener('visibilitychange',hidden);};
  },[transport,history]);
  async function review(){
    if(busy)return;setBusy(true);setError('');
    try{const r=await transport.request({kind:'replay',run_id:view.run_id,to:Math.round(Number(reviewTo)*1000)});if(r.ok&&r.view){onHistory(true);adopt(r.view);}else if(!r.ok)setError(r.code);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function returnCurrent(){
    if(busy)return;setBusy(true);
    try{const r=await transport.request({kind:'current',run_id:view.run_id});if(r.ok&&r.view){onHistory(false);adopt(r.view);}else if(!r.ok)setError(r.code);}catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function leave(){
    if(busy||pending.current)return;
    if(history){await returnCurrent();return;}
    if(!view.paused){await control({kind:'pause',reason:'manual'});if(!current.current.paused||pending.current)return;}
    await onLeave();
  }
  const knowledge=view.position_knowledge,observed=knowledge.status==='conflicting'?knowledge.observed:knowledge.observed;
  const visibleError=channelError||error;
  return <div className="app crisis-app">
    <header className="topbar"><span className="brand"><span className="brand-mark">玄</span><strong>玄枢行动</strong><span className="brand-sub">联合任务指挥部</span></span><span className="demo-badge">走廊行动</span><div className="clock"><strong>{clock(view.sim_time)}</strong><span>{storageFault?'进度未确认':view.paused?'已暂停':'指挥进行中'}{history?' · 历史只读':''}</span></div><button disabled={busy||history||storageFault||view.mode!=='command'||!!pending.current} onClick={()=>void control(view.paused?{kind:'continue'}:{kind:'pause',reason:'manual'})}>{view.paused?'继续行动':'暂停行动'}</button><button disabled={busy||history||storageFault} onClick={()=>void control({kind:'save'})}>保存行动</button></header>
    {visibleError&&<div className="fault" role="alert">{error_copy(visibleError)}{storageFault&&<button onClick={()=>window.location.reload()}>返回最近记录</button>}{pending.current&&<><button onClick={()=>void query()}>查询原操作</button><button disabled={storageFault} onClick={()=>void control(pending.current!.intent)}>重试原操作</button></>}</div>}
    <div className="contextbar"><strong>R · H—A—B 公开走廊</strong><span>总部只依据收到的定位；范围资料不等于通行状态已确认。</span></div>
    <div className="shell"><nav className="rail"><button className={workspace==='map'?'active':''} onClick={()=>setWorkspace('map')}><MapTrifold/><span>态势地图</span></button><button className={workspace==='scopes'?'active':''} onClick={()=>setWorkspace('scopes')}><Binoculars/><span>范围资料</span></button><button className={workspace==='log'?'active':''} onClick={()=>setWorkspace('log')}><ChatCenteredText/><span>指挥记录</span></button><button className={workspace==='review'?'active':''} onClick={()=>setWorkspace('review')}><ClockCounterClockwise/><span>行动复盘</span></button><button disabled={busy||!!pending.current} onClick={()=>void leave()}><ArrowsClockwise/><span>{history?'返回当前行动':'更换演练'}</span></button></nav>
    <main className="main"><div className="workspacebar"><h1>连续走廊</h1><span className="outline-tag">总部已收到的情况</span>{history&&<button onClick={()=>void returnCurrent()}>返回当前行动</button>}</div>
      {(note||displayStatus)&&<p className="operation-status" role="status">{note} {displayStatus}</p>}
      <div className="workbody">{workspace==='map'?<MapView view={view} selected={selected} onSelect={setSelected} planned={false} displaySession={history?undefined:displaySession}/>:<article className="content-view"><h2>{workspace==='scopes'?'公开范围目录':workspace==='review'?'回看当时收到的情况':'指挥记录'}</h2>{workspace==='scopes'?view.geometry.scopes.map(scope=><section key={scope.id}><button onClick={()=>{setSelected(scope.id);setWorkspace('map');}}>在地图中选择 {scope.id}</button><ScopeRead scope={scope}/></section>):workspace==='review'?<><p>历史仅显示当时已有的合法依据，不能安排或保存任务。</p><label>回看时刻（秒）<input aria-label="回看时刻（秒）" type="number" min="0" value={reviewTo} onChange={e=>setReviewTo(e.target.value)}/></label><button disabled={busy} onClick={()=>void review()}>查看当时情况</button></>:view.log.map(entry=><p key={entry.id}>{clock(entry.at)} · {entry.text}</p>)}</article>}
      <aside className="inspector play-inspector"><h2>编组与范围</h2><section data-testid="position"><h3>R · 总部位置依据</h3><p>{knowledge.status==='unresolved'?'待定位':knowledge.status==='conflicting'?'位置依据存在冲突':'已收到位置依据'}</p><p>{observed.kind==='known'?`观察 ${clock(observed.value)} · 距今 ${clock(Math.max(0,view.sim_time-observed.value))}`:'观察时点未知'}</p><p>{knowledge.status!=='conflicting'&&knowledge.provenance.kind==='registered_initial'?'依据为登记的开局凭证，并非运行中的定位递交。':'依据为已收到的定位消息。'}</p></section><section className="scope-list" aria-label="公开范围列表">{view.geometry.scopes.map(scope=><button key={scope.id} aria-label={`范围 ${scope.id}`} aria-pressed={selected===scope.id} onClick={()=>setSelected(scope.id)}>{scope.id} · {kind_copy[scope.kind]}</button>)}</section><section className="scope-detail" data-testid="scope-detail">{scope?<ScopeRead scope={scope}/>:<p>待定位；没有可聚焦的图上位置。</p>}</section><section><h3>已确认资源</h3><p>行进储备 {view.resources.movement_energy} / 20</p><p>便携链路 {view.resources.equipment_energy} energy · {view.resources.equipment_wear} wear</p><p>载荷 9 / 20 · 空间 7 / 12；记录能力本次未启用。</p></section></aside></div>
      <footer className="bottom-log"><strong>已收到的记录</strong>{view.log.slice(-3).map(x=><p key={x.id}>{clock(x.at)} · {x.text}</p>)}</footer>
    </main></div>
  </div>;
}
