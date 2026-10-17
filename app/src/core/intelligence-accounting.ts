import {GameError} from '../contracts';
import type {IntelligenceLoadoutDraft} from '../intelligence-contracts';
import type {IntelligenceDefinition} from './intelligence-definition';

export function planned_intelligence_loadout(draft:IntelligenceLoadoutDraft,definition:IntelligenceDefinition){
  if(!definition.catalogs.actors.some(a=>a.id===draft.actor_ref.id))throw new GameError('UNSUPPORTED');
  const equipment=draft.equipment.map(id=>definition.catalogs.equipment.find(e=>e.id===id));
  if(equipment.some(e=>!e))throw new GameError('UNSUPPORTED');
  const record=definition.catalogs.supply_units.find(r=>r.id==='record_pack')!,repair=definition.catalogs.supply_units.find(r=>r.id==='repair_pack')!;
  const load=equipment.reduce((sum,e)=>sum+e!.load,0)+draft.record_packs*record.load+draft.repair_packs*repair.load;
  const space=equipment.reduce((sum,e)=>sum+e!.space,0)+draft.record_packs*record.space+draft.repair_packs*repair.space;
  if(load>definition.profile.parameters.load_capacity||space>definition.profile.parameters.space_capacity)throw new GameError('CAPACITY_CONFLICT');
  return {...structuredClone(draft),load,space,repair_supplies_met:draft.repair_packs>=definition.profile.parameters.repair_pack_cost};
}
