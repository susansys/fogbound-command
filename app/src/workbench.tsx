import { useState, useEffect, useRef } from "react";
import type { Mode, PlayerView, Plan, Envelope, Intent,DefinitionRef,LogEntry } from "./contracts";
import {is_task_intent,task_intent,prestart_case_refs,type PrestartCaseRef} from './contracts';
import { Transport, type RunSummary } from "./transport";
import { MapView } from "./map";
import { clock,error_copy,status_copy,message_condition_copy } from "./player-copy";
import { Dialog } from "./dialog";
import {FrozenOrders} from './frozen-orders';
import {RecordSummary,RecordDetail} from './readable-log';
import {PlanDraft} from './plan-draft';
import {RegionalDisplayStore,RegionalDisplaySession} from './regional-display';
import { MapTrifold, Binoculars, PaperPlaneTilt,ClockCounterClockwise,ArrowsClockwise,Stack,ChatCenteredText,ArrowRight } from "@phosphor-icons/react";
import ms from 'milsymbol';
import type {GamePlayerView,PlayPlayerView} from './play-contracts';
import {PlayWorkbench} from './play-workbench';
const unitSymbol=new ms.Symbol('SFGPU-----*****',{size:25,fillColor:'#9ac1cd'}).asSVG();
function isRecordPlan(plan: Plan | null | undefined): plan is Extract<Plan,{kind:'record'}> {
  return !!plan && 'kind' in plan && plan.kind==='record';
}
function isMovePlan(plan: Plan | null | undefined): plan is Exclude<Plan,Extract<Plan,{kind:'record'}>> {
  return !!plan && !isRecordPlan(plan);
}
const transport = new Transport();
const displayStore=new RegionalDisplayStore();
export function Workbench() {
  const displaySession=useRef<RegionalDisplaySession|null>(null);
  const [displayStatus,setDisplayStatus]=useState('');
  const createOperation = useRef('');
  if(!createOperation.current)createOperation.current=crypto.randomUUID();
  const [definitionRef,setDefinitionRef]=useState<DefinitionRef>('FB02-ENG-RECORD');
  const [caseRef,setCaseRef]=useState<PrestartCaseRef>('normal');
  const [sceneChanging,setSceneChanging]=useState(false);
  const takeoverOperations=useRef(new Map<string,string>());
  const pendingOrder = useRef<Envelope | null>(null);
  const orderConfirmed=useRef<string|null>(null);
  const historyActive=useRef(false),restartOperation=useRef(''),liveView=useRef<GamePlayerView|null>(null);
  if(!restartOperation.current)restartOperation.current=crypto.randomUUID();
  const [reviewNode,setReviewNode]=useState('');
  const [fullReplay,setFullReplay]=useState(false);
  const [logDetail,setLogDetail]=useState<LogEntry|null>(null);
  const replayNodes=useRef<PlayerView['replay_nodes']>([]);
  const [history,setHistory]=useState(false),[reviewTo,setReviewTo]=useState('6'),[restartConfirm,setRestartConfirm]=useState(false);
  const [previousLimit,setPreviousLimit]=useState<number|null>(null);
  const pendingControl = useRef<Envelope | null>(null);
  const controlInFlight = useRef(false);
  const deferredPause = useRef<Extract<Intent,{kind:'pause'}>|null>(null);
  const issueInFlight = useRef(false);
  const [confirm, setConfirm] = useState(false),
    [controlPending,setControlPending]=useState(false),
    [advanceTo, setAdvanceTo] = useState("7"),
    [receiptNote, setReceiptNote] = useState("");
  const [selected, setSelected] = useState("R"),
    [workspace, setWorkspace] = useState<"map" | "report"|"review"|"tasks"|"log">("map"),
    [plan, setPlan] = useState<Plan | null>(null),
    [reason, setReason] = useState(""),
    [collapsed, setCollapsed] = useState(false);
  const editing = useRef(0),
    currentView = useRef<PlayerView | null>(null);
  const [mode, setMode] = useState<Mode>("command"),
    [view, setLegacyView] = useState<PlayerView | null>(null),
    [error, setError] = useState(""),
    [storageFault,setStorageFault]=useState(false),
    [runs, setRuns] = useState<RunSummary[]>([]),
    [listReady,setListReady]=useState(false),
    [busy, setBusy] = useState(false);
  const [playView,setPlayView]=useState<PlayPlayerView|null>(null);
  const shownRun=useRef<string|null>(null);shownRun.current=playView?.run_id??view?.run_id??null;
  function setView(next:GamePlayerView|null){
    if(next?.scenario_kind==='play_corridor'){setPlayView(next);setLegacyView(null);}
    else{setPlayView(null);setLegacyView(next);}
  }
  currentView.current = view;
  useEffect(()=>{if(!history){setReviewNode('');replayNodes.current=[];}},[view?.run_id,history]);
  function adoptView(next:GamePlayerView){
    if(next.scenario_kind==='play_corridor'){setPlayView(old=>!old||next.run_id===old.run_id&&next.revision>=old.revision?next:old);setLegacyView(null);}
    else setLegacyView(old=>!old||(next.run_id===old.run_id&&next.revision>=old.revision)?next:old);
  }
  useEffect(()=>transport.subscribe(response=>{
    if(response.ok&&response.view&&response.request_id.startsWith('clock-')){liveView.current=response.view;if(!historyActive.current)adoptView(response.view);}
    else if(!response.ok&&response.request_id==='clock-fault'){setError(response.code);setStorageFault(true);}
  }),[]);
  async function control(intent:Intent){
    if(historyActive.current)return;
    const current=currentView.current;if(!current)return;
    if(intent.kind==='pause'&&controlInFlight.current){deferredPause.current=intent;setControlPending(true);return;}
    if(controlInFlight.current)return;
    if(pendingControl.current&&intent.kind==='pause'&&pendingControl.current.intent.kind!=='pause')deferredPause.current=intent;
    controlInFlight.current=true;
    if(!pendingControl.current)pendingControl.current={run_id:current.run_id,operation_id:crypto.randomUUID(),expected_revision:current.revision,intent};
    setControlPending(true);
    try{
      const original=pendingControl.current;
      const result=await operate(original);
      if(original.intent.kind==='pause'&&result&&!result.ok&&result.code==='STALE_REVISION')deferredPause.current=original.intent;
    }
    finally{
      controlInFlight.current=false;
      setControlPending(!!pendingControl.current||!!deferredPause.current);
      if(!pendingControl.current&&deferredPause.current){const pause=deferredPause.current;deferredPause.current=null;await control(pause);}
    }
  }
  useEffect(()=>{
    const lost=()=>{const reason=document.hidden?'application_hidden':'focus_lost';if(historyActive.current){if(liveView.current)void transport.request({kind:'management_pause',reason}).then(r=>{if(!r.ok)setError(r.code);}).catch(()=>setError('CHANNEL_UNCERTAIN'));return;}const current=currentView.current;if(current?.mode==='command'&&!current.paused)void control({kind:'pause',reason});};
    const hidden=()=>{if(document.hidden)lost();};
    window.addEventListener('blur',lost);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',lost);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  useEffect(() => {
    void transport.request({ kind: "list" }).then((r) => {
      if (r.ok) {setRuns(r.runs ?? []);setListReady(true);}
      else setError(r.code);
    }).catch(()=>setError('CHANNEL_UNCERTAIN'));
  }, []);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await transport.request({
        kind: "create",
        mode,
        definition_ref:definitionRef,
        ...(definitionRef==='ENG-PRESTART-REPLACE'?{case_ref:caseRef}:{}),
        operation_id: createOperation.current,
      });
      if (result.ok && result.view){const run=result.view.run_id;displaySession.current=new RegionalDisplaySession(run,displayStore,true,null,text=>{if(shownRun.current===run&&!historyActive.current)setDisplayStatus(text);});setDisplayStatus('地图关联正在核验');adoptView(result.view);}
      else if (!result.ok) setError(result.code);
    } catch {
      setError("CHANNEL_UNCERTAIN");
    } finally {
      setBusy(false);
    }
  }
  async function takeover(run_id:string){
    const operation_id=takeoverOperations.current.get(run_id)??crypto.randomUUID();takeoverOperations.current.set(run_id,operation_id);
    setBusy(true);setError('');
    try{const result=await transport.request({kind:'takeover',run_id,operation_id});if(result.ok&&result.view){displaySession.current=new RegionalDisplaySession(run_id,displayStore,false,result.receipt?.snapshot_revision??null,text=>{if(shownRun.current===run_id&&!historyActive.current)setDisplayStatus(text);});setDisplayStatus(`地图关联正在核验 · 真实恢复快照 ${result.receipt?.snapshot_revision??'未经确认'} · 恢复提交 ${result.receipt?.revision??'未经确认'}`);adoptView(result.view);setStorageFault(false);setReceiptNote(result.view.paused?`已恢复至 ${clock(result.view.sim_time)}，保持暂停，${result.view.mode==='command'?'请明确继续':'可手动推进时间'}。`:'原恢复记录已确认，当前行动仍在进行，请查看时间。');}else if(!result.ok)setError(result.code);}
    catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function changeScene(){
    if(!view||busy||sceneChanging||history||controlPending||storageFault||pendingOrder.current&&orderConfirmed.current!==pendingOrder.current.operation_id)return;
    setSceneChanging(true);setError('');
    try {
      if(!view.paused)await control({kind:'pause',reason:'manual'});
      if(pendingControl.current)return;
      const confirmed=await transport.request({kind:'view',run_id:view.run_id});
      if(!confirmed.ok){setError(confirmed.code);return;}
      if(!confirmed.view?.paused){setError('CHANNEL_UNCERTAIN');return;}
      const listed=await transport.request({kind:'list'});
      if(!listed.ok){setError(listed.code);return;}
      setRuns(listed.runs??[]);setListReady(true);setView(null);liveView.current=null;
      createOperation.current=crypto.randomUUID();editing.current++;setPlan(null);setConfirm(false);setReason('');pendingOrder.current=null;orderConfirmed.current=null;
      setWorkspace('map');setSelected('R');setReceiptNote('');
    } catch {setError('CHANNEL_UNCERTAIN');}
    finally {setSceneChanging(false);}
  }
  async function replay(){
    if(!view||busy||controlPending||pendingOrder.current&&orderConfirmed.current!==pendingOrder.current.operation_id)return;setBusy(true);setError('');
    if(!history)replayNodes.current=view.replay_nodes;
    try{const result=await transport.request({kind:'replay',run_id:view.run_id,to:reviewNode?0:Math.round(Number(reviewTo)*1000),...(reviewNode?{node_revision:Number(reviewNode)}:{})});if(result.ok&&result.view){if(!historyActive.current)liveView.current=view;historyActive.current=true;setHistory(true);editing.current++;setPlan(null);setConfirm(false);setView(result.view);}else if(!result.ok)setError(result.code);}
    catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function returnCurrent(){
    if(!view)return;setBusy(true);setError('');
    try{const result=await transport.request({kind:'current',run_id:liveView.current?.run_id??view.run_id});if(result.ok&&result.view){historyActive.current=false;setHistory(false);setReviewNode("");setPreviousLimit(null);editing.current++;setPlan(null);if(!liveView.current){setListReady(false);setView(null);const listed=await transport.request({kind:'list'});if(listed.ok){setRuns(listed.runs??[]);setListReady(true);}else setError(listed.code);}else{setView(result.view);liveView.current=result.view;}}else if(!result.ok)setError(result.code);}
    catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function readRetained(run:RunSummary){
    if(busy||sceneChanging)return;setBusy(true);setError('');
    try{
      const result=await transport.request({kind:'replay',run_id:run.run_id,to:run.sim_time});
      if(result.ok&&result.view){liveView.current=null;replayNodes.current=result.view.replay_nodes;historyActive.current=true;setHistory(true);setPreviousLimit(run.sim_time);setReviewTo(String(run.sim_time/1000));setView(result.view);setWorkspace('review');}
      else if(!result.ok)setError(result.code);
    }catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function previous(){
    if(!view||history||busy||controlPending||pendingOrder.current&&orderConfirmed.current!==pendingOrder.current.operation_id)return;setBusy(true);setError('');
    try{const result=await transport.request({kind:'previous',run_id:view.run_id});if(result.ok&&result.view){liveView.current=view;replayNodes.current=result.view.replay_nodes;historyActive.current=true;setHistory(true);setPreviousLimit(result.view.sim_time);setReviewTo(String(result.view.sim_time/1000));editing.current++;setPlan(null);setConfirm(false);setView(result.view);}else if(!result.ok)setError(result.code);}
    catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function restart(){
    if(!view||history)return;setBusy(true);setError('');
    try{const result=await transport.request({kind:'restart',run_id:view.run_id,operation_id:restartOperation.current});if(result.ok&&result.view){const run=result.view.run_id;displaySession.current=new RegionalDisplaySession(run,displayStore,true,null,text=>{if(shownRun.current===run&&!historyActive.current)setDisplayStatus(text);});setDisplayStatus('地图关联正在核验');setView(result.view);liveView.current=result.view;restartOperation.current=crypto.randomUUID();setPlan(null);setConfirm(false);setReason('');pendingOrder.current=null;pendingControl.current=null;editing.current++;setWorkspace('map');setSelected('R');setAdvanceTo('7');setReceiptNote('已开启同场景的新演练，原行动保留为只读记录。这不是独立的首次体验。');setRestartConfirm(false);}else if(!result.ok)setError(result.code);}
    catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function preview() {
    if (!view) return;
    if(view.scenario_kind==='prestart_move'&&pendingOrder.current&&pendingOrder.current.operation_id===orderConfirmed.current){pendingOrder.current=null;orderConfirmed.current=null;setReason('');}
    const seq = ++editing.current;
    const context = { run_id: view.run_id, revision: view.revision };
    const isCurrent = () =>
      editing.current === seq &&
      currentView.current?.run_id === context.run_id &&
      currentView.current?.revision === context.revision;
    setBusy(true);
    setError("");
    try {
      for(let attempt=0;attempt<3;attempt++){
      const response = await transport.request({
        kind: "preview",
        run_id: view.run_id,
        revision: context.revision,
        editing_seq: seq,
      });
      if(editing.current!==seq||currentView.current?.run_id!==context.run_id||historyActive.current)return;
      if (
        response.ok &&
        response.plan &&
        response.plan.run_id === currentView.current?.run_id &&
        response.plan.revision === currentView.current?.revision &&
        response.plan.editing_seq === editing.current
      )
        {setPlan(response.plan);return;}
      if(view.mode==='command'&&(!isCurrent()||!response.ok&&response.code==='STALE_REVISION')){
        const fresh=await transport.request({kind:'view',run_id:context.run_id});
        if(editing.current!==seq||currentView.current?.run_id!==context.run_id||historyActive.current)return;
        if(!fresh.ok||!fresh.view||fresh.view.scenario_kind==='play_corridor'){if(!fresh.ok)setError(fresh.code);return;}
        if(fresh.view.revision>=currentView.current.revision){currentView.current=fresh.view;adoptView(fresh.view);}
        context.revision=currentView.current.revision;continue;
      }
      if(isCurrent()&&!response.ok)setError(response.code);return;
      }
      setReceiptNote('情况更新较快，请再次核对预案。');
    } catch {
      if (isCurrent()) setError("CHANNEL_UNCERTAIN");
    } finally {
      if(editing.current===seq&&currentView.current?.run_id===context.run_id)setBusy(false);
    }
  }
  function select(id: string) {
    setSelected(id);
    setWorkspace("map");
  }
  async function operate(envelope: Envelope) {
    setBusy(true);
    setError("");
    try {
      const response = await transport.request({ kind: "operate", envelope });
      if (response.ok && response.view && response.receipt) {
        adoptView(response.view);
        if(pendingControl.current?.operation_id===envelope.operation_id)pendingControl.current=null;
        setReceiptNote(
          is_task_intent(envelope.intent)?(response.view.scenario_kind==='prestart_move'?'通行指令已签发登记，实际发送和接受须看后续记录。':'命令已登记并发出，等待编组回报。'):response.receipt.kind==='save'?`已保存至 ${clock(response.receipt.sim_time)} · 记录序号 ${response.receipt.revision}。此后进度以最新已提交记录为准。`:response.receipt.kind==='pause'?'暂停已确认，等待明确继续。':`情况已推进至 ${clock(response.receipt.sim_time)}。`,
        );
        if(response.receipt.kind==='save')void displaySession.current?.save(response.view.revision);
        if (is_task_intent(envelope.intent)) {
          orderConfirmed.current=envelope.operation_id;
          setPlan(null);
          setConfirm(false);
        }
      } else if (!response.ok) {
        if(['STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(response.code))setStorageFault(true);
        if(pendingControl.current?.operation_id===envelope.operation_id&&['STALE_REVISION','INVALID_INPUT','MODE_LOCKED','RUN_ENDED'].includes(response.code))pendingControl.current=null;
        if (is_task_intent(envelope.intent) && ['STALE_REVISION','STALE_PLAN','INVALID_INPUT','AUTHORITY_EXPIRED','ORDER_EXISTS','REPLACEMENT_LIMIT'].includes(response.code)) pendingOrder.current = null;
        setError(response.code);
      }
      return response;
    } catch {
      setError("CHANNEL_UNCERTAIN");
    } finally {
      setBusy(false);
    }
  }
  async function issue() {
    if(issueInFlight.current)return;
    issueInFlight.current=true;setBusy(true);
    try{await issueChecked();}catch{setError('CHANNEL_UNCERTAIN');}
    finally{issueInFlight.current=false;setBusy(false);}
  }
  async function issueChecked() {
    if (!view || !plan) return;
    if(view.mode==='command'&&!pendingOrder.current){
      const shown=plan,chosenReason=reason;
      for(let attempt=0;attempt<3;attempt++){
        const current=currentView.current;if(!current)return;
        const checked=await transport.request({kind:'preview',run_id:current.run_id,revision:current.revision,editing_seq:shown.editing_seq});
        if(!checked.ok){if(checked.code==='STALE_REVISION')continue;setError(checked.code);return;}
        const latest=checked.plan;
        const keys=isRecordPlan(shown)?['actor','target','station','setup_ms','work','estimated_record_ms','estimated_total_ms','link_ms','record_energy','record_wear','record_packs'] as const:['actor','target','path','distance','estimated_move_ms','link_ms'] as const;
        if(!latest||isRecordPlan(shown)!==isRecordPlan(latest)||!latest.allowed||keys.some(key=>shown[key as keyof typeof shown]!==latest[key as keyof typeof latest])){
          if(latest)setPlan(latest);setConfirm(false);setReceiptNote('情况或任务条件已变化，请重新核对预案。');return;
        }
        pendingOrder.current={run_id:latest.run_id,operation_id:crypto.randomUUID(),expected_revision:latest.revision,intent:task_intent(latest,crypto.randomUUID(),chosenReason||undefined)};
        const result=await operate(pendingOrder.current);
        if(!result||result.ok||!['STALE_REVISION','STALE_PLAN'].includes(result.code))return;
      }
      setError('STALE_PLAN');return;
    }
    if (!pendingOrder.current)
      pendingOrder.current = {
        run_id: view.run_id,
        operation_id: crypto.randomUUID(),
        expected_revision: view.revision,
        intent:task_intent(structuredClone(plan),crypto.randomUUID(),reason||undefined),
      };
    await operate(pendingOrder.current);
  }
  async function queryReceipt(original:Envelope|null=pendingOrder.current) {
    if (!view || !original) return;
    try{
    const response = await transport.request({
      kind: "receipt",
      run_id: original.run_id,
      operation_id: original.operation_id,
    });
    if (response.ok) {
      if(response.receipt&&is_task_intent(original.intent))orderConfirmed.current=original.operation_id;
      setReceiptNote(
        response.receipt
          ? is_task_intent(original.intent)?'原命令已登记，请查看编组回报。':'原控制已登记，请查看当前时间与暂停状态。'
          : "尚未查到原命令的登记结果，请保留原命令，再查询或重试。",
      );
      if (response.receipt) {
        const current = await transport.request({
          kind: "view",
          run_id: original.run_id,
        });
        if (current.ok && current.view) {
          adoptView(current.view);
          if(is_task_intent(original.intent)){setPlan(null);setConfirm(false);}
          setError("");
          if(pendingControl.current?.operation_id===original.operation_id){pendingControl.current=null;setControlPending(false);
            if(deferredPause.current){const pause=deferredPause.current;deferredPause.current=null;void control(pause);}
          }
        }
      }
    } else setError(response.code);
    }catch{setError('CHANNEL_UNCERTAIN');}
  }
  const prestart=view?.scenario_kind==='prestart_move';
  const moveTarget=prestart&&!view?.issued_orders.length?'N':'T';
  const selectedPoint=view?.geometry[selected==='N'?'N':selected==='T'?'T':'H'];
  const lastActionReport=[...(view?.log??[])].reverse().find(entry=>entry.kind.endsWith('_receipt'));
  if(playView)return <PlayWorkbench view={playView} channelError={error} storageFault={storageFault} transport={transport} adopt={setView} history={history} onHistory={value=>{historyActive.current=value;setHistory(value);}} displaySession={displaySession.current??undefined} displayStatus={displayStatus} onLeave={async()=>{const r=await transport.request({kind:'list'});if(r.ok){setRuns(r.runs??[]);setListReady(true);setView(null);createOperation.current=crypto.randomUUID();historyActive.current=false;setHistory(false);}else setError(r.code);}}/>;
  return (
    <div className="app crisis-app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">玄</span>
          <strong>玄枢行动</strong>
          <span className="brand-sub">联合任务指挥部</span>
        </span>
        <span className="demo-badge">{(view?.scenario_kind==="record"||!view&&definitionRef==="FB02-ENG-RECORD")?"记录演练":"联络演练"}</span>
        <div className="clock">
          <span>
            {(view?.mode ?? mode) === "command" ? "指挥模式" : "演练模式"}
          </span>
          {view&&!history&&view.mode==='command'&&!view.finished&&view.status!=='deadline'&&<>
            <select aria-label="时间速率" value={view.rate} disabled={controlPending||storageFault||sceneChanging} onChange={e=>void control({kind:'rate',rate:Number(e.target.value) as 1|2|4})}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select>
            <button disabled={controlPending||storageFault||sceneChanging} onClick={()=>void control(view.paused?{kind:'continue'}:{kind:'pause',reason:'manual'})}>{controlPending?pendingControl.current?.intent.kind==='pause'?'暂停待确认':'控制待确认':view.paused?'继续':'暂停'}</button>
          </>}
          {view&&!history&&<button disabled={busy||controlPending||storageFault} onClick={()=>void control({kind:'save'})}>{controlPending&&pendingControl.current?.intent.kind==='save'?'保存待确认':'保存记录'}</button>}
          {history&&<span className="outline-tag">历史记录 · 只读</span>}
          {controlPending&&!busy&&<button onClick={()=>{if(pendingControl.current)void control(pendingControl.current.intent);}}>重试原控制</button>}
          {controlPending&&!busy&&<button onClick={()=>void queryReceipt(pendingControl.current)}>查询控制结果</button>}
          <strong>{view ? clock(view.sim_time) : "00:00"}</strong>
          <span>
            {view?.finished
              ? "任务完成"
              : view?.status === "deadline"
                ? "截止未完成"
                : view?.paused
                  ? "已暂停"
                  : "待命"}
          </span>
        </div>
      </header>
      {(error||storageFault) && (
        <div role="alert" className="fault">
          {error_copy(error||'STORAGE_UNCONFIRMED')}
          {storageFault&&<button onClick={()=>window.location.reload()}>返回最近记录</button>}
        </div>
      )}
      {!view ? (
        <main className="start">
          <span className="outline-tag">{definitionRef==='FB02-ENG-RECORD'?'记录演练 / 固定工位 / 一项任务':definitionRef==='ENG-PRESTART-REPLACE'?'替代演练 / 固定通道 / 一次准备期替代':'联络演练 / 固定通道 / 一项任务'}</span>
          <h2>{definitionRef==='FB02-ENG-RECORD'?'记录档案，等待编组完成回报':definitionRef==='ENG-PRESTART-REPLACE'?'先派往近点 N，准备期内可请求改到 T':'下达命令，等待编组抵达回报'}</h2>
          <p>
            {definitionRef==='FB02-ENG-RECORD'?'目标：指派R在工位H记录档案A，等待总部收到完成回报。图标显示最后确认的位置。':definitionRef==='ENG-PRESTART-REPLACE'?'目标：先安排R前往近联络点N；可请求一次改到远点T。只有联络组尚未开始移动时能接受替代；总部以收到的回报判断情况。':'目标：向R签发H→T移动命令，等待总部收到完成回执。图标显示最后收到的位置。'}
          </p>
          <p>
            本次演练只指挥一支编组，执行一项任务。总部依据收到的报告掌握情况。
          </p>
          <label>演练任务 <select aria-label="演练任务" value={definitionRef} disabled={busy} onChange={event=>{setDefinitionRef(event.target.value as DefinitionRef);setCaseRef('normal');}}><option value="FB02-ENG-RECORD">工位记录</option><option value="FB01-ENG-MOVE">走廊移动</option><option value="ENG-PRESTART-REPLACE">准备期替代</option><option value="B21-CORRIDOR-01">连续走廊</option></select></label>
          {definitionRef==='ENG-PRESTART-REPLACE'&&<label>消息条件 <select aria-label="消息条件" value={caseRef} disabled={busy} onChange={event=>{setCaseRef(event.target.value as PrestartCaseRef);}}>{prestart_case_refs.map(ref=><option key={ref} value={ref}>{message_condition_copy[ref]}</option>)}</select></label>}
          <label>
            时间方式{" "}
            <select
              aria-label="时间方式"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="command">指挥模式 · 时间自动推进</option>
              <option value="research">演练模式 · 手动推进时间</option>
            </select>
          </label>
          <p>
            阅读和拟定任务不会暂停。演练模式开局暂停，可用按钮推进时间。记录保存在本浏览器，再次打开请使用同一访问地址。
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void start()}
          >
            开始演练
          </button>
          <p>记录仅属于当前浏览器的用户配置和此访问地址（含端口）：{window.location.origin}。换浏览器、用户配置或地址后，请返回原入口查看；这里没有记录不代表原记录已删除。</p>
          {!listReady&&<p role="status">{error?'演练记录列表尚未确认，不能判断此入口是否有记录。':'正在读取此入口的演练记录。'}</p>}
          {listReady&&runs.length===0&&<p role="status">此入口暂无演练记录。</p>}
          {listReady&&runs.length>0&&<p>下面列出每项演练最近一局的最新进度，可能晚于手动保存的时刻。接手后保持暂停。</p>}
          {listReady&&runs.map((run) => (
            <p key={run.run_id}>
              已保存的演练记录 · {run.scenario_kind==='record'?'工位记录':run.scenario_kind==='prestart_move'?'准备期替代':'走廊移动'} · {clock(run.sim_time)}
              {!run.read_only&&<button disabled={busy} onClick={()=>void takeover(run.run_id)}>接手这场演练</button>}
              <button disabled={busy} onClick={()=>void readRetained(run)}>查看记录</button>
            </p>
          ))}
        </main>
      ) : (
        <>
          <div className="contextbar">
            <strong>{view.scenario_kind==='record'?'固定工位 H':'联络通道 H—T'}</strong>
            <span>{view.scenario_kind==='record'?'记录组 R · 目标档案 A':prestart?'联络组 R · 近点 N / 远点 T':'联络组 R · 目标联络点 T'}</span>
            <small>{view.scenario_kind==='record'?'固定作业 · 虚构区域':'120米 · 固定通道 · 虚构区域'}</small>
            {view.scenario_case&&<small>消息条件：{message_condition_copy[view.scenario_case]}</small>}
          </div>
          <div className="shell">
            <nav className="rail">
              <button
                className={workspace === "map" ? "active" : ""}
                onClick={() => setWorkspace("map")}
              >
                <MapTrifold size={24} />
                <span>态势地图</span>
              </button>
              <button className={workspace==='tasks'?'active':''} onClick={()=>setWorkspace('tasks')}><Stack size={24}/><span>任务调度</span></button>
              <button
                className={workspace === "report" ? "active" : ""}
                onClick={() => setWorkspace("report")}
              >
                <Binoculars size={24} />
                <span>情报中心</span>
              </button>
              <button className={workspace==='log'?'active':''} onClick={()=>setWorkspace('log')}><ChatCenteredText size={24}/><span>指挥记录</span></button>
              <button className={workspace==='review'?'active':''} onClick={()=>setWorkspace('review')}><ClockCounterClockwise size={24}/><span>行动复盘</span></button>
              <button disabled={busy||history||controlPending||!!pendingOrder.current&&orderConfirmed.current!==pendingOrder.current.operation_id} onClick={()=>setRestartConfirm(true)}><ArrowsClockwise size={24}/><span>重开行动</span></button>
              <button disabled={busy||sceneChanging||history||controlPending||storageFault||!!pendingOrder.current&&orderConfirmed.current!==pendingOrder.current.operation_id} onClick={()=>void changeScene()}><ArrowsClockwise size={24}/><span>{sceneChanging?'暂停并保留记录':'更换演练'}</span></button>
            </nav>
            <main className="main">
              <div className="workspacebar">
                <h1>{{map:'态势地图',review:'行动复盘',report:'情报中心',tasks:'任务调度',log:'指挥记录'}[workspace]}</h1>
                <span className="outline-tag">总部已收到的情况</span>
                {history&&<button disabled={busy} onClick={()=>void returnCurrent()}>{liveView.current?'返回当前行动':'返回演练选择'}</button>}
                {!history&&view.mode === "research" &&
                  !view.finished &&
                  view.status !== "deadline" && (
                    <div className="workspace-actions">
                      <label>
                        推进至（秒）{" "}
                        <input
                          aria-label="推进至秒"
                          type="number"
                          min={view.sim_time/1000}
                          max={610}
                          value={advanceTo}
                          onChange={(e) => setAdvanceTo(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={busy||storageFault}
                        onClick={() =>
                          void operate({
                            run_id: view.run_id,
                            operation_id: crypto.randomUUID(),
                            expected_revision: view.revision,
                            intent: { kind: "advance", to: Math.round(Number(advanceTo)*1000) },
                          })
                        }
                      >
                        推进时间
                      </button>
                    </div>
                  )}
              </div>
              {receiptNote && !history && <p className="operation-status" role="status">{receiptNote}</p>}
              <div className={`workbody workspace-${workspace}`}>
                {workspace === "map" ? (
                  <MapView
                    view={view}
                    displaySession={history?undefined:displaySession.current??undefined}
                    selected={selected}
                    onSelect={select}
                    planned={
                      !!plan || view.log.some((x) => x.kind === "issued")
                    } plannedTarget={(plan?.target??view.issued_orders.at(-1)?.plan.target)==='N'?'N':'T'}
                  />
                ) : workspace==='tasks'?(
                  <div className="content-view"><div className="content-head"><div><h2>派谁、去哪里、做什么</h2><p>{view.scenario_kind==='record'?'本次只向记录组下达一项固定工位记录任务。预览不会执行。':prestart?'先向R签发N通行任务，可登记一次准备期改到T的请求。预览不会执行，是否接受仍须等待回报。':'本次只向联络组下达一项通行任务。指令发出后仍要等确认。'}</p></div><span className="outline-tag">总部授权任务</span></div><section className="team-task"><div><img alt={view.scenario_kind==='record'?'虚构记录组':'虚构联络组'} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(unitSymbol)}`}/><h3>{view.scenario_kind==='record'?'记录组 · R':'联络组 · R'}</h3><span>{view.gap}</span></div><p>{view.scenario_kind==='record'?'记录组固定在工位H，预案对象限定为档案A。':prestart?'近点N距H为60图上米；可请求一次改到远点T，已开始移动后不能替代。':'由总部H沿固定通道抵达联络点T。'}</p><button disabled={history||!view.can_issue} onClick={()=>setSelected(view.scenario_kind==='record'?'H':'T')}>安排任务</button></section><div className="task-layout"><section className="task-main">{view.issued_orders.length?<><FrozenOrders orders={view.issued_orders}/>{prestart&&view.can_issue&&<button className="primary" disabled={busy||history||storageFault||!!pendingOrder.current&&orderConfirmed.current!==pendingOrder.current.operation_id} onClick={()=>{setSelected("T");void preview();}}>请求改到T</button>}</>:<><h3>任务预案</h3><div className="form-grid"><label>编组<select aria-label="编组" disabled={history||!view.can_issue}><option>{view.scenario_kind==='record'?'记录组 · R':'联络组 · R'}</option></select></label><label>任务内容<select aria-label="任务内容" disabled={history||!view.can_issue}><option>{view.scenario_kind==='record'?'记录档案':'通行至联络点'}</option></select></label><label>目的地<select aria-label="目的地" disabled={history||!view.can_issue}><option>{view.scenario_kind==='record'?'工位 H · 档案 A':prestart?'近联络点 N · 登记地点':'联络点 T · 登记地点'}</option></select></label><label>授权<span>指挥部已授权，至10:00</span></label></div><p>{view.scenario_kind==='record'?'固定工位 · 预计准备5秒、记录40秒；单向消息1秒。':prestart?'近点N为60图上米，预计通行15.9秒；接受后准备5秒；单向消息1秒。':'120 图上米 · 固定通道 · 预计通行31.8秒；单向消息1秒。'}</p><button className="primary" disabled={busy||history||storageFault||!view.can_issue} onClick={()=>{setSelected(view.scenario_kind==='record'?'H':moveTarget);void preview();}}>{view.scenario_kind==='record'?'查看记录预案':'查看通行预案'}</button></>}{plan&&<PlanDraft plan={plan} reason={reason} onReason={setReason} onCancel={()=>{editing.current++;setPlan(null);setBusy(false);}} onConfirm={()=>setConfirm(true)} disabled={busy||history||storageFault||!plan.allowed||!view.can_issue} history={history}/>}</section><aside className="task-aside"><h3>下达后的工作</h3><p>{status_copy(view)}</p>{view.replacement&&<p>替代已确认：原N任务改到T，重新准备。联络组接受 {clock(view.replacement.accepted_at)}，总部收到 {clock(view.replacement.received_at)}。</p>}<h3>尚缺条件</h3><p>{view.gap}</p><button onClick={()=>setWorkspace('map')}>返回态势地图 <ArrowRight/></button></aside></div></div>
                ) : workspace==='log'?(
                  <article className="content-view"><div className="content-head"><h2>指挥记录</h2><span className="outline-tag">总部已收到的记录</span></div>{view.log.map(entry=><section className="record" key={entry.id}><RecordSummary entry={entry} record={view.scenario_kind==='record'} onDetails={setLogDetail}/></section>)}</article>
                ) : workspace==='review'?(
                  <article className="report-page"><span className="outline-tag">当时收到的信息</span><h2>回看行动经过</h2><p>只按当时已收到的回报查看，不把后来的结果填回历史。查看记录不会暂停正在进行的行动。</p>{<div className="replay-navigation"><label><input type="checkbox" checked={fullReplay} onChange={e=>setFullReplay(e.target.checked)}/>展开完整提交记录</label><label>回看节点 <select aria-label="回看节点" value={reviewNode} onChange={e=>setReviewNode(e.target.value)}><option value="">按时刻回看</option>{(history?replayNodes.current:view.replay_nodes)?.filter(node=>fullReplay||node.meaningful||String(node.revision)===reviewNode).map(node=><option key={node.revision} value={node.revision}>{clock(node.at)} · {node.label}</option>)}</select></label><p>默认只列新回报和指挥操作；完整记录保留每次时间推进。同刻的记录按各自序号分别查看。</p></div>}<label>回看时刻（秒） <input aria-label="回看时刻（秒）" type="number" min={0} max={(previousLimit??(liveView.current??view).sim_time)/1000} value={reviewTo} onChange={e=>setReviewTo(e.target.value)}/></label>{!history&&view.source_run&&<button disabled={busy||controlPending||!!pendingOrder.current&&orderConfirmed.current!==pendingOrder.current.operation_id} onClick={()=>void previous()}>查看上一场记录</button>}<button disabled={busy||controlPending||!!pendingOrder.current&&orderConfirmed.current!==pendingOrder.current.operation_id} onClick={()=>void replay()}>查看当时情况</button><p>{history?'正在查看历史记录。':'仍在查看当前行动。'}</p>{history&&reviewNode&&<p>正在查看记录 {view.revision}。</p>}<p>总部最后确认：{view.position.x.toFixed(2)}, {view.position.y.toFixed(2)}；依据观察 {clock(view.position.observed)}、递交 {clock(view.position.received)} 的回报。</p>{view.log.map(entry=><section className="record" key={entry.id}><RecordSummary entry={entry} record={view.scenario_kind==='record'} onDetails={setLogDetail}/></section>)}</article>
                ) : (
                  <div className="intel-layout"><aside className="report-list"><div className="content-head"><div><h2>情报收件箱</h2><p>原始消息与递交凭证分别保留</p></div></div><button className="report-row selected" aria-pressed="true"><div><span>{view.report.origin}</span><time>{clock(view.delivery.received.value)} 收到</time></div><strong>{view.scenario_kind==='record'?'档案 A':`登记联络点 ${view.report.target}`}</strong><p>{view.scenario_kind==='record'?'关联工位 H · 原始档案报告':`关联地点 ${view.report.target} · 原始工位报告`}</p></button></aside><article className="report-detail">
                    <div className="report-toolbar"><span className="outline-tag">原始报告 · 尚未另行核实</span><button onClick={()=>select(view.scenario_kind==='record'?'H':prestart?'N':'T')}>{view.scenario_kind==='record'?'定位工位H':prestart?'定位近联络点N':'定位联络点T'} <ArrowRight/></button></div>
                    <h2>{view.scenario_kind==='record'?'档案 A':`登记联络点 ${view.report.target}`}</h2>
                    <p className="byline">来源：{view.report.origin}</p>
                    <p className="report-excerpt">
                      {view.scenario_kind==='record'?'档案A已送达总部登记口径。总部可以拟定一次固定工位记录任务；是否开始和完成，均以收到的记录组回报为准。':prestart?'近联络点N位于通道中段，T位于终点。可以先派R去N，再登记一次准备期改到T的请求；只有收到接受回报才能确认替代，不能用地图推断现场实时状态。':'联络点位于通道终点。总部可以向R下达一次通行命令；是否开始行动和抵达，均以收到的编组回报为准。'}
                    </p>
                    <div className="time-grid"><div><span>观察时间</span><strong>{clock(view.report.observed.value)}</strong></div><div><span>报出时间</span><strong>{clock(view.report.reported.value)}</strong></div><div><span>总部收到</span><strong>{clock(view.delivery.received.value)}</strong></div><div><span>事情发生的时间</span><strong>未知</strong></div></div>
                    <section><h3>核对任务条件</h3><p>原件和总部收到凭证分别保留。未知的事件时间不能由收到时间代替；尚未有另外的现场核实记录。</p><button className="primary" disabled={history} onClick={()=>setWorkspace('tasks')}>{view.scenario_kind==='record'?'拟定记录任务':'拟定通行任务'}</button></section>
                  </article></div>
                )}
                <aside className="inspector">
                  <div className="panel-heading">当前选择：{selected}</div>
                  <div className="unit-title">{selected==='R'?<img alt={view.scenario_kind==='record'?'虚构记录组':'虚构联络组'} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(unitSymbol)}`}/>:<MapTrifold aria-label="公开地点" size={25}/>}<div><h2>
                    {selected === "R"
                      ? view.scenario_kind==='record'?"记录组 R":"联络组 R"
                      : selected === "N" ? "近联络点 N" : selected === "T"
                        ? "联络点 T"
                        : view.scenario_kind==='record'?"工位 H":"总部 H"}
                  </h2><p>{selected==='R'?`${status_copy(view)} · 任务回报 ${lastActionReport?clock(lastActionReport.at):'尚无'}`:'公开地图登记地点'}</p></div></div>
                  {selected==='R'?<dl className="facts"><div><dt>职责</dt><dd>{view.scenario_kind==='record'?'在工位H记录档案A':'通行至联络点'}</dd></div><div><dt>最近位置观察</dt><dd>{clock(view.position.observed)}</dd></div><div><dt>总部收到位置</dt><dd>{clock(view.position.received)}</dd></div></dl>:<dl className="facts"><div><dt>地点类型</dt><dd>{selected==='N'?'通道近联络点':selected==='T'?'通道联络点':view.scenario_kind==='record'?'固定工位':'总部驻地'}</dd></div><div><dt>地点坐标</dt><dd>{selectedPoint?.[0].toFixed(2)}, {selectedPoint?.[1].toFixed(2)}</dd></div><div><dt>依据</dt><dd>公开地图登记</dd></div></dl>}
                  <section>
                    <h3>{selected==='R'?'总部最后确认位置':'关联编组 R · 总部最后确认位置'}</h3>
                    <p data-testid="position">
                      {view.position.x.toFixed(2)}, {view.position.y.toFixed(2)}
                    </p>
                    <p>
                      观察 {clock(view.position.observed)} · 总部收到 {clock(view.position.received)}
                    </p>
                    <small>
                      依据已收到的登记或位置回报，不代表现场实时位置
                    </small>
                  </section>
                  <details open>
                    <summary>原件与递交凭证</summary>
                    <p>事情发生的时间：未知</p>
                    <p>来源：{view.report.origin}</p>
                    <small>
                      原始工位报告与收到凭证分别保留。<br/>观察、报出与收到时间均为00:00，各有开局登记记录。
                    </small>
                    <p>
                      <button onClick={() => select(view.scenario_kind==='record'?'H':prestart?'N':'T')}>{view.scenario_kind==='record'?'定位工位H':prestart?'定位近联络点N':'定位联络点T'}</button>
                      <button onClick={() => setWorkspace("report")}>
                        查看原件
                      </button>
                    </p>
                  </details>
                  <section>
                    <h3>下一步行动</h3>
                    <p>{view.next_action}</p>
                    <p>{view.gap}</p>
                    <button
                      className="primary full"
                      disabled={busy || history || storageFault || (view.scenario_kind==='record' ? selected !== "H" : selected !== moveTarget) || !view.can_issue}
                      onClick={() => void preview()}
                    >
                      {view.scenario_kind==='record'?'查看记录预案':'查看通行预案'}
                    </button>
                  </section>
                  {plan && workspace!=='tasks' && (
                    <section className="plan">
                      <h3>待下达预案</h3>
                      {isRecordPlan(plan)?<p>记录组R在工位H记录档案A。<br/>预计准备{plan.setup_ms/1000}秒、记录{plan.estimated_record_ms/1000}秒；单向消息{plan.link_ms/1000}秒。<br/>假设消耗：记录能量{plan.record_energy}、耐久{plan.record_wear}、用品{plan.record_packs}。</p>:<p>
                        R → {plan.target} · {plan.distance}图上米
                        <br />
                        预计通行{plan.estimated_move_ms / 1000}秒，单向消息
                        {plan.link_ms / 1000}秒
                        <br />
                        指挥授权截至10:00，届时不再下达新命令
                      </p>}
                      <label>
                        指挥意图（选填）
                        <textarea
                          aria-label="指挥意图（选填）"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <p>
                        {plan.allowed
                          ? "可以下达。查看预案不会执行任务，仍需明确确认。"
                          : plan.gap}
                      </p>
                      <button
                        onClick={() => {
                          editing.current++;
                          setPlan(null);
                          setBusy(false);
                        }}
                      >
                        取消预案
                      </button>
                      {isMovePlan(plan)&&<button
                        className="primary"
                        disabled={busy || history || storageFault || !plan.allowed || !view.can_issue}
                        onClick={() => setConfirm(true)}
                      >
                        <PaperPlaneTilt />
                        下达通行命令
                      </button>}
                    </section>
                  )}
                  <section>
                    <h3>{selected==='R'?'已收到的装备状态':'关联编组 R · 已收到的装备状态'}</h3>
                    {view.scenario_kind==='record'?<p>
                      记录能量 {view.resources.record_energy ?? 0} / 20<br/>记录耐用度 {view.resources.record_wear ?? 0} / 100<br/>记录用品 {view.resources.record_packs ?? 0} / 2<br/>已确认预约：记录能量 {view.resources.record_energy_reserved ?? 0}、用品 {view.resources.record_packs_reserved ?? 0}<br/>联络器电量 {view.resources.equipment_energy} / 16<br/>联络器耐用度 {view.resources.equipment_wear} / 100<br/>总部电量 {view.resources.hq_energy ?? 0} / 16<br/>总部耐用度 {view.resources.hq_wear ?? 0} / 100
                    </p>:<p>
                      联络器电量 {view.resources.equipment_energy} / 16<br/>器材耐用度 {view.resources.equipment_wear} / 100<br/>行进储备 {view.resources.movement_energy} / 20
                      {prestart&&<><br/>已确认行进预约 {view.resources.movement_energy_reserved}；准备阶段不扣行进能量。<br/>总部电量 {view.resources.hq_energy} / 16<br/>总部耐用度 {view.resources.hq_wear} / 100</>}
                    </p>}
                    <small>依据 {clock(view.resources.confirmed_at)} 收到的回报更新</small>
                    {view.scenario_kind==='record'&&!!view.artifacts?.length&&<p>成果 · 未核验</p>}
                  </section>
                  {!history&&displayStatus&&<p className="display-record-status" aria-live="polite">{displayStatus}</p>}
                  {!history&&pendingOrder.current && error && (
                    <section>
                      <button onClick={() => void queryReceipt()}>
                        查询原命令结果
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void operate(pendingOrder.current!)}
                      >
                        重试原命令
                      </button>
                    </section>
                  )}
                  <div className="inspector-bottom"><p>先核对情报，再选择编组与地点；下达后等待小组回报。</p><button className="primary full" onClick={()=>setWorkspace(view.finished?'review':'tasks')}>{view.finished?'查看行动复盘':view.scenario_kind==='record'?'拟定记录任务':'拟定任务'} <ArrowRight/></button></div>
                </aside>
              </div>
              <footer className={`bottom-log ${collapsed ? "collapsed" : ""}`}>
                <div className="log-heading">
                  <strong>已收到记录</strong>
                  <button onClick={() => setCollapsed((x) => !x)}>
                    {collapsed ? "展开记录" : "收起记录"}
                  </button>
                </div>
                {!collapsed&&<div className="log-lines">{[...view.log].reverse().slice(0,3).map(entry=><RecordSummary key={entry.id} entry={entry} record={view.scenario_kind==='record'} onDetails={setLogDetail}/>)}</div>}
              </footer>
            </main>
          </div>
          <footer className="global-footer"><span>虚构娱乐 · 地形与行动均为演练</span><span>总部位置依据回报，非现场实时画面</span></footer>
          {confirm && plan && (
            <Dialog
              title={isRecordPlan(plan)?"确认下达记录任务":"确认下达通行命令"}
              onClose={() => {
                if (!busy) setConfirm(false);
              }}
            >
              <div className="dialog-body">
                <p>
                  {isRecordPlan(plan)?'R → 工位H / 档案A。任务登记后仍须等待记录组回报；本次演练无法撤回或更改已下达的命令。':prestart?'先签发N任务，可登记一次改到T的替代请求。只有联络组尚未开始移动时能接受；原任务和消息保留，是否接受以收到的回报为准。':'R → 联络点T / 固定走廊。命令登记后仍须等待编组回报；本次演练无法撤回或更改已下达的命令。'}
                </p>
                <p>
                  {isRecordPlan(plan)?`预计准备 ${plan.setup_ms/1000} 秒，记录 ${plan.estimated_record_ms/1000} 秒；结果只能依据收到的回报更新。`:`预计通行 ${plan.estimated_move_ms / 1000} 秒；总部位置与完成只能依据收到的回报更新。`}
                </p>
                {view.mode==='command'&&<p>确认时将按当前已收到的情况再次核对。任务参数或授权发生变化时，将返回预案重新确认。</p>}
              </div>
              <footer className="dialog-actions">
                <button disabled={busy} onClick={() => setConfirm(false)}>
                  返回预案
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void issue()}
                >
                  确认下达
                </button>
              </footer>
            </Dialog>
          )}
          {restartConfirm&&<Dialog title="重开这场演练" onClose={()=>{if(!busy)setRestartConfirm(false);}}><div className="dialog-body"><p>新演练采用相同场景与起始条件，生成新的行动记录。原行动将保留为只读记录；已经获得的经验不会消失。</p></div><footer className="dialog-actions"><button disabled={busy} onClick={()=>setRestartConfirm(false)}>保留当前行动</button><button className="primary" disabled={busy} onClick={()=>void restart()}>确认重开</button></footer></Dialog>}
          {logDetail&&<RecordDetail entry={logDetail} record={view.scenario_kind==='record'} onClose={()=>setLogDetail(null)}/>}
        </>
      )}
    </div>
  );
}
