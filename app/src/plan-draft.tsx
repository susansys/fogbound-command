import {is_record_plan,type Plan} from './contracts';
import {PaperPlaneTilt} from '@phosphor-icons/react';

export function PlanDraft({plan,reason,onReason,onCancel,onConfirm,disabled,history}:{plan:Plan;reason:string;onReason:(value:string)=>void;onCancel:()=>void;onConfirm:()=>void;disabled:boolean;history:boolean}){
  const record=is_record_plan(plan),replacement='kind' in plan&&plan.kind==='prestart_move'&&!!plan.supersedes;
  return <section className="plan"><h3>待下达预案</h3>{record?<p>记录组R在工位H记录档案A。<br/>预计准备{plan.setup_ms/1000}秒、记录{plan.estimated_record_ms/1000}秒；单向消息{plan.link_ms/1000}秒；假设全程约{plan.estimated_total_ms/1000}秒。<br/>假设消耗：记录能量{plan.record_energy}、耐久{plan.record_wear}、用品{plan.record_packs}。</p>:<p>R → {plan.target} · {plan.distance}图上米<br/>{'kind' in plan&&plan.kind==='prestart_move'&&<>预计每次新活动准备{plan.setup_ms/1000}秒，</>}通行{plan.estimated_move_ms/1000}秒，单向消息{plan.link_ms/1000}秒。{replacement&&<><br/>这是一次替代请求，原任务能否被替代须等待联络组的接受回报；不撤销已有消息与历史。</>}</p>}
    <label>指挥意图（选填）<textarea aria-label="指挥意图（选填）" value={reason} disabled={history} onChange={event=>onReason(event.target.value)}/></label><div className="form-actions"><button onClick={onCancel}>取消预案</button><button className="primary" disabled={disabled} onClick={onConfirm}><PaperPlaneTilt/>{record?'下达记录任务':replacement?'下达替代请求':'下达通行命令'}</button></div>
  </section>;
}
