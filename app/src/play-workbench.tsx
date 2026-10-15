import {useEffect,useRef,useState} from 'react';
import type {Intent,Envelope} from './contracts';
import type {GamePlayerView,PlayPlayerView} from './play-contracts';
import {coordinate,type SpatialScope,type Coordinate} from './spatial';
import type {RoutePlan} from './route-contracts';
import type {Transport} from './transport';
import type {RegionalDisplaySession} from './regional-display';
import {MapView} from './map';
import {clock,error_copy} from './player-copy';
import {MapTrifold,Binoculars,ChatCenteredText,ClockCounterClockwise,ArrowsClockwise} from '@phosphor-icons/react';

const kind_copy={point:'点位',area:'区域',region_set:'分离区域集合',edge:'边线',corridor:'通行走廊',unresolved:'待定位'};
const status_copy={ready:'可拟定移动任务',queued:'已签发，等待回执',accepted:'接令已知，等待终止回报',arrived:'抵达已知',blocked:'本地受阻已知',cutoff_confirmed:'截止截停已知',window_ended_unconfirmed:'移动窗口已结束，结果待回报',window_sealed_unconfirmed:'结果未确认，移动窗口记录已封存'};
const report_copy={accepted:'接令回执',arrived:'抵达定位',blocked:'受阻定位',cutoff:'截止截停定位',refused:'未接受任务回报'};
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
  const [routePoints,setRoutePoints]=useState<Array<[string,string]>|null>(null),[routePreview,setRoutePreview]=useState<RoutePlan|null>(null),[routeError,setRouteError]=useState(''),[previewBusy,setPreviewBusy]=useState(false);
  const routeSequence=useRef(0),historyRef=useRef(history);historyRef.current=history;
  const routeResult=useRef<HTMLElement|null>(null);
  const confirmingInFlight=useRef(false);
  const [confirming,setConfirming]=useState(false),[reason,setReason]=useState(''),[advanceTo,setAdvanceTo]=useState('');
  useEffect(()=>{if(routePreview)routeResult.current?.scrollIntoView({block:'nearest'});},[routePreview]);
  function changeRoute(points:Array<[string,string]>|null){routeSequence.current++;setRoutePoints(points);setRoutePreview(null);setRouteError('');setConfirming(false);}
  function beginRoute(){
    const location=current.current.position_knowledge;
    if(history||storageFault||location.status!=='known_scope'||location.scope.kind!=='point'||location.scope.uncertainty.kind!=='known'||location.scope.uncertainty.value!==0)return;
    changeRoute([[String(location.scope.typed_geometry.position[0]),String(location.scope.typed_geometry.position[1])]]);setWorkspace('map');
  }
  useEffect(()=>{changeRoute(null);},[view.run_id,history]);
  const displayedRoute:Coordinate[]|undefined=routePoints?.flatMap(pair=>{const p=pair.map(value=>value.trim()===''?NaN:Number(value));return coordinate(p)?[p]:[];});
  function addRoutePoint(point:Coordinate){
    if(!coordinate(point)){setRouteError('折点须在公开图面内，输入精度为 0.01 图上米。');return;}
    if(routePoints&&routePoints.length<64)changeRoute([...routePoints,[point[0].toFixed(2),point[1].toFixed(2)]]);
  }
  async function previewRoute(){
    if(!routePoints||history||storageFault)return;
    const path:Coordinate[]=[];
    for(const pair of routePoints){const p=pair.map(value=>value.trim()===''?NaN:Number(value));if(!coordinate(p)){setRouteError('每个折点都需要有效坐标，输入精度为 0.01 图上米。');return;}path.push(p);}
    const context=current.current,seq=routeSequence.current,{map_id,map_version,crs_id,geometry_version}=context.geometry;
    setPreviewBusy(true);setRouteError('');
    try{
      const response=await transport.request({kind:'preview',run_id:context.run_id,revision:context.revision,editing_seq:seq,route_draft:{actor:'R',map_id,map_version,crs_id,geometry_version,path}});
      if(routeSequence.current!==seq||current.current.run_id!==context.run_id||historyRef.current||current.current.geometry.geometry_version!==geometry_version)return;
      if(response.ok&&response.plan&&'kind' in response.plan&&response.plan.kind==='corridor_move'&&response.plan.run_id===context.run_id&&response.plan.revision===context.revision&&response.plan.editing_seq===seq&&response.plan.geometry_version===geometry_version)setRoutePreview(response.plan);
      else if(!response.ok)setRouteError(error_copy(response.code)+(response.field_path?` · ${response.field_path}`:''));
    }catch{if(routeSequence.current===seq)setRouteError(error_copy('CHANNEL_UNCERTAIN'));}
    finally{setPreviewBusy(false);}
  }
  const scope=selected==='R'?(view.position_knowledge.status==='known_scope'?view.position_knowledge.scope:undefined):view.geometry.scopes.find(x=>x.id===selected);
  async function control(intent:Intent,expected_revision=current.current.revision):Promise<{committed:boolean;code?:string}>{
    if(history||storageFault||operationInFlight.current)return {committed:false};
    operationInFlight.current=true;setBusy(true);setError('');
    const original=pending.current??{run_id:current.current.run_id,operation_id:crypto.randomUUID(),expected_revision,intent};pending.current=original;
    try{
      const result=await transport.request({kind:'operate_corridor',envelope:original});
      if(result.ok&&result.view){adopt(result.view);pending.current=null;if(original.intent.kind==='save'){
        setNote(`行动已保存：提交 ${result.receipt?.revision??'待核查'}。地图显示正在单独确认。`);
        const mapSaved=await displaySession?.save(result.view.revision);setNote(`行动已保存：提交 ${result.receipt?.revision??'待核查'}；${mapSaved?'地图显示也已独立保存并读回':'地图显示尚未确认保存'}。`);
      }return {committed:true};}else if(!result.ok){setError(result.code);if(!['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED'].includes(result.code))pending.current=null;return {committed:false,code:result.code};}
    }catch{setError('CHANNEL_UNCERTAIN');}
    finally{operationInFlight.current=false;setBusy(false);}
    return {committed:false,code:'CHANNEL_UNCERTAIN'};
  }
  async function issueRoute(){
    const reviewed=routePreview,run=current.current.run_id,seq=routeSequence.current;
    if(confirmingInFlight.current||!reviewed||!reviewed.allowed||reviewed.run_id!==run||reviewed.editing_seq!==seq||reviewed.geometry_version!==current.current.geometry.geometry_version||historyRef.current||pending.current)return;
    confirmingInFlight.current=true;
    setPreviewBusy(true);setRouteError('');
    try{
      const {actor,map_id,map_version,crs_id,geometry_version,path}=reviewed;
      for(let attempt=0;attempt<3;attempt++){
        const latest=await transport.request({kind:'view',run_id:run});
        if(!latest.ok){setRouteError(error_copy(latest.code));return;}
        const context=latest.view;if(!context||context.scenario_kind!=='play_corridor'||context.run_id!==run)return;
        const response=await transport.request({kind:'preview',run_id:run,revision:context.revision,editing_seq:seq,route_draft:{actor,map_id,map_version,crs_id,geometry_version,path}});
        if(current.current.run_id!==run||routeSequence.current!==seq||historyRef.current)return;
        if(!response.ok){if(response.code==='STALE_REVISION'&&attempt<2)continue;setRouteError(error_copy(response.code));return;}
        const plan=response.plan;
        if(!plan||!('kind' in plan)||plan.kind!=='corridor_move'||plan.run_id!==run||plan.revision!==context.revision||plan.editing_seq!==seq||plan.geometry_version!==geometry_version){setRouteError('未取得当前路线依据，请重新预览。');return;}
        if(JSON.stringify({...reviewed,revision:plan.revision})!==JSON.stringify(plan)){
          setRoutePreview(plan);setConfirming(false);setRouteError('情况依据有变化，请查看最新预览后重新确认。');return;
        }
        const result=await control({kind:'issue',command_id:crypto.randomUUID(),plan,...(reason.trim()?{reason:reason.trim()}:{})},plan.revision);
        if(result.committed){changeRoute(null);setReason('');return;}
        // Only a definitive non-commit can retry with a refreshed public Plan.
        if(result.code!=='STALE_REVISION'||attempt===2)return;
      }
    }catch{setRouteError(error_copy('CHANNEL_UNCERTAIN'));}
    finally{setPreviewBusy(false);confirmingInFlight.current=false;}
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
      <section className="operation-status" data-testid="movement-status" aria-live="polite"><strong>{status_copy[view.status]}</strong><span> · 移动抵达不代表完整行动成功。</span>{view.issued_orders.length>0&&<p>已下达计划，不表示实际进度</p>}</section>
      {view.mode==='research'&&!history&&<section className="operation-status"><label>推进到时刻（秒）<input aria-label="推进到时刻（秒）" inputMode="decimal" value={advanceTo} onChange={e=>setAdvanceTo(e.target.value)}/></label><button disabled={busy||storageFault||!!pending.current||advanceTo.trim()===''} onClick={()=>void control({kind:'advance',to:Math.round(Number(advanceTo)*1000)})}>推进到该时刻</button></section>}
      <div className="workbody">{workspace==='map'?<MapView view={view} selected={selected} onSelect={setSelected} planned={false} displaySession={history?undefined:displaySession} routeDraft={displayedRoute} onRoutePoint={routePoints&&!history?addRoutePoint:undefined} onRouteCancel={()=>changeRoute(null)}/>:<article className="content-view"><h2>{workspace==='scopes'?'公开范围目录':workspace==='review'?'回看当时收到的情况':'指挥记录'}</h2>{workspace==='scopes'?view.geometry.scopes.map(scope=><section key={scope.id}><button onClick={()=>{setSelected(scope.id);setWorkspace('map');}}>在地图中选择 {scope.id}</button><ScopeRead scope={scope}/></section>):workspace==='review'?<><p>历史仅显示当时已有的合法依据，不能安排或保存任务。</p><label>回看时刻（秒）<input aria-label="回看时刻（秒）" type="number" min="0" value={reviewTo} onChange={e=>setReviewTo(e.target.value)}/></label><button disabled={busy} onClick={()=>void review()}>查看当时情况</button></>:<>{view.log.map(entry=><p key={entry.id}>{clock(entry.at)} · {entry.text}</p>)}{view.received_reports.map(({report,delivery})=><section key={delivery.id} data-testid="received-report"><h3>{report_copy[report.kind]}</h3><p>{report.observed.kind==='known'?'观察 '+clock(report.observed.value):'观察时点未知'} · {report.reported.kind==='known'?'发送 '+clock(report.reported.value):'发送时点未知'} · 收到 {clock(delivery.received.value)}</p><p>{report.position_scope?.kind==='point'?'位置 '+points([report.position_scope.typed_geometry.position]):'本份回执未提供新定位'}</p></section>)}</>}</article>}
      <aside className="inspector play-inspector">{routePoints?<section className="route-editor" aria-label="未下达路线草案" onKeyDown={e=>{if(e.key==='Escape'){changeRoute(null);e.stopPropagation();}}}>
        <h2>未下达路线草案</h2><p>单击地图加点，拖动仍为平移。可直接修改折点；坐标精度 0.01 图上米。</p><p>草案尚未下达，不会保存到行动；重新打开后需重新编辑。</p>
        <ol>{routePoints.map((point,index)=><li key={index} data-route-point={index}><span>{index+1}</span>{point.map((value,axis)=><input key={axis} aria-label={`折点 ${index+1} ${axis===0?'x':'y'}`} inputMode="decimal" value={value} readOnly={index===0} onChange={e=>changeRoute(routePoints.map((p,i)=>i===index?(axis===0?[e.target.value,p[1]]:[p[0],e.target.value]):p))}/>)}<button aria-label={`删除折点 ${index+1}`} disabled={index===0} onClick={()=>changeRoute(routePoints.filter((_,i)=>i!==index))}>删</button></li>)}</ol>
        <div className="route-actions"><button disabled={routePoints.length>=64} onClick={()=>changeRoute([...routePoints,[...routePoints[routePoints.length-1]]])}>新增折点</button><button disabled={routePoints.length<=1} onClick={()=>changeRoute(routePoints.slice(0,-1))}>撤销末点</button><button onClick={()=>changeRoute(null)}>取消路线</button><button className="primary" disabled={routePoints.length<2||previewBusy||storageFault} onClick={()=>void previewRoute()}>预览路线</button></div>
        {routeError&&<p role="alert">{routeError}</p>}{routePreview&&<section ref={routeResult} data-testid="route-preview" aria-live="polite"><h3>{routePreview.allowed?'路线预览可用':'路线存在公开缺口'}</h3><p>{routePreview.distance} 图上米 · {routePreview.estimate_kind==='known'?`规则行进 ${routePreview.estimated_move_ms/1000} 秒`:'规则行进估计未知'}</p><p>单向消息等待 {routePreview.link_ms/1000} 秒另计。</p>{routePreview.gap&&<p>{routePreview.gap}</p>}{routePreview.assumptions.map(text=><p key={text}>{text}</p>)}<p>预览尚未下达；本步不执行移动。</p><button disabled={!routePreview.allowed||busy||history||storageFault} onClick={()=>setConfirming(true)}>下达移动任务</button>{confirming&&<section role="dialog" aria-label="确认移动任务"><h3>确认移动任务</h3><p>接令和抵达须等待回报；已下达计划不表示实际进度。确认时核对当前依据，有变化时需重新确认。</p><label>理由（可选）<textarea maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label><button disabled={busy||previewBusy||!!pending.current} onClick={()=>void issueRoute()}>确认并下达</button><button disabled={busy} onClick={()=>setConfirming(false)}>返回编辑</button></section>}</section>}
      </section>:<><h2>编组与范围</h2><section data-testid="position"><h3>R · 总部位置依据</h3><p>{knowledge.status==='unresolved'?'待定位':knowledge.status==='conflicting'?'位置依据存在冲突':'已收到位置依据'}</p><p>{observed.kind==='known'?`观察 ${clock(observed.value)} · 距今 ${clock(Math.max(0,view.sim_time-observed.value))}`:'观察时点未知'}</p><p>{knowledge.status!=='conflicting'&&knowledge.provenance.kind==='registered_initial'?'依据为登记的开局凭证，并非运行中的定位递交。':'依据为已收到的定位消息。'}</p></section><button disabled={history||storageFault||!view.can_issue} onClick={beginRoute}>拟定移动路线</button><section className="scope-list" aria-label="公开范围列表">{view.geometry.scopes.map(scope=><button key={scope.id} aria-label={`范围 ${scope.id}`} aria-pressed={selected===scope.id} onClick={()=>setSelected(scope.id)}>{scope.id} · {kind_copy[scope.kind]}</button>)}</section><section className="scope-detail" data-testid="scope-detail">{scope?<ScopeRead scope={scope}/>:<p>待定位；没有可聚焦的图上位置。</p>}</section><section><h3>已确认资源</h3><p>行进储备 {view.resources.movement_energy} / 20</p><p>便携链路能量 {view.resources.equipment_energy} · 耐久 {view.resources.equipment_wear}</p><p>载荷 {view.movement_basis.load} / 20 · 空间 7 / 12；记录能力本次未启用。</p></section></>}</aside></div>
      <footer className="bottom-log"><strong>已收到的记录</strong>{view.log.slice(-3).map(x=><p key={x.id}>{clock(x.at)} · {x.text}</p>)}</footer>
    </main></div>
  </div>;
}
