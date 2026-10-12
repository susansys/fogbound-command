/// <reference lib="webworker" />
import { Game } from './core/game';
import { Persistence } from './core/persistence';
import { engineeringDefinition } from './core/scenario';
import { GameError } from './contracts';
import type { Request,Response } from './transport';
import { valid_request,correlation } from './protocol';
const scope=self as unknown as DedicatedWorkerGlobalScope;
const store=new Persistence('fogbound-fb01-schema4');
const game=new Game(store);
let locked=false;
async function acquire_writer():Promise<boolean> {
  if(locked)return true;
  if(!navigator.locks)throw new GameError('LOCK_UNSUPPORTED');
  return new Promise<boolean>((resolve,reject)=>{
    void navigator.locks.request('fogbound-fb01-writer',{ifAvailable:true},async lock=>{
      if(!lock){resolve(false);return;}
      locked=true;resolve(true);
      await new Promise<void>(()=>{}); // Web Lock lifetime equals this Worker lifetime.
    }).catch(reject);
  });
}
let queue=Promise.resolve();
scope.onmessage=(event:MessageEvent<unknown>)=>{
  queue=queue.then(async()=>{
    const raw:unknown=event.data,request_id=correlation(raw);
    try {
      if(!valid_request(raw))throw new GameError('INVALID_INPUT');
      const input=raw;
      let response:Response;
      if(input.kind==='list' && Object.keys(input).sort().join(',')==='kind,request_id')response={request_id:input.request_id,ok:true,runs:await store.list_runs()};
      else if(input.kind==='create' && Object.keys(input).sort().join(',')==='kind,mode,operation_id,request_id') {
        if(!await acquire_writer())throw new GameError('WRITER_BUSY');
        response={request_id:input.request_id,ok:true,view:await game.create_run(engineeringDefinition,input.mode,input.operation_id)};
      } else if(input.kind==='view' && locked)response={request_id:input.request_id,ok:true,view:await game.get_view(input.run_id)};
      else throw new GameError('INVALID_INPUT');
      scope.postMessage(response);
    } catch(error) {
      const code=error instanceof GameError?error.code:'STORAGE_UNCONFIRMED';
      scope.postMessage({request_id,ok:false,code} satisfies Response);
    }
  });
};
