import type {MissionState} from './mission-state';
import type {MissionDefinition} from './mission-definition';
import {receive_mission_command,update_mission_progress,complete_mission_execution,change_mission_movement,mission_discoveries} from './mission-execution';
import {send_mission_acceptance,send_mission_terminal,send_mission_hold,send_mission_refusal,transmit_pending_mission_report,deliver_mission_report} from './mission-reports';
import {deliver_local_position} from './mission-local';
export function advance_mission_execution(state:MissionState,to:number,definition:MissionDefinition):void{
  while(true){
    const commands=state.outbound_messages.filter(m=>!state.local.received_commands.includes(m.order_ref)).map(m=>({kind:'command' as const,id:m.id,at:m.deliver_at,phase:10,ref:m.order_ref}));
    const reports=state.transmissions.filter(t=>!state.deliveries.some(d=>d.report_ref===t.report_ref)).map(t=>({kind:'report' as const,id:t.report_ref,at:t.until,phase:20,ref:t.report_ref}));
    const completions=state.executions.filter(e=>e.status==='moving').map(e=>({kind:'complete' as const,id:e.id,at:e.completes,phase:25,ref:e.id}));
    const holds=state.attempts.filter(a=>a.status==='gate_hold').map(a=>({kind:'hold_end' as const,id:a.order_ref+'-hold-end',at:a.accept_until!,phase:25,ref:a.order_ref}));
    const positions=(definition.catalogs.position_reports??[]).filter(r=>r.target==='R'&&!state.local.position_deliveries.includes(r.id)).map(r=>({kind:'local_position' as const,id:r.id,at:r.delivery_at,phase:10,ref:r.id}));
    const windows=state.attempts.filter(a=>a.status==='waiting_window').map(a=>({kind:'check_command' as const,id:a.order_ref+'-window-check',at:state.orders.find(o=>o.id===a.order_ref)!.frozen_payload.phase.earliest_start_time_ms,phase:10,ref:a.order_ref}));
    const pending=state.pending_reports.map(q=>({kind:'send_report' as const,id:q.report_ref,at:q.at,phase:15,ref:q.report_ref}));
    const cutoffs=state.executions.filter(e=>e.status==='moving').map(e=>({kind:'cutoff' as const,id:e.id+'-cutoff',at:Math.min(state.orders.find(o=>o.id===e.order_ref)!.frozen_payload.phase.latest_finish_time_ms,definition.profile.parameters.deadline),phase:30,ref:e.id}));
    const changes=(definition.catalogs.movement_changes??[]).filter(c=>!state.local.movement_changes.includes(c.id)).map(c=>({kind:'movement_change' as const,id:c.id,at:c.at,phase:24,ref:c.id}));
    const event=[...commands,...reports,...completions,...holds,...positions,...windows,...pending,...cutoffs,...changes,...mission_discoveries(state,definition)].sort((a,b)=>a.at-b.at||a.phase-b.phase||a.id.localeCompare(b.id))[0];if(!event||event.at>to)break;
    update_mission_progress(state,event.at);state.sim_time=event.at;
    if(event.kind==='command'||event.kind==='check_command'){
      const order=state.orders.find(o=>o.id===event.ref)!,execution=receive_mission_command(state,order,definition);
      if(execution)send_mission_acceptance(state,order,execution,definition);
      else if(state.attempts.find(a=>a.order_ref===order.id)?.status==='gate_hold')send_mission_hold(state,order,definition);
      else if(state.attempts.find(a=>a.order_ref===order.id)?.status==='refused')send_mission_refusal(state,order,definition);
    }else if(event.kind==='complete'||event.kind==='cutoff'){
      const execution=state.executions.find(e=>e.id===event.ref)!,terminal=event.kind==='complete'?'arrived':'cutoff';complete_mission_execution(state,execution,definition,terminal);send_mission_terminal(state,state.orders.find(o=>o.id===execution.order_ref)!,execution,definition,terminal);
    }else if(event.kind==='movement_change'){
      change_mission_movement(state,definition.catalogs.movement_changes!.find(c=>c.id===event.ref)!);
    }else if(event.kind==='discovery'){
      const execution=state.executions.find(e=>e.id===event.ref)!;execution.elapsed=event.elapsed;
      state.local.revision++;state.local.obstacle_observations.push({obstacle_ref:event.obstacle_ref,execution_ref:execution.id,observed:event.at});
      complete_mission_execution(state,execution,definition,'blocked');send_mission_terminal(state,state.orders.find(o=>o.id===execution.order_ref)!,execution,definition,'blocked');
    }else if(event.kind==='hold_end'){
      const attempt=state.attempts.find(a=>a.order_ref===event.ref)!;attempt.status='not_started';attempt.terminal_at=event.at;send_mission_hold(state,state.orders.find(o=>o.id===event.ref)!,definition,true);
    }else if(event.kind==='local_position'){
      deliver_local_position(state,definition,definition.catalogs.position_reports!.find(r=>r.id===event.ref)!);
    }else if(event.kind==='send_report')transmit_pending_mission_report(state,event.ref,definition);
    else deliver_mission_report(state,state.sent_reports.find(r=>r.id===event.ref)!,event.at,definition);
  }
  update_mission_progress(state,to);state.sim_time=to;
}
