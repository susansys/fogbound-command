import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {project_player_view} from '../src/core/knowledge';
import {preview_prestart} from '../src/core/prestart-move';
import {valid_response} from '../src/dto';
import {task_intent} from '../src/contracts';
import definition from './fixtures/prestart-definition.json';

test('CR03 private preparation alternatives leave every legal view, eligibility, preview and DTO result identical until received evidence changes',async()=>{
  const store=new Persistence('prestart-private-projection'),game=new Game(store);
  try{
    let view=await game.create_run(definition,'research','create');const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(await game.issue_order({run_id:view.run_id,operation_id:'original',expected_revision:view.revision,intent:task_intent(plan,'N')})).view;
    view=(await game.control_clock({run_id:view.run_id,operation_id:'local-accept',expected_revision:view.revision,intent:{kind:'advance',to:1500}})).view;
    const source=(await store.read_committed(view.run_id))!,privateAlternative=structuredClone(source);
    // Authored Knowledge/preview mechanism inputs only: never injected into Game or storage.
    privateAlternative.world.position={xn:170,yn:150,d:1};privateAlternative.world.equipment_energy=1;privateAlternative.world.movement_energy=1;privateAlternative.world.completed=true;
    privateAlternative.prestart!.activities[0].phase='completed';privateAlternative.prestart!.queue=[];
    const pair=[source,privateAlternative].map(state=>({view:project_player_view(state),plan:preview_prestart(state,2,true,'')}));
    expect(pair[1]).toEqual(pair[0]);expect(pair[0].view).toEqual(view);expect(pair[0].plan).toEqual(await game.preview_plan(view.run_id,view.revision,2));
    for(const item of pair){expect(valid_response({request_id:'paired-view',ok:true,view:item.view})).toBe(true);expect(valid_response({request_id:'paired-preview',ok:true,plan:item.plan})).toBe(true);expect(valid_response({request_id:'paired-view',ok:true,view:{...item.view,private_world:'ENGINE_ONLY'}})).toBe(false);}
    expect(await store.read_committed(view.run_id)).toEqual(source);
    const delivered=(await game.control_clock({run_id:view.run_id,operation_id:'received',expected_revision:view.revision,intent:{kind:'advance',to:2000}})).view;
    expect(delivered.resources.equipment_energy).toBe(15);expect(delivered.resources.movement_energy_reserved).toBe(1);expect(delivered.log.at(-1)?.kind).toBe('accepted_receipt');
    expect(delivered).not.toEqual(view);
  }finally{await store.delete();}
});
