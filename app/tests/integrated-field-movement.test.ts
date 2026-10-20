import {expect,test} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import type {IntegratedFieldEnvelope as Envelope} from '../src/integrated-field-contracts';
import {valid_integrated_field_envelope} from '../src/integrated-field-protocol';
import {valid_request} from '../src/protocol';
const packageRef={schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}};
async function fixture(guidance_loss_at:number|null=null){
 const store=new Persistence('b33-owned-movement-'+crypto.randomUUID()),game=new Game(store,{integrated_guidance_loss_at:guidance_loss_at});
 let view=await game.create_run(packageRef,'research',crypto.randomUUID());
 const advance=async(to:number)=>{view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to}})).view;};
 const move=async(actor:'R'|'W',target:'H'|'A'|'B')=>{view=(await game.issue_integrated_order({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'integrated_move',actor,target,model_ref:{id:'INTEGRATED-FIELD-MODEL-3',version:1}}} as Envelope)).view;};
 const local=async()=>{const state=await store.read_committed(view.run_id);if(state?.schema!==13)throw Error('Expected new state');return state;};
 return {store,game,advance,move,local,get view(){return view;}};
}
test('NB3-AT005 W returns with wet distance before 300s and dry distance thereafter',async()=>{
 const f=await fixture();try{await f.advance(288000);await f.move('W','H');await f.advance(300000);
 expect((await f.local()).actors.W.position_um).toEqual([242300000,150000000]);
 expect(f.view).toMatchObject({actors:expect.arrayContaining([expect.objectContaining({id:'W',position:expect.objectContaining({point:[250,150]})})])});
 await f.advance(408588);expect((await f.local()).actors.W.motion?.status).toBe('moving');
 await f.advance(408589);expect((await f.local()).actors.W.position_um).toEqual([150000000,150000000]);
 await f.advance(508589);expect((await f.local()).actors.W.position_um).toEqual([50000000,150000000]);
 const history=await f.game.get_replay(f.view.run_id,508589);expect(await history.get_view(f.view.run_id)).toEqual({...f.view,can_issue:false,next_action:'历史记录只能查看，请返回当前行动后安排任务'});
 }finally{await f.store.delete();}
});
test('NB3-AT006 R traverses each AB leg in ceil117648ms and HA in 100000ms',async()=>{
 const envelope={run_id:'own-run',operation_id:'own-op',expected_revision:1,intent:{kind:'integrated_move',actor:'R',target:'A',model_ref:{id:'INTEGRATED-FIELD-MODEL-3',version:1}}};
 expect(valid_integrated_field_envelope(envelope)).toBe(true);
 for(const intent of [{...envelope.intent,actor:['R']},{...envelope.intent,target:'UNKNOWN'},{...envelope.intent,model_ref:{id:'OTHER',version:1}},{...envelope.intent,world_patch:{}}])expect(valid_integrated_field_envelope({...envelope,intent})).toBe(false);
 expect(valid_request({kind:'operate',request_id:'own-request',envelope})).toBe(false);
 expect(valid_request({kind:'operate_integrated_field',request_id:'own-request',envelope})).toBe(true);
 const f=await fixture();try{await f.move('R','A');await f.advance(101000);expect((await f.local()).actors.R.position_um).toEqual([150000000,150000000]);
 await f.advance(300000);await f.move('R','B');await f.advance(418647);expect((await f.local()).actors.R.motion?.status).toBe('moving');
 await f.advance(418648);expect((await f.local()).actors.R.position_um).toEqual([250000000,150000000]);
 await f.advance(419000);await f.move('R','H');await f.advance(537648);expect((await f.local()).actors.R.position_um).toEqual([150000000,150000000]);
 await f.advance(637648);expect((await f.local()).actors.R.position_um).toEqual([50000000,150000000]);
 }finally{await f.store.delete();}
});
test('NB3-AT007 movement business results agree across one step, boundaries and fine steps',async()=>{
 const results=[];for(const stops of [[510000],[289000,300000,408589,508589,510000],Array.from({length:222},(_,i)=>289000+i*1000)]){
 const f=await fixture();try{await f.advance(288000);await f.move('W','H');for(const to of stops)await f.advance(to);
 const state=await f.local();results.push({position:state.actors.W.position_um,ended_at:state.actors.W.motion?.ended_at,status:state.actors.W.motion?.status});
 }finally{await f.store.delete();}}
 expect(results[1]).toEqual(results[0]);expect(results[2]).toEqual(results[0]);
});
test('NB3-AT008 guidance loss stops at integrated position without teleport or automatic retry',async()=>{
 const f=await fixture(295000);try{await f.advance(288000);await f.move('W','H');await f.advance(295000);
 expect((await f.local()).actors.W).toMatchObject({position_um:[245800000,150000000],motion:{status:'blocked',ended_at:295000}});
 await f.advance(510000);expect((await f.local()).actors.W.position_um).toEqual([245800000,150000000]);
 expect(f.view).toMatchObject({actors:expect.arrayContaining([expect.objectContaining({id:'W',position:expect.objectContaining({point:[245.8,150],observed_at:295000,received_at:296000})})])});
 }finally{await f.store.delete();}
});
