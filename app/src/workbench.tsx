import { useState, useEffect, useRef } from "react";
import type { Mode, PlayerView, Plan, Envelope, Intent } from "./contracts";
import { Transport, type RunSummary } from "./transport";
import { MapView } from "./map";
import { clock,error_copy,log_copy } from "./player-copy";
import { Dialog } from "./dialog";
import { MapTrifold, Binoculars, PaperPlaneTilt } from "@phosphor-icons/react";
const transport = new Transport();
export function Workbench() {
  const createOperation = useRef(crypto.randomUUID());
  const takeoverOperations=useRef(new Map<string,string>());
  const pendingOrder = useRef<Envelope | null>(null);
  const pendingControl = useRef<Envelope | null>(null);
  const controlInFlight = useRef(false);
  const deferredPause = useRef<Extract<Intent,{kind:'pause'}>|null>(null);
  const issueInFlight = useRef(false);
  const [confirm, setConfirm] = useState(false),
    [controlPending,setControlPending]=useState(false),
    [advanceTo, setAdvanceTo] = useState("7"),
    [receiptNote, setReceiptNote] = useState("");
  const [selected, setSelected] = useState("R"),
    [workspace, setWorkspace] = useState<"map" | "report">("map"),
    [plan, setPlan] = useState<Plan | null>(null),
    [reason, setReason] = useState(""),
    [collapsed, setCollapsed] = useState(false);
  const editing = useRef(0),
    currentView = useRef<PlayerView | null>(null);
  const [mode, setMode] = useState<Mode>("command"),
    [view, setView] = useState<PlayerView | null>(null),
    [error, setError] = useState(""),
    [storageFault,setStorageFault]=useState(false),
    [runs, setRuns] = useState<RunSummary[]>([]),
    [busy, setBusy] = useState(false);
  currentView.current = view;
  function adoptView(next:PlayerView){setView(old=>!old||(next.run_id===old.run_id&&next.revision>=old.revision)?next:old);}
  useEffect(()=>transport.subscribe(response=>{
    if(response.ok&&response.view)adoptView(response.view);
    else if(!response.ok&&response.request_id==='clock-fault'){setError(response.code);setStorageFault(true);}
  }),[]);
  async function control(intent:Intent){
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
      if(!pendingControl.current&&deferredPause.current){const pause=deferredPause.current;deferredPause.current=null;void control(pause);}
    }
  }
  useEffect(()=>{
    const lost=()=>{const current=currentView.current;if(current?.mode==='command'&&!current.paused)void control({kind:'pause',reason:document.hidden?'application_hidden':'focus_lost'});};
    const hidden=()=>{if(document.hidden)lost();};
    window.addEventListener('blur',lost);document.addEventListener('visibilitychange',hidden);
    return()=>{window.removeEventListener('blur',lost);document.removeEventListener('visibilitychange',hidden);};
  },[]);
  useEffect(() => {
    void transport.request({ kind: "list" }).then((r) => {
      if (r.ok) setRuns(r.runs ?? []);
      else setError(r.code);
    });
  }, []);
  async function start() {
    setBusy(true);
    setError("");
    try {
      const result = await transport.request({
        kind: "create",
        mode,
        operation_id: createOperation.current,
      });
      if (result.ok && result.view) adoptView(result.view);
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
    try{const result=await transport.request({kind:'takeover',run_id,operation_id});if(result.ok&&result.view){adoptView(result.view);setStorageFault(false);setReceiptNote(result.view.paused?`已恢复至 ${clock(result.view.sim_time)}，保持暂停，${result.view.mode==='command'?'请明确继续':'可手动推进时间'}。`:'原恢复记录已确认，当前行动仍在进行，请查看时间。');}else if(!result.ok)setError(result.code);}
    catch{setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  async function preview() {
    if (!view) return;
    const seq = ++editing.current;
    const context = { run_id: view.run_id, revision: view.revision };
    const isCurrent = () =>
      editing.current === seq &&
      currentView.current?.run_id === context.run_id &&
      currentView.current?.revision === context.revision;
    setBusy(true);
    setError("");
    try {
      const response = await transport.request({
        kind: "preview",
        run_id: view.run_id,
        revision: view.revision,
        editing_seq: seq,
      });
      if (!isCurrent()) return;
      if (
        response.ok &&
        response.plan &&
        response.plan.run_id === currentView.current?.run_id &&
        response.plan.revision === currentView.current?.revision &&
        response.plan.editing_seq === editing.current
      )
        setPlan(response.plan);
      else if (!response.ok) setError(response.code);
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
          response.receipt.kind==='issue'?'命令已登记并发出，等待编组回报。':response.receipt.kind==='save'?`已保存至 ${clock(response.receipt.sim_time)} · 记录序号 ${response.receipt.revision}。此后进度以最新已提交记录为准。`:response.receipt.kind==='pause'?'暂停已确认，等待明确继续。':`情况已推进至 ${clock(response.receipt.sim_time)}。`,
        );
        if (envelope.intent.kind === "issue") {
          setPlan(null);
          setConfirm(false);
        }
      } else if (!response.ok) {
        if(['STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(response.code))setStorageFault(true);
        if(pendingControl.current?.operation_id===envelope.operation_id&&['STALE_REVISION','INVALID_INPUT','MODE_LOCKED','RUN_ENDED'].includes(response.code))pendingControl.current=null;
        if (envelope.intent.kind === 'issue' && ['STALE_REVISION','STALE_PLAN','INVALID_INPUT','AUTHORITY_EXPIRED','ORDER_EXISTS'].includes(response.code)) pendingOrder.current = null;
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
        if(!latest||!latest.allowed||['actor','target','path','distance','estimated_move_ms','link_ms'].some(key=>shown[key as keyof Plan]!==latest[key as keyof Plan])){
          if(latest)setPlan(latest);setConfirm(false);setReceiptNote('情况或任务条件已变化，请重新核对预案。');return;
        }
        pendingOrder.current={run_id:latest.run_id,operation_id:crypto.randomUUID(),expected_revision:latest.revision,intent:{kind:'issue',command_id:crypto.randomUUID(),plan:latest,...(chosenReason?{reason:chosenReason}:{})}};
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
        intent: {
          kind: "issue",
          command_id: crypto.randomUUID(),
          plan: structuredClone(plan),
          ...(reason ? { reason } : {}),
        },
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
      setReceiptNote(
        response.receipt
          ? original.intent.kind==='issue'?'原命令已登记，请查看编组回报。':'原控制已登记，请查看当前时间与暂停状态。'
          : "尚未查到原命令的登记结果，请保留原命令，再查询或重试。",
      );
      if (response.receipt) {
        const current = await transport.request({
          kind: "view",
          run_id: original.run_id,
        });
        if (current.ok && current.view) {
          adoptView(current.view);
          if(original.intent.kind==='issue'){setPlan(null);setConfirm(false);}
          setError("");
          if(pendingControl.current?.operation_id===original.operation_id){pendingControl.current=null;setControlPending(false);
            if(deferredPause.current){const pause=deferredPause.current;deferredPause.current=null;void control(pause);}
          }
        }
      }
    } else setError(response.code);
    }catch{setError('CHANNEL_UNCERTAIN');}
  }
  return (
    <div className="app crisis-app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">玄</span>
          <strong>玄枢行动</strong>
          <span className="brand-sub">联合任务指挥部</span>
        </span>
        <span className="demo-badge">联络演练</span>
        <div className="clock">
          <span>
            {(view?.mode ?? mode) === "command" ? "指挥模式" : "演练模式"}
          </span>
          {view&&view.mode==='command'&&!view.finished&&view.status!=='deadline'&&<>
            <select aria-label="时间速率" value={view.rate} disabled={controlPending||storageFault} onChange={e=>void control({kind:'rate',rate:Number(e.target.value) as 1|2|4})}><option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option></select>
            <button disabled={controlPending||storageFault} onClick={()=>void control(view.paused?{kind:'continue'}:{kind:'pause',reason:'manual'})}>{controlPending?pendingControl.current?.intent.kind==='pause'?'暂停待确认':'控制待确认':view.paused?'继续':'暂停'}</button>
          </>}
          {view&&<button disabled={busy||controlPending||storageFault} onClick={()=>void control({kind:'save'})}>{controlPending&&pendingControl.current?.intent.kind==='save'?'保存待确认':'保存记录'}</button>}
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
          <span className="outline-tag">联络演练 / 固定通道 / 一项任务</span>
          <h2>下达命令，等待编组抵达回报</h2>
          <p>
            目标：向R签发H→T移动命令，等待总部收到完成回执。图标显示最后收到的位置。
          </p>
          <p>
            本次演练只指挥一支联络组，执行一次通行任务。总部依据收到的报告掌握情况。
          </p>
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
          {runs.map((run) => (
            <p key={run.run_id}>
              已保存的演练记录 · {clock(run.sim_time)}
              <button disabled={busy} onClick={()=>void takeover(run.run_id)}>接手这场演练</button>
            </p>
          ))}
        </main>
      ) : (
        <>
          <div className="contextbar">
            <strong>联络通道 H—T</strong>
            <span>联络组 R · 目标联络点 T</span>
            <small>120米 · 固定通道 · 虚构区域</small>
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
              <button
                className={workspace === "report" ? "active" : ""}
                onClick={() => setWorkspace("report")}
              >
                <Binoculars size={24} />
                <span>情报中心</span>
              </button>
            </nav>
            <main className="main">
              <div className="workspacebar">
                <h1>{workspace === "map" ? "态势地图" : "情报中心"}</h1>
                <span className="outline-tag">总部已收到的情况</span>
                {view.mode === "research" &&
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
              <div className="workbody">
                {workspace === "map" ? (
                  <MapView
                    view={view}
                    selected={selected}
                    onSelect={select}
                    planned={
                      !!plan || view.log.some((x) => x.kind === "issued")
                    }
                  />
                ) : (
                  <article className="report-page">
                    <span className="outline-tag">原始报告 · 尚未另行核实</span>
                    <h2>登记联络点 T</h2>
                    <p>
                      联络点位于通道终点。总部可以向R下达一次通行命令；是否开始行动和抵达，均以收到的编组回报为准。
                    </p>
                    <p>来源：{view.report.origin}</p>
                    <p>事情发生的时间：未知</p>
                    <p>
                      观察时间：{clock(view.report.observed.value)}<br/>报出时间：{clock(view.report.reported.value)}<br/>总部收到：{clock(view.delivery.received.value)}
                    </p>
                    <button onClick={() => select("T")}>定位联络点T</button>
                  </article>
                )}
                <aside className="inspector">
                  <div className="panel-heading">当前选择：{selected}</div>
                  <h2>
                    {selected === "R"
                      ? "联络组 R"
                      : selected === "T"
                        ? "联络点 T"
                        : "总部 H"}
                  </h2>
                  <section>
                    <h3>总部最后确认位置</h3>
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
                      <button onClick={() => select("T")}>定位联络点T</button>
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
                      disabled={busy || storageFault || selected !== "T" || !view.can_issue}
                      onClick={() => void preview()}
                    >
                      查看通行预案
                    </button>
                  </section>
                  {plan && (
                    <section className="plan">
                      <h3>待下达预案</h3>
                      <p>
                        R → T · {plan.distance}图上米
                        <br />
                        预计通行{plan.estimated_move_ms / 1000}秒，单向消息
                        {plan.link_ms / 1000}秒
                        <br />
                        指挥授权截至10:00，届时不再下达新命令
                      </p>
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
                      <button
                        className="primary"
                        disabled={busy || storageFault || !plan.allowed || !view.can_issue}
                        onClick={() => setConfirm(true)}
                      >
                        <PaperPlaneTilt />
                        下达通行命令
                      </button>
                    </section>
                  )}
                  <section>
                    <h3>已收到的装备状态</h3>
                    <p>
                      联络器电量 {view.resources.equipment_energy} / 16<br/>器材耐用度 {view.resources.equipment_wear} / 100<br/>行进储备 {view.resources.movement_energy} / 20
                    </p>
                    <small>依据 {clock(view.resources.confirmed_at)} 收到的回报更新</small>
                  </section>
                  {receiptNote && <p role="status">{receiptNote}</p>}
                  {pendingOrder.current && error && (
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
                </aside>
              </div>
              <footer className={`bottom-log ${collapsed ? "collapsed" : ""}`}>
                <div className="log-heading">
                  <strong>已收到记录</strong>
                  <button onClick={() => setCollapsed((x) => !x)}>
                    {collapsed ? "展开记录" : "收起记录"}
                  </button>
                </div>
                {!collapsed &&
                  view.log.map((entry) => (
                    <p key={entry.id}>
                      <time>{clock(entry.at)}</time> ·{" "}
                      {log_copy(entry)}
                    </p>
                  ))}
              </footer>
            </main>
          </div>
          {confirm && plan && (
            <Dialog
              title="确认下达通行命令"
              onClose={() => {
                if (!busy) setConfirm(false);
              }}
            >
              <div className="dialog-body">
                <p>
                  R → 联络点T /
                  固定走廊。命令登记后仍须等待编组回报；本次演练无法撤回或更改已下达的命令。
                </p>
                <p>
                  预计通行 {plan.estimated_move_ms / 1000}{" "}
                  秒；总部位置与完成只能依据收到的回报更新。
                </p>
                {view.mode==='command'&&<p>确认时将按当前已收到的情况再次核对。通行参数或授权发生变化时，将返回预案重新确认。</p>}
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
        </>
      )}
    </div>
  );
}
