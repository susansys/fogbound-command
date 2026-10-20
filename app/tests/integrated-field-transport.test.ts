import {expect,test,vi} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {valid_response} from '../src/dto';
import {Transport} from '../src/transport';
import {GameError} from '../src/contracts';
import type {IntegratedFieldEnvelope} from '../src/integrated-field-contracts';

test('NB3-AT004 public catalogue rejects missing source versions and inconsistent geometry mirrors',async()=>{
  const store=new Persistence('b33-owned-dto-'+crypto.randomUUID());
  try{
    const view=await new Game(store).create_run({schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}},'research',crypto.randomUUID());
    if(view.scenario_kind!=='play_integrated_field')throw Error('New package expected');
    expect(valid_response({request_id:'catalogue',ok:true,view})).toBe(true);
    for(const id of ['P-MOVE-HA','P-MOVE-AB-DRY','P-MOVE-AB-WET']){
      const missing=structuredClone(view);missing.model_catalog.parameters=missing.model_catalog.parameters.filter(parameter=>parameter.id!==id);
      expect(valid_response({request_id:'missing-'+id,ok:true,view:missing})).toBe(false);
      const invalid=structuredClone(view);invalid.model_catalog.parameters.find(parameter=>parameter.id===id)!.value=0;
      expect(valid_response({request_id:'invalid-'+id,ok:true,view:invalid})).toBe(false);
    }
    for(const actor of ['R','W'] as const)for(const field of ['configuration','equipment'] as const){
      const unknown=structuredClone(view),config=unknown.model_catalog.configurations.find(value=>value.actor===actor)!;
      if(field==='configuration')config.id='UNKNOWN-CONFIG';else config.equipment.id='UNKNOWN-EQUIPMENT';
      expect(valid_response({request_id:'unknown-'+actor+'-'+field,ok:true,view:unknown})).toBe(false);
    }
    const unbound=structuredClone(view);unbound.model_catalog.parameters[0].source_ref.id='UNKNOWN-SOURCE';
    expect(valid_response({request_id:'unbound',ok:true,view:unbound})).toBe(false);
    const geometry=structuredClone(view);geometry.geometry.points.A[0]=175;
    expect(valid_response({request_id:'geometry',ok:true,view:geometry})).toBe(false);
    expect(valid_response({request_id:'world',ok:true,view:{...view,world:{private_weather:'wet'}}})).toBe(false);
  }finally{await store.delete();}
});

test('S02 keeps actual Game deadline and attempt-limit rejections deterministic through Transport',async()=>{
 const store=new Persistence('b33-owned-rejection-'+crypto.randomUUID()),game=new Game(store);
 const selector={schema:13,contract:'0.5.1',package_ref:{id:'INTEGRATED-FIELD-PACK-3',version:1}};
 // The carrier forwards actual Game results; DTO parsing and correlation are the real Transport.
 class GameCarrier{
  onmessage:((event:MessageEvent)=>unknown)|null=null;onerror:(()=>unknown)|null=null;
  async postMessage(message:{request_id:string;envelope:IntegratedFieldEnvelope}){
   try{const result=await game.apply_integrated_intent(message.envelope);await this.onmessage?.({data:{request_id:message.request_id,ok:true,...result}} as MessageEvent);}
   catch(error){if(!(error instanceof GameError))throw error;await this.onmessage?.({data:{request_id:message.request_id,ok:false,code:error.code}} as MessageEvent);}
  }
  terminate(){}
 }
 vi.stubGlobal('Worker',GameCarrier);const transport=new Transport();
 try{
  let view=await game.create_run(selector,'research',crypto.randomUUID());
  view=(await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'advance',to:900000}})).view;
  const request=()=>({kind:'operate_integrated_field' as const,envelope:{run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'integrated_move' as const,actor:'R' as const,target:'A' as const,model_ref:{id:'INTEGRATED-FIELD-MODEL-3' as const,version:1 as const}}}});
  const expired=request(),before=view.revision;
  expect(await transport.request(expired)).toMatchObject({ok:false,code:'CONSTRAINT_DENIED'});
  expect((await game.get_view(view.run_id)).revision).toBe(before);expect(await store.receipt(view.run_id,expired.envelope.operation_id)).toBeUndefined();
  view=await game.create_run(selector,'research',crypto.randomUUID());
  for(let attempt=0;attempt<16;attempt++){const response=await transport.request(request());expect(response.ok).toBe(true);if(!response.ok||!response.view)throw Error('Actual Game response expected');view=response.view;}
  const overflow=request();expect(await transport.request(overflow)).toMatchObject({ok:false,code:'CAPACITY_CONFLICT'});
  expect((await game.get_view(view.run_id)).revision).toBe(view.revision);expect(await store.receipt(view.run_id,overflow.envelope.operation_id)).toBeUndefined();
 }finally{transport.close();vi.unstubAllGlobals();await store.delete();}
});
