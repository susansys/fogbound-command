import {expect,test} from 'vitest';
import {valid_request} from '../src/protocol';
import {valid_response} from '../src/dto';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import definition from '../src/core/mission-definition.json';
import {mission_draft} from './mission-fixtures';
test('B22 T01 Worker boundary carries only the discriminated mission request and legal mission view',async()=>{
  const store=new Persistence('b22-owned-t01-protocol');
  try{
    expect(valid_request({request_id:'new',kind:'create',mode:'research',operation_id:'create',definition_ref:'B22-MISSION-01'})).toBe(true);
    const game=new Game(store),view=await game.create_run(definition,'research','create');
    expect(valid_response({request_id:'new',ok:true,view})).toBe(true);
    const draft=mission_draft(view.run_id),preview=await game.preview_plan(view.run_id,view.revision,4,draft);
    expect(valid_request({request_id:'preview',kind:'preview_mission',run_id:view.run_id,revision:1,editing_seq:4,draft})).toBe(true);
    expect(valid_response({request_id:'preview',ok:true,mission_preview:preview})).toBe(true);
    expect(valid_request({request_id:'fake',kind:'preview_mission',run_id:view.run_id,revision:1,editing_seq:4,draft,actor_context:'commander'})).toBe(false);
    expect(valid_response({request_id:'leak',ok:true,view:{...view,engine_conditions:{hidden:true}}})).toBe(false);
  }finally{await store.delete();}
});
