import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {recordEngineeringDefinition} from '../src/core/scenario';
import {valid_response} from '../src/dto';

test('FB02-S03 previews the fixed archive and public costs without sending, reserving, or changing the committed package',async()=>{
  const store=new Persistence('fb02-record-preview'),game=new Game(store);
  try {
    const view=await game.create_run(recordEngineeringDefinition,'research','start');
    const before=await store.read_committed(view.run_id);
    const plan=await game.preview_plan(view.run_id,view.revision,7);
    expect(plan).toMatchObject({kind:'record',actor:'R',target:'A',station:'H',report_id:'REPORT-A',delivery_id:'DELIVERY-A',definition_hash:recordEngineeringDefinition.definition_hash,setup_ms:5000,work:4,estimated_record_ms:40000,estimated_total_ms:47000,link_ms:1000,record_energy:4,record_wear:3,record_packs:1,allowed:true,editing_seq:7});
    expect(valid_response({request_id:'preview',ok:true,plan})).toBe(true);
    expect(await store.read_committed(view.run_id)).toEqual(before);
    expect(await game.get_view(view.run_id)).toEqual(view);
    await expect(game.preview_plan(view.run_id,0,7)).rejects.toThrow('STALE_REVISION');
    await expect(game.issue_order({run_id:view.run_id,operation_id:'record-issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record-issue',plan}})).rejects.toThrow('INVALID_INPUT');
    expect(await store.read_committed(view.run_id)).toEqual(before);
    const tampered={...plan,target:'B'} as unknown as typeof plan;
    await expect(game.issue_order({run_id:view.run_id,operation_id:'record-invalid',expected_revision:view.revision,intent:{kind:'issue',command_id:'record-invalid',plan:tampered}})).rejects.toThrow('INVALID_INPUT');
    expect(await store.read_committed(view.run_id)).toEqual(before);
  } finally {await store.delete();}
});
