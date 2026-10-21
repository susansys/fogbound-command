import {expect,test} from 'vitest';
import {Game} from '../src/core/game';import {Persistence} from '../src/core/persistence';
import type {IntegratedFieldEnvelope} from '../src/integrated-field-contracts';
type Profile='nominal'|'rain_dry'|'rain_stopped_wet';
async function fixture(profile:Profile='nominal',guidance_loss_at:number|null=null){
 const store=new Persistence('b33-owned-environment-'+crypto.randomUUID()),game=new Game(store,{integrated_environment:profile,integrated_guidance_loss_at:guidance_loss_at});
 let view=await game.create_run({schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}},'research',crypto.randomUUID());
 const apply=async(intent:IntegratedFieldEnvelope['intent'])=>{view=(await game.apply_integrated_intent({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent})).view;};
 const advance=(to:number)=>apply({kind:'advance',to}),move=(target:'H'|'A'|'B')=>apply({kind:'integrated_move',actor:'W',target,model_ref:{id:'INTEGRATED-FIELD-MODEL-3',version:1}});
 const local=async()=>{const state=await store.read_committed(view.run_id);if(state?.schema!==13)throw Error('Expected integrated state');return state;};
 return{store,game,advance,move,local,get view(){return view;}};
}
function environment(state:object):{profile:Profile;cursor:number;rain:boolean;ground:'dry'|'wet';fog:boolean;references:{near50:'visible'|'unavailable';far100:'visible'|'not_visible'}}{return Reflect.get(state,'environment');}

test('NB3-AT021 wet boundaries affect only distance not yet travelled',async()=>{
 const f=await fixture();try{await f.advance(178000);await f.move('H');await f.advance(180000);expect((await f.local()).actors.W.position_um).toEqual([249150000,150000000]);expect(environment(await f.local())).toMatchObject({ground:'wet'});
  await f.advance(181000);expect((await f.local()).actors.W.position_um).toEqual([248450000,150000000]);await f.advance(300000);expect((await f.local()).actors.W.position_um).toEqual([165150000,150000000]);expect(environment(await f.local())).toMatchObject({ground:'dry'});
  await f.advance(317823);expect((await f.local()).actors.W.motion?.status).toBe('moving');await f.advance(317824);expect((await f.local()).actors.W.position_um).toEqual([150000000,150000000]);
 }finally{await f.store.delete();}
 const lost=await fixture('nominal',260000);try{await lost.advance(259999);expect(environment(await lost.local()).references.near50).toBe('visible');await lost.advance(260000);expect(environment(await lost.local()).references).toEqual({near50:'unavailable',far100:'not_visible'});expect(Reflect.has(lost.view,'environment')).toBe(false);}finally{await lost.store.delete();}
});

test('NB3-AT022 rain can coexist with a dry open road and stop before the road dries',async()=>{
 const results=[];for(const profile of ['rain_dry','rain_stopped_wet'] as const){const f=await fixture(profile);try{await f.advance(288000);await f.move('H');await f.advance(289000);expect(environment(await f.local())).toMatchObject(profile==='rain_dry'?{rain:true,ground:'dry'}:{rain:false,ground:'wet'});expect((await f.local()).actors.W.motion?.status).toBe('moving');await f.advance(300000);results.push((await f.local()).actors.W.position_um);expect(Reflect.has(f.view,'environment')).toBe(false);
  await f.game.save({run_id:f.view.run_id,operation_id:crypto.randomUUID(),expected_revision:f.view.revision,intent:{kind:'save'}});const restored=await new Game(f.store).restore(f.view.run_id,crypto.randomUUID());expect(restored.view.paused).toBe(true);expect(environment(await f.local()).profile).toBe(profile);
 }finally{await f.store.delete();}}expect(results).toEqual([[240650000,150000000],[242300000,150000000]]);
});

test('NB3-AT023 fog records only finite 50m and 100m reference visibility, never MOR or identification probability',async()=>{
 const f=await fixture();try{await f.advance(219999);expect(environment(await f.local())).toMatchObject({fog:false,references:{near50:'visible',far100:'visible'}});await f.advance(220000);expect(environment(await f.local())).toMatchObject({fog:true,references:{near50:'visible',far100:'not_visible'}});await f.advance(360000);expect(environment(await f.local())).toMatchObject({fog:false,references:{near50:'visible',far100:'visible'}});const text=JSON.stringify(environment(await f.local()));expect(text).not.toMatch(/MOR|probability|recognition|visibility_metres/i);expect(Reflect.has(f.view,'environment')).toBe(false);
 }finally{await f.store.delete();}
});

test('NB3-AT024 completed travel precedes environment changes and a same-time command accepts new wet conditions',async()=>{
 const outputs=[];for(const stops of [[180000,181000],[179500,180000,180500,181000]]){const f=await fixture();try{await f.advance(61352);await f.move('A');await f.advance(179000);await f.move('B');for(const to of stops)await f.advance(to);const state=await f.local();expect(state.actors.W,JSON.stringify({actor:state.actors.W,reports:state.position_reports})).toMatchObject({position_um:[150700000,150000000],motion:{target:'B',start_at:180000,status:'moving'}});expect(state.position_reports.filter(report=>report.observed_at===180000).map(report=>({point:report.point_um,evidence:report.evidence.split('-').at(-1),received:report.received_at}))).toEqual([{point:[150000000,150000000],evidence:'arrived',received:181000},{point:[150000000,150000000],evidence:'accepted',received:182000}]);outputs.push({position:state.actors.W.position_um,environment:environment(state),energy:state.work.portable_energy_uJ});
 }finally{await f.store.delete();}}expect(outputs[1]).toEqual(outputs[0]);
});
