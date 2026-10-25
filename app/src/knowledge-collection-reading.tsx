import {useEffect,useRef,type ReactNode} from 'react';
import type {CollectionTime,KnowledgeCollectionReport,CollectionProcessReport,CollectionCleanupReport} from './knowledge-collection-contracts';
export type CollectionReadableReport=KnowledgeCollectionReport|CollectionProcessReport|CollectionCleanupReport;
export function collectionTimeLabel(value:CollectionTime|number|null):string{
  const known=typeof value==='number'?value:value?.kind==='known'?value.value:null;
  return known===null?'时间未知':known<0?'开局前 '+Math.abs(known)/1000+' 秒':'本局 '+known/1000+' 秒';
}
export function collectionReportTitle(report:CollectionReadableReport):string{
  if(report.method==='task-cleanup')return report.source_actor+' 收整原文';
  const body=report.body;
  switch(body.kind){
    case 'record_handover':return body.actor+' 交接原文';
    case 'record_verification':return body.actor+' 核验原文';
    case 'historical_survey':return 'S 历史原文';
    case 'self_position':return report.method==='collection-end-self-position'?'R 采集后位置原文':'R 自报位置原文';
    case 'qualified_facility_field':return 'W 检查原文';
    case 'collection_cancelled':return report.source_actor+' 撤回原文';
    default:return report.source_actor+' 采集原文';
  }
}
const failureCopy={window_closed:'当地收到指令时采集窗口已关闭',empty_scope:'没有形成有效覆盖',local_gate_unknown:'当地作业条件尚未得到确认',local_gate_not_met:'当地作业条件不满足',not_at_site:'编组不在采集地点',capacity:'当地劳动或设备容量已占用'};
const verificationCopy={authentic_limited:'原件真实，内容仍然有限',authentic_qualified:'原件真实，内容符合合格检查资格',invalid:'原件核验未通过',not_evaluable:'现有依据不足，无法评价'};
function reportBody(report:CollectionReadableReport):ReactNode{
  if(report.method==='task-cleanup')return <><p>实际收整确认 {report.body.people} 人；确认地点 ({report.body.point.join('，')})。</p><p>编组仍持有记录 {report.body.record_refs.length} 份；收整不等于实体已交接或核验通过。</p><p>本局合成模型已耗能量 {report.body.energy_used_uj/1000000} J；不是现实测量。</p></>;
  const body=report.body;
  switch(body.kind){
    case 'limited_indication':return <p>有限采集形成资料，但不能确认 B 的设施状况。</p>;
    case 'qualified_facility_field':return <p>合格设施检查：观察时设施可用。对象版本 {body.object_version}；之后是否变化仍需新的合法证据。</p>;
    case 'historical_survey':return <blockquote className="original-report">{body.original.text}</blockquote>;
    case 'self_position':return <p>R 自报位置：({body.point.join('，')})。这是原文观察时点的位置，不替代更晚的已知位置。</p>;
    case 'collection_failed':return <><p>未覆盖，设施状况未知：{failureCopy[body.reason]}。</p><p>已执行采集工作 {body.collection_work_ms/1000} 秒。</p></>;
    case 'collection_cancelled':return <p>开始前已撤回，没有产生采集工作或覆盖。</p>;
    case 'record_handover':return <><p>{body.actor} 交接回报：{body.outcome==='transferred'?'记录已实际移交':body.outcome==='deadline'?'已过交接期限':'没有可交接的记录'}。</p><p>到达：{collectionTimeLabel(body.arrived_at)}；工序完成：{collectionTimeLabel(body.completed_at)}。</p><p>回报确认 {body.people} 人；记录 {body.record_refs.length} 份，模型质量 {body.mass_kg} kg，逻辑字节 {body.logical_size_bytes}。</p></>;
    case 'record_verification':return <><p>{verificationCopy[body.verification.result]}</p><p>原采集观察时点：{collectionTimeLabel(body.original_observed_time)}</p><p>原采集形成时点：{collectionTimeLabel(body.original_generated_at)}</p><p>核验只确认送达原件及其既定内容资格，不把旧调查变成新的观察。</p></>;
  }
}
type Props={report:CollectionReadableReport;deliveries:Array<{ref:{id:string};sent_at:number;received_at:number}>;onClose:()=>void};
export function KnowledgeCollectionReading({report,deliveries,onClose}:Props){
  const heading=useRef<HTMLHeadingElement|null>(null);useEffect(()=>{heading.current?.focus({preventScroll:true});},[report.ref.id]);
  const limits='limits' in report.body?report.body.limits:[],registration='method_ref' in report?report.root_registration:undefined;
  return <section className="intelligence-source" aria-label="原文阅读"><button onClick={onClose}>返回当前行动</button><h2 ref={heading} tabIndex={-1}>{collectionReportTitle(report)}</h2>
    <p>文字资料；媒体附件暂不支持</p><p>{report.method==='task-cleanup'?'收整确认时点':'观察时点'}：{collectionTimeLabel(report.method==='task-cleanup'?report.observed_at:report.observed_time)}</p><p>形成时点：{collectionTimeLabel(report.generated_at)}</p><p>来源自报时点：{collectionTimeLabel(report.method==='task-cleanup'?null:report.source_reported_time)}</p>
    {deliveries.map((delivery,index)=><p key={delivery.ref.id}>总部收到：{collectionTimeLabel(delivery.received_at)}；发送：{collectionTimeLabel(delivery.sent_at)}{deliveries.length>1?' · 第 '+(index+1)+' 次递交':''}</p>)}
    {reportBody(report)}
    {'coverage' in report&&<section aria-label="采集覆盖"><h3>采集覆盖</h3><p>计划面积：{report.coverage.planned_area_m2} m²；实际面积：{report.coverage.actual_area_m2===null?'未知':report.coverage.actual_area_m2+' m²'}。</p><p>实际范围 {report.coverage.actual_scope.length} 个；未覆盖区域保持未知。</p>{report.coverage.actual_scope.map((scope,index)=><p key={index}>范围 {index+1}：X {scope.min_x}—{scope.max_x}，Y {scope.min_y}—{scope.max_y}。</p>)}</section>}
    {limits.map(limit=><p key={limit}>{limit}</p>)}
    <details><summary>原件标识与摘要</summary><p>版本 {report.ref.version} · {report.ref.id}</p><p>内容摘要：<code>{report.content_digest}</code></p>{registration&&<p>随原件收到的来源登记：{registration.actor}；资格 {registration.qualification.id} 第 {registration.qualification.version} 版。</p>}</details>
  </section>;
}
