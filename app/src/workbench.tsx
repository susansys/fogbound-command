import { useState, useEffect, useRef } from 'react';
import type { Mode, PlayerView } from './contracts';
import { Transport, type RunSummary } from './transport';
const transport=new Transport();
export function Workbench() {
  const createOperation=useRef(crypto.randomUUID());
  const [mode,setMode]=useState<Mode>('command'),[view,setView]=useState<PlayerView|null>(null),[error,setError]=useState(''),[runs,setRuns]=useState<RunSummary[]>([]),[busy,setBusy]=useState(false);
  useEffect(()=>{void transport.request({kind:'list'}).then(r=>{if(r.ok)setRuns(r.runs??[]);else setError(r.code);});},[]);
  async function start() {
    setBusy(true);setError('');
    try {const result=await transport.request({kind:'create',mode,operation_id:createOperation.current});if(result.ok&&result.view)setView(result.view);else if(!result.ok)setError(result.code);}
    catch {setError('CHANNEL_UNCERTAIN');}finally{setBusy(false);}
  }
  return <div className="app crisis-app">
    <header className="topbar"><span className="brand"><span className="brand-mark">玄</span><strong>玄枢行动</strong><span className="brand-sub">虚构参谋工作台</span></span><span className="demo-badge">FB01 工程局</span><div className="clock"><span>{view?.mode??mode}</span><strong>{view?`${(view.sim_time/1000).toFixed(1)} s`:'00:00'}</strong><span>{view?.paused?'已暂停':'工程验证'}</span></div></header>
    {error&&<div role="alert" className="fault">{error} · 尚未确认成功，请保留当前输入。</div>}
    {!view?<main className="start"><span className="outline-tag">固定走廊移动 / 单角色 / 单任务</span><h2>从已知信息到完成回执</h2><p>目标：向R签发H→T移动命令，等待总部收到完成回执。图标显示最后收到的位置。</p><p>本批是虚构工程闭环，暂不含多编组、回收、战斗、AI或持续信息压力。</p><label>开局模式 <select aria-label="开局模式" value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="command">指挥 · command</option><option value="research">研究 · research</option></select></label><p>阅读和编辑不暂停；研究模式开局暂停，按逻辑时点显式推进。存档限同浏览器及同访问地址。</p><button className="primary" disabled={busy} onClick={()=>void start()}>开始工程局</button>{runs.map(run=><p key={run.run_id}>已保存工程局 {run.run_id.slice(0,8)} · {run.sim_time} ms</p>)}</main>:<>
    <div className="contextbar"><strong>工程走廊 H—T</strong><span>唯一编组 R · 目标工位 T</span></div><div className="shell"><nav className="rail"><button className="active">态势</button></nav><main className="main"><div className="workspacebar"><h1>总部已知态势</h1></div><div className="workbody"><section className="map"><div className="initial-map"><h2>R最后确认在H</h2><p data-testid="position">{view.position.x.toFixed(2)}, {view.position.y.toFixed(2)}</p><p>观察0 · 收到0 · 初始化凭证</p></div></section><aside className="inspector"><div className="panel-heading">原始工位报告</div><h2>工位 T</h2><p>源时点：未知</p><p>来源：{view.report.origin}</p><p>Report {view.report.id}<br/>Delivery {view.delivery.id}</p><p>观察0 · 报出0 · 收到0<br/>各自具有初始化凭证。</p><section><h3>下一允许动作</h3><p>{view.next_action}</p><p>{view.gap}</p></section></aside></div><footer className="bottom-log"><p>0.0 s · {view.log[0].text}</p></footer></main></div></>}
  </div>;
}
