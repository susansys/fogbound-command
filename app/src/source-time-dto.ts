import {derive_source_relations,type SourceDelivery,type SourceNote,type SourceTimeBasis,type SourceEvidence} from './source-time-contracts';
import {record,fields,valid_id} from './protocol';
import {dense_array} from './spatial';
import {outcome_player_view} from './outcome-dto';
const time=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
export function source_time_player_view(value:unknown):boolean{
 if(!record(value)||!record(value.source_package)||!fields(value.source_package,['id','version'])||value.source_package.id!=='B31-SOURCE-TIME-01'||value.source_package.version!==1)return false;
 const {source_package,source_reading,...task}=value;if(!outcome_player_view(task)||!record(source_reading)||!fields(source_reading,['reports','deliveries','bases','evidence','similarity_hint','relations','groups','scoped_independence','conflicts','independence']))return false;
 const ref=(v:unknown,kind:string):v is {run_id:string;kind:string;id:string;version:1}=>record(v)&&fields(v,['run_id','kind','id','version'])&&v.run_id===value.run_id&&v.kind===kind&&valid_id(v.id)&&v.version===1;
 const times=(v:unknown,received:number)=>record(v)&&(v.kind==='unknown'?fields(v,['kind']):v.kind==='known'&&fields(v,['kind','value','basis_ref'])&&time(v.value)&&v.value<=received&&ref(v.basis_ref,'source_basis'));
 if(!dense_array(source_reading.reports)||source_reading.reports.length>3||!dense_array(source_reading.deliveries)||source_reading.deliveries.length>12)return false;
 const deliveries=source_reading.deliveries;if(!deliveries.every((d):d is SourceDelivery=>record(d)&&fields(d,['ref','report_ref','message_ref','sender','recipient','sent','received','knowledge_seq'])&&ref(d.ref,'source_delivery')&&ref(d.report_ref,'source_report')&&ref(d.message_ref,'source_message')&&d.sender==='ArchiveSource'&&d.recipient==='HQ'&&time(d.sent)&&time(d.received)&&d.sent<=d.received&&d.received<=Number(value.sim_time)&&time(d.knowledge_seq)&&d.knowledge_seq>=1))return false;
 if(new Set(deliveries.map(d=>d.ref.id)).size!==deliveries.length||new Set(deliveries.map(d=>d.message_ref.id)).size!==deliveries.length)return false;
 const reports=source_reading.reports;if(!reports.every((r):r is SourceNote=>{if(!record(r)||!fields(r,['ref','kind','subject','text','source','event_time','observed_time','source_reported_time'])||!ref(r.ref,'source_report')||r.kind!=='context_note'||typeof r.subject!=='string'||r.subject.length>2000||typeof r.text!=='string'||r.text.length>2000||r.source!=='ArchiveSource')return false;const reportId=r.ref.id,d=deliveries.find(d=>d.report_ref.id===reportId);return !!d&&[r.event_time,r.observed_time,r.source_reported_time].every(t=>times(t,d.received));}))return false;
 if(!dense_array(source_reading.bases)||source_reading.bases.length>9)return false;const bases=source_reading.bases;
 if(!bases.every((b):b is SourceTimeBasis=>{if(!record(b)||!fields(b,['ref','report_ref','delivery_ref','kind','value','description'])||!ref(b.ref,'source_basis')||!ref(b.report_ref,'source_report')||!ref(b.delivery_ref,'source_delivery')||!['event','observation','source_reported'].includes(String(b.kind))||!time(b.value)||typeof b.description!=='string'||b.description.length>2000)return false;const reportId=b.report_ref.id,deliveryId=b.delivery_ref.id,d=deliveries.find(d=>d.ref.id===deliveryId&&d.report_ref.id===reportId);return !!d&&b.value<=d.received&&reports.some(r=>r.ref.id===reportId);}))return false;
 if(new Set(bases.map(b=>b.ref.id)).size!==bases.length)return false;const used=new Set<string>();for(const report of reports)for(const [field,kind]of [['event_time','event'],['observed_time','observation'],['source_reported_time','source_reported']] as const){const t=report[field];if(t.kind==='known'){const b=bases.find(b=>b.ref.id===t.basis_ref.id);if(!b||b.report_ref.id!==report.ref.id||b.kind!==kind||b.value!==t.value)return false;used.add(b.ref.id);}}if(used.size!==bases.length)return false;
 if(new Set(reports.map(r=>r.ref.id)).size!==reports.length||!record(source_reading.independence)||!fields(source_reading.independence,['kind'])||source_reading.independence.kind!=='unknown')return false;
 const evidence=source_reading.evidence;
 if(!dense_array(evidence)||evidence.length>12||!evidence.every((e):e is SourceEvidence=>{
  if(!record(e)||!ref(e.ref,'source_report')||e.issuer!=='ArchiveSource'||e.authority!=='source_metadata'||!record(e.basis)||!fields(e.basis,['ref','description'])||!ref(e.basis.ref,'source_evidence_basis')||typeof e.basis.description!=='string'||e.basis.description.length>2000||!ref(e.delivery_ref,'source_delivery')||!time(e.received)||!time(e.knowledge_seq))return false;
  const deliveryId=e.delivery_ref.id,reportId=e.ref.id,d=deliveries.find(d=>d.ref.id===deliveryId&&d.report_ref.id===reportId);if(!d||d.received!==e.received||d.knowledge_seq!==e.knowledge_seq)return false;
  const common=['ref','issuer','authority','basis','delivery_ref','received','knowledge_seq','kind'];
  const received=e.received;
  const known=(r:unknown):r is SourceNote['ref']=>ref(r,'source_report')&&reports.some(report=>report.ref.id===r.id)&&deliveries.some(d=>d.report_ref.id===r.id&&d.received<=received);
  if(e.kind==='forward_of')return fields(e,[...common,'relation_ref','from_report_ref','to_report_ref'])&&ref(e.relation_ref,'source_relation')&&known(e.from_report_ref)&&known(e.to_report_ref)&&e.from_report_ref.id!==e.to_report_ref.id;
  if(e.kind==='different_acquisition')return fields(e,[...common,'report_refs','acquisitions'])&&dense_array(e.report_refs)&&e.report_refs.length===2&&e.report_refs.every(known)&&e.report_refs[0].id!==e.report_refs[1].id&&dense_array(e.acquisitions)&&e.acquisitions.length===2&&e.acquisitions.every((a):a is {ref:SourceNote['ref'];description:string}=>record(a)&&fields(a,['ref','description'])&&ref(a.ref,'source_acquisition')&&typeof a.description==='string'&&a.description.length<=2000)&&e.acquisitions[0].ref.id!==e.acquisitions[1].ref.id;
  return e.kind==='lineage_retraction'&&fields(e,[...common,'target_relation_ref','target_evidence_ref','reason'])&&ref(e.target_relation_ref,'source_relation')&&ref(e.target_evidence_ref,'source_report')&&typeof e.reason==='string'&&e.reason.length<=2000;
 }))return false;
 if(new Set(evidence.map(e=>e.ref.id)).size!==evidence.length||new Set(evidence.map(e=>e.basis.ref.id)).size!==evidence.length)return false;
 const reportIds=new Set([...reports.map(r=>r.ref.id),...evidence.map(e=>e.ref.id)]);
 if(reportIds.size!==reports.length+evidence.length||deliveries.some(d=>!reportIds.has(d.report_ref.id)))return false;
 const ordered=[...deliveries].sort((a,b)=>a.received-b.received||a.ref.id.localeCompare(b.ref.id));
 if(ordered.some((d,index)=>d!==deliveries[index]||d.knowledge_seq!==index+1))return false;
 for(const e of evidence)if(e.kind==='lineage_retraction'&&!evidence.some(target=>target.kind==='forward_of'&&target.ref.id===e.target_evidence_ref.id&&target.relation_ref.id===e.target_relation_ref.id&&target.issuer===e.issuer&&target.received<e.received&&target.knowledge_seq<e.knowledge_seq))return false;
 // Recompute solely from validated, received credentials. Exact fields also
 // reject extra private data nested anywhere in a claimed projection.
 const expected=derive_source_relations(reports,evidence);
 const same=(a:unknown,b:unknown):boolean=>{
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>same(v,b[i]));
  if(record(a)&&record(b))return Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
  return a===b;
 };
 if(!(['relations','groups','scoped_independence','conflicts'] as const).every(key=>same(source_reading[key],expected[key])))return false;
 const hint=source_reading.similarity_hint;if(hint===null)return reports.length!==3;
 return reports.length===3&&record(hint)&&fields(hint,['kind','report_refs','text'])&&hint.kind==='suspected'&&typeof hint.text==='string'&&hint.text.length<=2000&&dense_array(hint.report_refs)&&hint.report_refs.length===3&&hint.report_refs.every((r,i)=>ref(r,'source_report')&&r.id===reports[i].ref.id)&&new Set(reports.map(r=>r.subject+'\n'+r.text)).size===1;
}
