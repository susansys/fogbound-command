import {test,expect} from 'vitest';
import {Game} from '../src/core/game';
import {Persistence} from '../src/core/persistence';
import {engineeringDefinition} from '../src/core/scenario';
import {valid_response} from '../src/dto';
test('the outbound whitelist rejects private, nested extra and malformed unknown-time fields',async()=>{
  const store=new Persistence('dto-whitelist'),game=new Game(store);
  const view=await game.create_run(engineeringDefinition,'research','create');
  const response={request_id:'response',ok:true,view};
  expect(valid_response(response)).toBe(true);
  expect(valid_response({...response,view:{...view,world_canary:'private-a'}})).toBe(false);
  expect(valid_response({...response,view:{...view,constructor:'ENGINE_ONLY'}})).toBe(false);
  expect(valid_response({...response,constructor:'ENGINE_ONLY'})).toBe(false);
  for(const key of ['constructor','toString','__proto__']){
    const nested=Object.fromEntries([...Object.entries(view.position),[key,'ENGINE_ONLY']]);
    expect(valid_response({...response,view:{...view,position:nested}})).toBe(false);
  }
  expect(valid_response({...response,view:{...view,position:{...view.position,private_completed:true}}})).toBe(false);
  expect(valid_response({...response,view:{...view,report:{...view.report,source_event_time:{kind:'unknown',value:0}}}})).toBe(false);
  expect(valid_response({request_id:'response',ok:false,code:'private-queue-count-19'})).toBe(false);
  expect(valid_response(null)).toBe(false);await store.delete();
});
test('outbound vectors and lists reject attached private array properties and sparse indices',async()=>{
  const store=new Persistence('dto-arrays'),game=new Game(store);const view=await game.create_run(engineeringDefinition,'research','create');
  expect(valid_response({request_id:'dto',ok:true,view:{...view,geometry:{...view.geometry,H:Object.assign([50,150],{private_canary:'ENGINE_ONLY'})}}})).toBe(false);
  expect(valid_response({request_id:'dto',ok:true,view:{...view,log:Object.assign([...view.log],{constructor:'ENGINE_ONLY'})}})).toBe(false);
  const runs=Object.assign([{run_id:view.run_id,revision:1,sim_time:0,mode:'research',finished:false}],{private_canary:'ENGINE_ONLY'});
  expect(valid_response({request_id:'dto',ok:true,runs})).toBe(false);
  expect(valid_response({request_id:'dto',ok:true,view:{...view,geometry:{...view.geometry,H:new Array(2)}}})).toBe(false);await store.delete();
});
