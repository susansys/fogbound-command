import type {ConflictingActionPlayerView,ActionRef} from './conflicting-action-contracts';
import type {Response} from './transport';
export type CurrentAction={actor:string;activity:string|null;order:ActionRef<'field_order'>|null;refs:ActionRef<string>[];epoch:number};
export type ActionEvent={key:string;received:number;text:string;detail?:string};
export type ActionBaseline={context:string;seen:string[];pending:ActionEvent[]};
export type ActionRequest={run_id:string;operation_id:string;label:string;status:'submitting'|'registered'|'rejected'|'unknown';code?:string};
const same=(a:ActionRef<string>,b:ActionRef<string>)=>a.run_id===b.run_id&&a.kind===b.kind&&a.id===b.id&&a.version===b.version;
const key=(ref:ActionRef<string>)=>JSON.stringify([ref.run_id,ref.kind,ref.id,ref.version]);
function field_matches(view:ConflictingActionPlayerView,work:CurrentAction,order:ActionRef<'field_order'>,actor:string,activity:string){return order.run_id===view.run_id&&actor===work.actor&&(!work.activity||activity===work.activity)&&(!work.order||same(order,work.order));}
export function action_events(view:ConflictingActionPlayerView,work:CurrentAction):ActionEvent[]{
 const result:ActionEvent[]=[],refs=work.refs.filter(r=>r.run_id===view.run_id),has=(ref:ActionRef<string>)=>refs.some(r=>same(r,ref));
 const add=(ref:ActionRef<string>,received:number,text:string,detail?:string)=>{if(ref.run_id===view.run_id&&received<=view.sim_time)result.push({key:key(ref),received,text,detail:(detail?detail+'；':'')+'凭证 '+ref.kind+' '+ref.id+' 第'+ref.version+'版'});};
 for(const {report,delivery} of view.field_reports)if(field_matches(view,work,report.order_ref,report.actor,report.typed_payload.activity_ref.id))add(delivery.ref,delivery.received,report.phase==='accepted'?'接令回报已收到':report.phase==='completed'?(report.facility_confirmation?'检查／维修确认：'+(report.facility_confirmation.condition==='operable'?'可用':'故障'):report.artifact?'记录成果已收到':'完成回报已收到'):report.phase==='refused'?'当地条件受阻回报已收到':'截止回报已收到');
 for(const delivery of view.conflicting_action.deliveries)if(has(delivery.report_ref))add(delivery.ref,delivery.received,'设施原文 '+delivery.report_ref.id+' 已收到，仍未核实',view.conflicting_action.reports.find(r=>same(r.ref,delivery.report_ref))?.text);
 const selectedReports=new Set(refs.filter(r=>r.kind==='report').map(key));
 for(const {report,delivery} of view.received_reports)if(has({run_id:delivery.run_id,kind:'report_delivery',id:delivery.id,version:delivery.version}))selectedReports.add(key({run_id:report.run_id,kind:'report',id:report.id,version:report.version}));
 for(const {report,delivery} of view.received_reports){const reportRef={run_id:report.run_id,kind:'report',id:report.id,version:report.version};if(!selectedReports.has(key(reportRef)))continue;add({run_id:delivery.run_id,kind:'report_delivery',id:delivery.id,version:delivery.version},delivery.received,'当前引用原文 '+report.id+' 的递交已收到');if(delivery.forward_of?.kind==='confirmed'&&delivery.forward_of.received<=view.sim_time)add(delivery.forward_of.supporting_evidence_ref,delivery.forward_of.received,'当前引用原文 '+report.id+' 的来源关系凭证已收到');}
 for(const {assessment,delivery} of view.assessments)if(selectedReports.has(key(assessment.subject_ref))||assessment.basis_delivery_refs.some(has))add(delivery.ref,delivery.received,'当前引用的核实结论已收到');
 for(const {result:product,delivery} of view.preparation_results)if(has(product.plan_ref))add(delivery.ref,delivery.received,product.status==='approved'?'当前草案的准备批准已收到':'当前草案的准备未获批准');
 return [...new Map(result.map(event=>[event.key,event])).values()].sort((a,b)=>a.received-b.received||a.key.localeCompare(b.key));
}
export function action_progress(view:ConflictingActionPlayerView,work:CurrentAction):{text:string;received:number|null}{
 const order=work.order?view.field_activities.find(o=>same(o.ref,work.order!)):work.activity?view.field_activities.filter(o=>o.actor===work.actor&&o.activity===work.activity).at(-1):undefined;
 if(!order)return {text:'尚无本任务的签发记录',received:null};
 const delivered=view.field_reports.filter(x=>same(x.report.order_ref,order.ref)&&x.delivery.received<=view.sim_time).sort((a,b)=>a.delivery.received-b.delivery.received).at(-1);
 if(!delivered)return {text:'已签发，等待接令回报',received:null};
 const {report,delivery}=delivered,diagnosis=report.facility_confirmation;
 return {text:report.phase==='accepted'?'已收到接令回报，等待后续':report.phase==='refused'?'当地条件受阻回报已收到':report.phase==='cutoff'?'截止回报已收到':order.activity==='W-inspect'&&diagnosis?'检查结果已收到：'+(diagnosis.condition==='operable'?'可用':'故障'):order.activity==='W-repair'?'维修完成回报已收到':report.artifact?'记录成果已收到':'完成回报已收到',received:delivery.received};
}
export function action_baseline(previous:ActionBaseline|null,context:string,events:ActionEvent[],history:boolean):ActionBaseline{
 if(!previous||previous.context!==context||history)return {context,seen:events.map(e=>e.key),pending:[]};
 const seen=new Set(previous.seen),fresh=events.filter(event=>!seen.has(event.key));
 return {context,seen:[...new Set([...seen,...events.map(e=>e.key)])],pending:[...previous.pending,...fresh]};
}
export function action_request_result(request:ActionRequest,response:Response):ActionRequest{
 if(response.ok)return {...request,status:response.receipt?.run_id===request.run_id&&response.receipt.operation_id===request.operation_id?'registered':'unknown'};
 return {...request,status:['CHANNEL_UNCERTAIN','STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(response.code)?'unknown':'rejected',code:response.code};
}
