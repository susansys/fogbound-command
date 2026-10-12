import { useState, useEffect, useRef } from "react";
import type { Mode, PlayerView, Plan } from "./contracts";
import { Transport, type RunSummary } from "./transport";
import { MapView } from "./map";
const transport = new Transport();
export function Workbench() {
  const createOperation = useRef(crypto.randomUUID());
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
    [runs, setRuns] = useState<RunSummary[]>([]),
    [busy, setBusy] = useState(false);
  currentView.current = view;
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
      if (result.ok && result.view) setView(result.view);
      else if (!result.ok) setError(result.code);
    } catch {
      setError("CHANNEL_UNCERTAIN");
    } finally {
      setBusy(false);
    }
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
      if (isCurrent()) setBusy(false);
    }
  }
  function select(id: string) {
    setSelected(id);
    setWorkspace("map");
  }
  return (
    <div className="app crisis-app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">玄</span>
          <strong>玄枢行动</strong>
          <span className="brand-sub">虚构参谋工作台</span>
        </span>
        <span className="demo-badge">FB01 工程局</span>
        <div className="clock">
          <span>{view?.mode ?? mode}</span>
          <strong>
            {view ? `${(view.sim_time / 1000).toFixed(1)} s` : "00:00"}
          </strong>
          <span>{view?.paused ? "已暂停" : "工程验证"}</span>
        </div>
      </header>
      {error && (
        <div role="alert" className="fault">
          {error} · 尚未确认成功，请保留当前输入。
        </div>
      )}
      {!view ? (
        <main className="start">
          <span className="outline-tag">固定走廊移动 / 单角色 / 单任务</span>
          <h2>从已知信息到完成回执</h2>
          <p>
            目标：向R签发H→T移动命令，等待总部收到完成回执。图标显示最后收到的位置。
          </p>
          <p>
            本批是虚构工程闭环，暂不含多编组、回收、战斗、AI或持续信息压力。
          </p>
          <label>
            开局模式{" "}
            <select
              aria-label="开局模式"
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
            >
              <option value="command">指挥 · command</option>
              <option value="research">研究 · research</option>
            </select>
          </label>
          <p>
            阅读和编辑不暂停；研究模式开局暂停，按逻辑时点显式推进。存档限同浏览器及同访问地址。
          </p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => void start()}
          >
            开始工程局
          </button>
          {runs.map((run) => (
            <p key={run.run_id}>
              已保存工程局 {run.run_id.slice(0, 8)} · {run.sim_time} ms
            </p>
          ))}
        </main>
      ) : (
        <>
          <div className="contextbar">
            <strong>工程走廊 H—T</strong>
            <span>唯一编组 R · 目标工位 T</span>
            <small>120图上米 · 平地走廊 · 未校准虚构参数</small>
          </div>
          <div className="shell">
            <nav className="rail">
              <button
                className={workspace === "map" ? "active" : ""}
                onClick={() => setWorkspace("map")}
              >
                态势
              </button>
              <button
                className={workspace === "report" ? "active" : ""}
                onClick={() => setWorkspace("report")}
              >
                原件
              </button>
            </nav>
            <main className="main">
              <div className="workspacebar">
                <h1>{workspace === "map" ? "总部已知态势" : "原始工位报告"}</h1>
                <span className="outline-tag">最后确认 / 单R</span>
              </div>
              <div className="workbody">
                {workspace === "map" ? (
                  <MapView
                    view={view}
                    selected={selected}
                    onSelect={select}
                    planned={!!plan}
                  />
                ) : (
                  <article className="report-page">
                    <span className="outline-tag">唯一原件 · 不自动核实</span>
                    <h2>登记工位 T</h2>
                    <p>
                      工位位于公开走廊终点。R可在预授权窗口内接收一次H→T移动任务；是否执行与到达须等待合法反馈。
                    </p>
                    <p>来源：{view.report.origin}</p>
                    <p>源时点：未知</p>
                    <p>
                      观察{view.report.observed.value} ·{" "}
                      {view.report.observed.evidence}
                      <br />
                      报出{view.report.reported.value} ·{" "}
                      {view.report.reported.evidence}
                      <br />
                      收到{view.delivery.received.value} ·{" "}
                      {view.delivery.received.evidence}
                    </p>
                    <button onClick={() => select("T")}>定位工位T</button>
                  </article>
                )}
                <aside className="inspector">
                  <div className="panel-heading">当前选择：{selected}</div>
                  <h2>
                    {selected === "R"
                      ? "R · 联络编组"
                      : selected === "T"
                        ? "工位 T"
                        : "总部 H"}
                  </h2>
                  <section>
                    <h3>总部最后确认位置</h3>
                    <p data-testid="position">
                      {view.position.x.toFixed(2)}, {view.position.y.toFixed(2)}
                    </p>
                    <p>
                      观察 {view.position.observed} ms · 收到{" "}
                      {view.position.received} ms
                    </p>
                    <small>
                      {view.position.evidence} · 不根据当前时间推算现场
                    </small>
                  </section>
                  <details open>
                    <summary>原件与递交凭证</summary>
                    <p>源时点：未知</p>
                    <p>来源：{view.report.origin}</p>
                    <small>
                      Report {view.report.id}
                      <br />
                      Delivery {view.delivery.id}
                      <br />
                      观察0 / 报出0 / 收到0，各有初始化凭证。
                    </small>
                    <p>
                      <button onClick={() => select("T")}>定位工位T</button>
                      <button onClick={() => setWorkspace("report")}>
                        查看原件
                      </button>
                    </p>
                  </details>
                  <section>
                    <h3>下一允许动作</h3>
                    <p>{view.next_action}</p>
                    <p>{view.gap}</p>
                    <button
                      className="primary full"
                      disabled={busy || selected !== "T"}
                      onClick={() => void preview()}
                    >
                      预览移动草案
                    </button>
                  </section>
                  {plan && (
                    <section className="plan">
                      <h3>未签发草案</h3>
                      <p>
                        R → T · {plan.distance}图上米
                        <br />
                        预计移动{plan.estimated_move_ms / 1000}秒，单向消息
                        {plan.link_ms / 1000}秒
                        <br />
                        预授权窗口 [0,600000) ms
                      </p>
                      <label>
                        理由（可选）
                        <textarea
                          aria-label="理由（可选）"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </label>
                      <p>
                        {plan.allowed
                          ? "公开条件允许预览；预览不登记任务。"
                          : plan.gap}
                      </p>
                      <button
                        onClick={() => {
                          editing.current++;
                          setPlan(null);
                          setBusy(false);
                        }}
                      >
                        取消草案
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
                      <time>{(entry.at / 1000).toFixed(1)} s</time> ·{" "}
                      {entry.text}
                    </p>
                  ))}
              </footer>
            </main>
          </div>
        </>
      )}
    </div>
  );
}
