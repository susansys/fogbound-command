import type {SourceTimePlayerView,SourceKnowledgeTime} from './source-time-contracts';
import {clock} from './player-copy';
import {useState} from 'react';
const sourceTime=(time:SourceKnowledgeTime)=>time.kind==='unknown'?'未知':clock(time.value)+' · 依据 '+time.basis_ref.id;
export function SourceTimeReading({view}:{view:SourceTimePlayerView}){
 const reading=view.source_reading,[folded,setFolded]=useState<Record<string,boolean>>({});
 const foldKey=(id:string)=>view.run_id+':'+id;
 const hidden=(id:string)=>reading.groups.some(group=>folded[foldKey(group.relation_ref.id)]&&group.report_refs.slice(1).some(ref=>ref.id===id));
 return <section className='source-time-reading' aria-labelledby='source-time-title' data-testid='source-time-reading'>
  <h2 id='source-time-title'>档案背景原文</h2>
  <p>下列资料用于阅读和对照，内容尚未核实。{reading.relations.length===0&&reading.scoped_independence.length===0?'来源关系与独立来源总数未知':'未有合法凭证的来源关系未知；独立来源总数未知'}；不能代替任务所需的核实凭证。</p>
  {reading.reports.length===0&&<p>尚未收到档案背景原文。</p>}
  {reading.similarity_hint&&<p role='note'>{reading.similarity_hint.text}</p>}
  <div aria-label='收到凭证支持的来源关系'>
   {reading.relations.map(relation=><div key={relation.ref.id}>
    <p>{relation.ref.id} · {relation.from_report_ref.id} 转述 {relation.to_report_ref.id} · {relation.status==='confirmed'?'已收到明确转述凭证':relation.status==='retracted'?'撤销后关联未知，未证明第三个独立来源':'凭证冲突，保留双方记录且不归组'} · 依据 {relation.supporting_evidence_ref.id}{relation.retraction_ref&&<>；撤销凭证 {relation.retraction_ref.id}</>}</p>
    <button type='button' aria-label={'展开或收起 '+relation.ref.id+' 转述原文'} aria-expanded={relation.status!=='confirmed'||!folded[foldKey(relation.ref.id)]} aria-disabled={relation.status!=='confirmed'} onClick={()=>{if(relation.status==='confirmed')setFolded(value=>({...value,[foldKey(relation.ref.id)]:!value[foldKey(relation.ref.id)]}));}}>{relation.status==='confirmed'?(folded[foldKey(relation.ref.id)]?'展开转述原文':'收起转述原文'):'原文均保留展开入口'}</button>
   </div>)}
   {reading.scoped_independence.map(scope=><p key={scope.report_refs.map(ref=>ref.id).join(':')}>{scope.report_refs.map(ref=>ref.id).join(' / ')}：两份不同采集记录；仅适用于这一对记录。依据 {scope.basis_refs.map(ref=>ref.id).join(' / ')}。</p>)}
   <p>独立来源总数未知。</p>
   {reading.evidence.map(evidence=><details key={evidence.ref.id}><summary>来源关系凭证 {evidence.ref.id}</summary><p>{evidence.basis.description}</p><p>签发描述：{evidence.issuer}；收到 {clock(evidence.received)}；递交 {evidence.delivery_ref.id}；依据 {evidence.basis.ref.id}</p>{evidence.kind==='different_acquisition'&&<ul>{evidence.acquisitions.map(item=><li key={item.ref.id}>{item.description} · {item.ref.id}</li>)}</ul>}</details>)}
  </div>
  {reading.reports.map(report=><article key={report.ref.id} hidden={hidden(report.ref.id)} data-testid={'source-note-'+report.ref.id}>
   <details><summary>{report.ref.id} · {report.subject}</summary><p>{report.text}</p><p>来源描述：{report.source}</p>
    <dl><dt>事件时点</dt><dd>{sourceTime(report.event_time)}</dd><dt>观察时点</dt><dd>{sourceTime(report.observed_time)}</dd><dt>源报告时点</dt><dd>{sourceTime(report.source_reported_time)}</dd></dl>
    <ul aria-label={report.ref.id+'时间依据'}>{reading.bases.filter(basis=>basis.report_ref.id===report.ref.id).map(basis=><li key={basis.ref.id}>{basis.description} · {clock(basis.value)} · {basis.ref.id}</li>)}</ul>
    <ul aria-label={report.ref.id+'递交记录'}>{reading.deliveries.filter(delivery=>delivery.report_ref.id===report.ref.id).map(delivery=><li key={delivery.ref.id}>发送 {clock(delivery.sent)}；总部收到 {clock(delivery.received)} · {delivery.ref.id}</li>)}</ul>
   </details>
  </article>)}
 </section>;
}
