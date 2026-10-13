import type { State, MoveEvent } from "./state";
import type { Intent } from "../contracts";
import { GameError } from "../contracts";
import {account_record_progress,record_cause} from './record-accounting';
export function register_move(
  state: State,
  intent: Extract<Intent, { kind: "issue" }>,
) {
  if('kind' in intent.plan)throw new GameError('INVALID_INPUT');
  const issued = state.sim_time,
    link = intent.plan.link_ms,
    start = issued + link,
    duration = intent.plan.estimated_move_ms;
  state.order = {
    command_id: intent.command_id,
    issued,
    expiry: issued + state.movement_rules.task_expiry_ms,
    accepted: null,
    plan: structuredClone(intent.plan),
    ...(intent.reason !== undefined ? { reason: intent.reason } : {}),
  };
  state.status = "queued";
  state.generation++;
  state.schedule = state.schedule.filter((x) => x.kind !== "deadline");
  const event = (kind: MoveEvent["kind"], at: number, index?: number) => ({
    id: `${intent.command_id}:${kind}:${index ?? 0}`,
    at,
    phase: kind.endsWith("receipt") ? 20 : 10,
    generation: state.generation,
    kind,
    ...(index === undefined ? {} : { index }),
  });
  state.schedule.push(
    event("accept", start),
    event("accepted_receipt", start + link),
  );
  for (let index = 1; index * state.movement_rules.fix_ms < duration; index++)
    state.schedule.push(
      event("fix", start + index * state.movement_rules.fix_ms, index),
      event("fix_receipt", start + index * state.movement_rules.fix_ms + link, index),
    );
  state.schedule.push(
    event("complete", start + duration),
    event("complete_receipt", start + duration + link),
  );
  state.schedule.push({
    ...event("deadline", state.public_rules.authority.to),
    phase: 30,
  });
  state.schedule.sort(
    (a, b) => a.at - b.at || a.phase - b.phase || a.id.localeCompare(b.id),
  );
  state.log.push({
    id: `${intent.command_id}:issued`,
    at: issued,
    kind: "issued",
    text: "签发已登记；发送完成，等待接收反馈。",
    evidence: intent.command_id,
  });
}
export function register_record(
  state: State,
  intent: Extract<Intent, { kind: "issue" }>,
) {
  if(!('kind' in intent.plan))throw new GameError('INVALID_INPUT');
  const issued=state.sim_time,link=intent.plan.link_ms,start=issued+link,recordStart=start+intent.plan.setup_ms,complete=recordStart+intent.plan.estimated_record_ms;
  state.order={command_id:intent.command_id,issued,expiry:issued+state.movement_rules.task_expiry_ms,accepted:null,plan:structuredClone(intent.plan),...(intent.reason!==undefined?{reason:intent.reason}:{})};
  state.status='queued';
  state.generation++;
  state.schedule=state.schedule.filter(x=>x.kind!=='deadline');
  const event=(kind:MoveEvent['kind'],at:number,index?:number)=>({id:`${intent.command_id}:${kind}:${index??0}`,at,phase:kind.endsWith('receipt')?20:10,generation:state.generation,kind,...(index===undefined?{}:{index})});
  state.schedule.push(event('command_send',issued),event('accept',start),event('accepted_receipt',start+link),event('fix',recordStart,1),event('fix_receipt',recordStart+link,1),event('complete',complete),event('complete_receipt',complete+link),{...event('deadline',state.public_rules.authority.to),phase:30});
  state.schedule.sort((a,b)=>a.at-b.at||a.phase-b.phase||a.id.localeCompare(b.id));
  state.log.push({id:`${intent.command_id}:issued`,at:issued,kind:'issued',text:'记录任务草案已签发；等待记录组接令。',evidence:intent.command_id});
}
function locate(state: State, at: number) {
  if (state.order?.accepted === null || !state.order || state.world.stopped)
    return;
  if('kind' in state.order.plan){
    if(!state.world.completed)account_record_progress(state,at);
    return;
  }
  const { H, T } = state.public_rules.geometry,
    d = state.order.plan.estimated_move_ms,
    elapsed = Math.max(0, Math.min(d, at - state.order.accepted));
  state.world.position = {
    xn: H[0] * d + (T[0] - H[0]) * elapsed,
    yn: H[1] * d + (T[1] - H[1]) * elapsed,
    d,
  };
}
function send(
  state: State,
  event: MoveEvent,
  receiptKind: MoveEvent["kind"],
  withPosition: boolean,
) {
  state.world.equipment_energy--;
  state.world.equipment_wear--;
  state.world.sends++;
  const delivery = state.schedule.find(
    (x) => x.kind === receiptKind && x.index === event.index,
  );
  if (!delivery) throw new GameError("ENGINE_UNCONFIRMED");
  delivery.payload = {
    observed: event.at,
    resources: {
      equipment_energy: state.world.equipment_energy,
      equipment_wear: state.world.equipment_wear,
      movement_energy: state.world.movement_energy,
      ...(state.world.record_energy===undefined?{}:{record_energy:state.world.record_energy.numerator/state.world.record_energy.denominator,record_energy_reserved:state.world.record_energy_reserved!.numerator/state.world.record_energy_reserved!.denominator,record_packs_reserved:state.world.record_packs_reserved}),
      ...(state.world.record_wear===undefined?{}:{record_wear:state.world.record_wear}),
      ...(state.world.record_packs===undefined?{}:{record_packs:state.world.record_packs}),
      ...(state.world.hq_energy===undefined?{}:{hq_energy:state.world.hq_energy}),
      ...(state.world.hq_wear===undefined?{}:{hq_wear:state.world.hq_wear}),
      confirmed_at: delivery.at,
    },
    ...(receiptKind==='complete_receipt'&&state.world.record_artifacts?.length?{artifacts: structuredClone(state.world.record_artifacts)}:{}),
    ...(withPosition
      ? {
          position: {
            x:
              Math.round(
                (state.world.position.xn * 100) / state.world.position.d,
              ) / 100,
            y:
              Math.round(
                (state.world.position.yn * 100) / state.world.position.d,
              ) / 100,
            observed: event.at,
            received: delivery.at,
            evidence: delivery.id,
          },
        }
      : {}),
  };
}
export function advance_move(state: State, to: number) {
  while (state.schedule.length && state.schedule[0].at <= to && !state.ended) {
    const event = state.schedule.shift()!;
    state.sim_time = event.at;
    if (event.generation !== state.generation) continue;
    locate(state, event.at);
    if(event.kind==='command_send'){
      state.world.hq_energy=(state.world.hq_energy??0)-1;
      state.world.hq_wear=(state.world.hq_wear??0)-1;
      state.known.resources={...state.known.resources,hq_energy:state.world.hq_energy,hq_wear:state.world.hq_wear,confirmed_at:event.at};
      state.log.push({id:event.id,at:event.at,kind:'sent',text:'记录任务已发送，等待记录组接令回报。',sender:'总部指挥席',evidence:event.id});
    } else if (event.kind === "accept") {
      if (!state.order || event.at >= state.order.expiry)
        throw new GameError("ENGINE_UNCONFIRMED");
      if(event.at>=state.public_rules.authority.to){state.schedule=state.schedule.filter(x=>x.kind!=='accepted_receipt');continue;}
      state.order.accepted = event.at;
      if('kind' in state.order.plan){
        record_cause(state,`${state.order.command_id}.reserve`);
        account_record_progress(state,event.at);
      }
      send(state, event, "accepted_receipt", false);
    } else if (event.kind === "fix") {
      if(state.order&&'kind' in state.order.plan){
        if(event.at>=state.public_rules.authority.to)continue;
        record_cause(state,`${state.order.command_id}.wear`);
        state.world.record_wear=(state.world.record_wear??0)-state.order.plan.record_wear;
        send(state,event,'fix_receipt',false);
      } else send(state, event, "fix_receipt", true);
    }
    else if (event.kind === "complete") {
      if(!state.order)throw new GameError('ENGINE_UNCONFIRMED');
      if (event.at >= state.public_rules.authority.to) continue;
      if('kind' in state.order.plan){
        account_record_progress(state,event.at,true);
        if(!state.world.record_artifacts?.length)state.world.record_artifacts=[{id:`artifact-${state.order.command_id}`,report_id:state.order.plan.report_id,delivery_id:state.order.plan.delivery_id,completed:event.at,verified:false,activity_id:`${state.order.command_id}.complete.0`}];
      } else state.world.movement_energy -= Math.ceil(
        state.order.plan.distance / 100,
      );
      state.world.completed = true;
      send(state, event, "complete_receipt", !('kind' in state.order.plan));
    } else if (event.kind === "deadline") {
      if (!state.order) {
        state.status = "deadline";
        state.ended = true;
        state.paused = true;
        state.log.push({
          id: event.id,
          at: event.at,
          kind: "deadline",
          text: "公开截止已到，未签发工程任务。",
          evidence: "objective-deadline",
        });
      } else if (!state.world.completed) {
        state.world.stopped = true;
        if(state.order&&'kind' in state.order.plan){
          account_record_progress(state,event.at,true);
          state.schedule = state.schedule.filter(x=>!['complete','complete_receipt','fix','fix_receipt'].includes(x.kind));
          if(state.order.accepted===null)state.schedule=state.schedule.filter(x=>!['accept','accepted_receipt'].includes(x.kind));
          state.schedule.push({id:`${state.order.command_id}:deadline_receipt`,at:event.at+state.order.plan.link_ms,phase:20,generation:state.generation,kind:'deadline_receipt'});
          send(state,event,'deadline_receipt',false);
          state.schedule.sort((a,b)=>a.at-b.at||a.phase-b.phase||a.id.localeCompare(b.id));
          continue;
        }
        const { xn, d } = state.world.position;
        state.world.movement_energy -= Math.ceil(
          Math.abs(xn - state.public_rules.geometry.H[0] * d) / (d * 100),
        );
        state.schedule = state.schedule.filter(
          (x) =>
            !["complete", "complete_receipt", "fix", "fix_receipt"].includes(
              x.kind,
            ),
        );
        if(state.order.accepted===null)state.schedule=state.schedule.filter(x=>!['accept','accepted_receipt'].includes(x.kind));
        state.schedule.push({
          id: `${state.order.command_id}:deadline_receipt`,
          at: event.at + state.order.plan.link_ms,
          phase: 20,
          generation: state.generation,
          kind: "deadline_receipt",
        });
        send(state, event, "deadline_receipt", true);
        state.schedule.sort(
          (a, b) =>
            a.at - b.at || a.phase - b.phase || a.id.localeCompare(b.id),
        );
      }
    } else {
      if (!event.payload) throw new GameError("ENGINE_UNCONFIRMED");
      state.known.resources = structuredClone(event.payload.resources);
      if (event.payload.artifacts) state.known.artifacts = structuredClone(event.payload.artifacts);
      if (event.payload.position)
        state.known.position = structuredClone(event.payload.position);
      if (event.kind === "accepted_receipt") state.status = "executing";
      if (event.kind === "complete_receipt") {
        state.finished = true;
        state.ended = true;
        state.status = "finished";
        state.paused = true;
      }
      if (event.kind === "deadline_receipt") {
        state.status = "deadline";
        state.ended = true;
        state.paused = true;
      }
      state.log.push({
        id: event.id,
        at: event.at,
        kind: event.kind,
        text:
          'kind' in state.order!.plan
            ? event.kind === "accepted_receipt"
              ? `记录组接令：活动凭证 ${state.order!.command_id}.accept.0；送达/接受/生效 ${state.order!.accepted} ms；签发 ${state.order!.issued} ms。`
              : event.kind === "fix_receipt"
                ? `记录开始：活动凭证 ${state.order!.command_id}.record.0；观察 ${event.payload.observed} ms。`
                : event.kind === "deadline_receipt"
                  ? "记录任务截止：宽限只等待既有回报，不补做记录。"
                  : `记录成果回报：活动凭证 ${state.order!.command_id}.complete.0；成果 artifact-${state.order!.command_id} · 未核验；完成 ${event.payload.observed} ms；总部确认 ${event.at} ms。`
          : event.kind === "accepted_receipt"
            ? `收到接受反馈：送达/接受/生效 ${state.order!.accepted} ms；签发 ${state.order!.issued} ms。`
            : event.kind === "fix_receipt"
              ? `收到定位：观察 ${event.payload.observed} ms。`
              : event.kind === "deadline_receipt"
                ? "收到截止反馈：未在截止前完成，grace不补作业。"
                : `工程完成：实际完成 ${event.payload.observed} ms；总部确认 ${event.at} ms。`,
        observed: event.payload.observed,
        ...('kind' in state.order!.plan&&event.kind!=='deadline_receipt'?{
          sender:'记录组 R',
          activity_id:event.kind==='accepted_receipt'?`${state.order!.command_id}.accept.0`:event.kind==='fix_receipt'?`${state.order!.command_id}.record.0`:`${state.order!.command_id}.complete.0`,
        }:{}),
        evidence: event.id,
      });
    }
  }
  if (!state.ended) {
    state.sim_time = to;
    locate(state, to);
  }
}
