import {legacy_view,legacy_result} from './legacy-branch';
import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition,recordEngineeringDefinition} from '../src/core/scenario';
import {valid_response} from '../src/dto';

test('CR06 the public issued command freezes the actual optional reason and survives historical reading',async()=>{
  const store=new Persistence('readable-frozen-reason'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(recordEngineeringDefinition,'research','create'));
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    const reason='先记录原件 <script>不执行</script>，保留这个原始理由。';
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record',plan,reason}}))).view;
    const registered=view.revision;
    expect(view).toMatchObject({issued_orders:[{command_id:'record',issued:0,plan,reason}]});
    expect(valid_response({request_id:'public',ok:true,view})).toBe(true);
    const order=view.issued_orders[0];
    expect(valid_response({request_id:'public',ok:true,view:{...view,issued_orders:[{...order,accepted:1000}]}})).toBe(false);
    expect(valid_response({request_id:'public',ok:true,view:{...view,issued_orders:[{...order,plan:{...order.plan,private_actor_position:90}}]}})).toBe(false);
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'finish',expected_revision:view.revision,intent:{kind:'advance',to:47000}}))).view;
    const history=await game.get_replay(view.run_id,0,registered);
    expect((legacy_view(await history.get_view(view.run_id)))).toMatchObject({issued_orders:[{command_id:'record',issued:0,plan,reason}]});
    expect(view).toMatchObject({issued_orders:[{reason}]});
  }finally{await store.delete();}
});

test('CR05 old Move also provides complete nodes and distinct same-time read-only commits',async()=>{
  const store=new Persistence('readable-move-navigation'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(engineeringDefinition,'research','create'));
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'move',plan}}))).view;
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'private-accept',expected_revision:view.revision,intent:{kind:'advance',to:1500}}))).view;
    view=(legacy_result(await game.save({run_id:view.run_id,operation_id:'save',expected_revision:view.revision,intent:{kind:'save'}}))).view;
    expect(view.replay_nodes).toMatchObject([{revision:1,at:0,meaningful:true},{revision:2,at:0,meaningful:true},{revision:3,at:1500,meaningful:false},{revision:4,at:1500,meaningful:true}]);
    expect(valid_response({request_id:'move-nodes',ok:true,view})).toBe(true);
    for(const revision of [3,4]){
      const history=await game.get_replay(view.run_id,0,revision),known=legacy_view(await history.get_view(view.run_id));
      expect(known.revision).toBe(revision);expect(known.sim_time).toBe(1500);
      expect(known.position.x).toBe(50);
      await expect(history.save({run_id:view.run_id,operation_id:`historical-save-${revision}`,expected_revision:revision,intent:{kind:'save'}})).rejects.toThrow('HISTORY_READ_ONLY');
    }
    expect(legacy_view(await game.get_view(view.run_id))).toEqual(view);
  }finally{await store.delete();}
});

test('CR05 public navigation marks real receipts and administrative commits, preserves quiet commits and same-time identities',async()=>{
  const store=new Persistence('readable-navigation'),game=new Game(store);
  try{
    let view=legacy_view(await game.create_run(recordEngineeringDefinition,'research','create'));
    view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:'quiet-before',expected_revision:view.revision,intent:{kind:'advance',to:100}}))).view;
    const plan=await game.preview_plan(view.run_id,view.revision,1);
    view=(legacy_result(await game.issue_order({run_id:view.run_id,operation_id:'issue',expected_revision:view.revision,intent:{kind:'issue',command_id:'record',plan}}))).view;
    for(const to of [1000,1500,2100])view=(legacy_result(await game.control_clock({run_id:view.run_id,operation_id:`advance-${to}`,expected_revision:view.revision,intent:{kind:'advance',to}}))).view;
    view=(legacy_result(await game.save({run_id:view.run_id,operation_id:'save',expected_revision:view.revision,intent:{kind:'save'}}))).view;
    expect(view.replay_nodes).toMatchObject([
      {revision:1,at:0,meaningful:true},{revision:2,at:100,meaningful:false},
      {revision:3,at:100,meaningful:true},{revision:4,at:1000,meaningful:true},
      {revision:5,at:1500,meaningful:false},{revision:6,at:2100,meaningful:true},
      {revision:7,at:2100,meaningful:true},
    ]);
    expect(valid_response({request_id:'navigation',ok:true,view})).toBe(true);
    expect(view.replay_nodes?.at(-2)?.label).not.toBe(view.replay_nodes?.at(-1)?.label);
    const quiet=await game.get_replay(view.run_id,0,5);
    expect((legacy_view(await quiet.get_view(view.run_id))).log.some(entry=>entry.kind==='accepted_receipt')).toBe(false);
    const acknowledged=await game.get_replay(view.run_id,0,6);
    expect((legacy_view(await acknowledged.get_view(view.run_id))).log.some(entry=>entry.kind==='accepted_receipt')).toBe(true);
  }finally{await store.delete();}
});
