import {GameError} from '../contracts';
import type {MissionDraft,ConditionExpr} from '../mission-contracts';
import type {MissionDefinition} from './mission-definition';
import {canonical_route} from '../route-validation';
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
