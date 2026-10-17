import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {intelligence_definition} from './intelligence-fixtures';

test.each(['cross_run','future','missing','report_as_delivery','unknown_actor','unknown_activity'] as const)('B23 E06 %s is rejected without an operation or fact side effect',async variant=>{
  const store=new Persistence('b23-owned-t01-e06-'+variant);
  try{
    const game=new Game(store),initial=await game.create_run(await intelligence_definition(),'research','create');
    const {view}=await game.control_clock({run_id:initial.run_id,operation_id:'receive-first',expected_revision:1,intent:{kind:'advance',to:21000}});
    const before=await game.get_view(view.run_id),source=await game.get_actor_view(view.run_id,'ArchiveSource');
    const ref={run_id:variant==='cross_run'?'other-run':view.run_id,kind:variant==='report_as_delivery'?'report':'report_delivery',id:variant==='future'?'D3':variant==='missing'?'fake-delivery':'D1',version:1};
    const envelope={run_id:view.run_id,operation_id:'invalid',expected_revision:view.revision,intent:{kind:'request_source_validation',basis_delivery_refs:[ref]}};
    if(variant==='unknown_actor'||variant==='unknown_activity')await expect(game.issue_activity({...envelope,intent:{kind:'issue_activity',actor_ref:{run_id:view.run_id,kind:'actor',id:variant==='unknown_actor'?'UnknownActor':'R',version:1},activity_ref:{run_id:view.run_id,kind:'activity',id:variant==='unknown_activity'?'teleport':'R-to-A',version:1},authority_ref:{run_id:view.run_id,kind:'authority',id:'HQ-field-authority',version:1},basis_delivery_refs:[]}})).rejects.toThrow('UNSUPPORTED');
    else await expect(game.request_source_validation(envelope)).rejects.toThrow('INVALID_REQUEST');
    expect(await game.get_view(view.run_id)).toEqual(before);expect(await game.get_actor_view(view.run_id,'ArchiveSource')).toEqual(source);expect(await game.get_receipt(view.run_id,'invalid')).toBeNull();
  }finally{await store.delete();}
});
