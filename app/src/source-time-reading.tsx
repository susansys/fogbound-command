import type {SourceTimePlayerView,SourceKnowledgeTime} from './source-time-contracts';
import {clock} from './player-copy';
const sourceTime=(time:SourceKnowledgeTime)=>time.kind==='unknown'?'未知':clock(time.value)+' · 依据 '+time.basis_ref.id;
export function SourceTimeReading({view}:{view:SourceTimePlayerView}){
 const reading=view.source_reading;
 return <section className='source-time-reading' aria-labelledby='source-time-title' data-testid='source-time-reading'>
  <h2 id='source-time-title'>档案背景原文</h2>
  <p>下列资料用于阅读和对照，内容尚未核实。来源关系与独立来源总数未知；不能代替任务所需的核实凭证。</p>
  {reading.reports.length===0&&<p>尚未收到档案背景原文。</p>}
  {reading.similarity_hint&&<p role='note'>{reading.similarity_hint.text}</p>}
  {reading.reports.map(report=><article key={report.ref.id} data-testid={'source-note-'+report.ref.id}>
   <details><summary>{report.ref.id} · {report.subject}</summary><p>{report.text}</p><p>来源描述：{report.source}</p>
    <dl><dt>事件时点</dt><dd>{sourceTime(report.event_time)}</dd><dt>观察时点</dt><dd>{sourceTime(report.observed_time)}</dd><dt>源报告时点</dt><dd>{sourceTime(report.source_reported_time)}</dd></dl>
    <ul aria-label={report.ref.id+'时间依据'}>{reading.bases.filter(basis=>basis.report_ref.id===report.ref.id).map(basis=><li key={basis.ref.id}>{basis.description} · {clock(basis.value)} · {basis.ref.id}</li>)}</ul>
    <ul aria-label={report.ref.id+'递交记录'}>{reading.deliveries.filter(delivery=>delivery.report_ref.id===report.ref.id).map(delivery=><li key={delivery.ref.id}>发送 {clock(delivery.sent)}；总部收到 {clock(delivery.received)} · {delivery.ref.id}</li>)}</ul>
   </details>
  </article>)}
 </section>;
}
