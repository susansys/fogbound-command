import {GameError} from '../contracts';
import type {MissionDraft,ConditionExpr} from '../mission-contracts';
import type {MissionDefinition} from './mission-definition';
import {canonical_route} from '../route-validation';
import type {MissionState} from './mission-state';
import {canonical} from './snapshot';
import {mission_input_limits} from '../mission-protocol';
export function validate_mission_update(state:MissionState,draft:MissionDraft):void{
  const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const stable=(p:MissionDraft['phases'][number])=>({id:p.id,kind:p.kind,dependencies:p.dependencies,entry_gate:p.entry_gate,exit_gate:p.exit_gate,activity:{kind:p.activity.kind,actor:p.activity.actor}});
  const identity=(values:readonly {id:string;version:number}[],previous:readonly {id:string;version:number}[])=>{
    for(const value of values)if(previous.some(old=>old.id===value.id&&old.version===value.version&&!equal(old,value)))throw new GameError('OBJECT_VERSION_CONFLICT');
  };
  if(new Set([...draft.phases,...state.plans.flatMap(plan=>plan.draft.phases)].map(phase=>phase.id)).size>mission_input_limits.phase_budget)throw new GameError('INVALID_REQUEST');
  for(const plan of state.plans){identity([draft.intent],[plan.draft.intent]);identity(draft.phases,plan.draft.phases);identity(draft.routes,plan.draft.routes);}
  if(state.orders.some(order=>!equal(draft.intent,order.frozen_payload.draft.intent)||!equal(draft.objective,order.frozen_payload.draft.objective)))throw new GameError('STATE_CONFIRMATION_REQUIRED');
  for(const order of state.orders){
    const previous=order.frozen_payload,phase=draft.phases.find(p=>p.id===order.phase_ref.id),route=phase&&draft.routes.find(r=>r.id===phase.activity.route_ref.id&&r.version===phase.activity.route_ref.version);
    if(phase&&route&&equal(phase,previous.phase)&&equal(route,previous.route))continue;
    if(!phase||!route||!['refused','not_started'].includes(order.status))throw new GameError('STATE_CONFIRMATION_REQUIRED');
    if(phase.version<=previous.phase.version||route.id===previous.route.id&&!equal(route.path,previous.route.path)&&route.version<=previous.route.version)throw new GameError('OBJECT_VERSION_CONFLICT');
    if(!equal(stable(phase),stable(previous.phase))||!equal(draft.intent,previous.draft.intent)||!equal(draft.objective,previous.draft.objective))throw new GameError('INVALID_REQUEST');
  }
  const previous=state.plans.at(-1)?.draft;
  if(state.orders.length&&previous?.phases.some(phase=>!draft.phases.some(p=>p.id===phase.id)))throw new GameError('STATE_CONFIRMATION_REQUIRED');
  const changed_future=previous&&draft.phases.filter(phase=>{
    if(state.orders.some(order=>order.phase_ref.id===phase.id))return false;
    const old=previous.phases.find(p=>p.id===phase.id),route=draft.routes.find(r=>r.id===phase.activity.route_ref.id),old_route=old&&previous.routes.find(r=>r.id===old.activity.route_ref.id);
    return !equal(phase,old)||!equal(route,old_route);
  });
  for(const phase of state.orders.length?changed_future??[]:[]){
    const old=previous!.phases.find(p=>p.id===phase.id),route=draft.routes.find(r=>r.id===phase.activity.route_ref.id),old_route=old&&previous!.routes.find(r=>r.id===old.activity.route_ref.id);
    const retry_alignment=old&&equal({...phase,version:old.version,dependencies:old.dependencies},old)&&equal(route,old_route)&&phase.dependencies.length===old.dependencies.length&&phase.dependencies.some((ref,i)=>ref.version!==old.dependencies[i].version)&&phase.dependencies.every((ref,i)=>{
      const prior=old.dependencies[i];
      return ref.id===prior.id&&ref.kind===prior.kind&&ref.run_id===prior.run_id&&(ref.version===prior.version||ref.version>prior.version&&draft.phases.some(p=>p.id===ref.id&&p.version===ref.version)&&state.orders.some(order=>order.phase_ref.id===ref.id&&['refused','not_started'].includes(order.status)&&order.phase_ref.version<ref.version));
    });
    if(retry_alignment)continue;
    if(state.orders.some(order=>!['arrived','refused','not_started','blocked','cutoff'].includes(order.status))||!old||!equal(stable(phase),stable(old))||old.dependencies.some(ref=>!state.known.phase_confirmations.some(c=>c.phase_id===ref.id&&c.phase_version===ref.version)))throw new GameError('STATE_CONFIRMATION_REQUIRED');
  }
}
export function validate_mission_references(draft:MissionDraft,definition:MissionDefinition):void{
  const fail=():never=>{throw new GameError('INVALID_REQUEST','mission_draft.references');};
  if(draft.mission_ref.id!=='M1'||draft.mission_ref.version!==definition.version||draft.intent.delegation_ref.id!==definition.catalogs.authority.id||draft.intent.delegation_ref.version!==definition.catalogs.authority.version||draft.objective.dependencies.length)fail();
  for(const entries of [draft.phases,draft.routes])if(new Set(entries.map(x=>x.id)).size!==entries.length)fail();
  const inspect=(expr:ConditionExpr):void=>{
    if(expr.kind==='not'){inspect(expr.child);return;}
    if(expr.kind==='all'||expr.kind==='any'){expr.children.forEach(inspect);return;}
    if(expr.kind!=='compare'||expr.field_ref!=='position.scope')return;
    const scope=definition.catalogs.map.scopes.find(s=>s.id===expr.typed_value);
    if(!scope||expr.operator==='eq'&&scope.kind!=='point'||expr.operator==='in'&&!['area','corridor','region_set'].includes(scope.kind))fail();
  };
  inspect(draft.objective.success_expr);inspect(draft.objective.failure_expr);
  for(const phase of draft.phases){
    for(const ref of phase.dependencies)if(!draft.phases.some(p=>p.id===ref.id&&p.version===ref.version))fail();
    if(!draft.routes.some(r=>r.id===phase.activity.route_ref.id&&r.version===phase.activity.route_ref.version))fail();
    inspect(phase.entry_gate);inspect(phase.exit_gate);
  }
  for(const route of draft.routes)canonical_route(route.path);
}
