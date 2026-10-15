import {GameError} from '../contracts';
import type {MissionDraft,ConditionExpr} from '../mission-contracts';
import type {MissionDefinition} from './mission-definition';
import {canonical_route} from '../route-validation';
import type {MissionState} from './mission-state';
import {canonical} from './snapshot';
export function validate_mission_update(state:MissionState,draft:MissionDraft):void{
  const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  for(const order of state.orders){
    const previous=order.frozen_payload,phase=draft.phases.find(p=>p.id===order.phase_ref.id),route=phase&&draft.routes.find(r=>r.id===phase.activity.route_ref.id&&r.version===phase.activity.route_ref.version);
    if(phase&&route&&equal(phase,previous.phase)&&equal(route,previous.route))continue;
    if(!phase||!route||!['refused','not_started'].includes(order.status))throw new GameError('STATE_CONFIRMATION_REQUIRED');
    if(phase.version<=previous.phase.version||route.id===previous.route.id&&!equal(route.path,previous.route.path)&&route.version<=previous.route.version)throw new GameError('OBJECT_VERSION_CONFLICT');
    const stable=(p:MissionDraft['phases'][number])=>({id:p.id,kind:p.kind,dependencies:p.dependencies,entry_gate:p.entry_gate,exit_gate:p.exit_gate,activity:{kind:p.activity.kind,actor:p.activity.actor}});
    if(!equal(stable(phase),stable(previous.phase))||!equal(draft.intent,previous.draft.intent)||!equal(draft.objective,previous.draft.objective))throw new GameError('INVALID_REQUEST');
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
