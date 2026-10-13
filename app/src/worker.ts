/// <reference lib="webworker" />
import { Game } from "./core/game";
import { Persistence } from "./core/persistence";
import { engineeringDefinition,recordEngineeringDefinition,prestartEngineeringDefinition,load_definition } from "./core/scenario";
import { GameError, type PlayerView } from "./contracts";
import type { Request, Response } from "./transport";
import { valid_request, correlation } from "./protocol";
import {valid_response} from './dto';
const scope = self as unknown as DedicatedWorkerGlobalScope;
const store = new Persistence("fogbound-fb01-schema4");
const game = new Game(store);
let locked = false;
let blocked=false;
async function acquire_writer(): Promise<boolean> {
  if (locked) return true;
  if (!navigator.locks) throw new GameError("LOCK_UNSUPPORTED");
  return new Promise<boolean>((resolve, reject) => {
    void navigator.locks
      .request("fogbound-fb01-writer", { ifAvailable: true }, async (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        locked = true;
        resolve(true);
        await new Promise<void>(() => {}); // Web Lock lifetime equals this Worker lifetime.
      })
      .catch(reject);
  });
}
let queue = Promise.resolve();
let active:PlayerView|null=null;
let history:Game|null=null;
let anchor={wall:0,sim:0};
let clockQueued=false;
function clockTarget(view:PlayerView){return Math.min(610000,anchor.sim+Math.floor((performance.now()-anchor.wall)*view.rate));}
function publish(response:Response){if(!valid_response(response))throw new GameError('STORAGE_UNCONFIRMED');scope.postMessage(response);}
function remember(view:PlayerView){
  if(active?.run_id===view.run_id&&view.revision<active.revision)return;
  if(!active||active.run_id!==view.run_id||active.paused!==view.paused||active.rate!==view.rate)anchor={wall:performance.now(),sim:view.sim_time};
  active=view;
}
async function pauseActiveRun(){
  if(!active||active.paused)return;
  const current=await game.get_view(active.run_id);
  if(current.paused){remember(current);return;}
  const result=await game.control_clock({run_id:current.run_id,operation_id:crypto.randomUUID(),expected_revision:current.revision,intent:{kind:'pause',reason:'manual'}},current.mode==='command'?clockTarget(current):undefined);
  if(!result.view.paused)throw new GameError('STORAGE_UNCONFIRMED');
  remember(result.view);
}
setInterval(()=>{
  if(clockQueued||!locked||!active||active.mode!=='command'||active.paused)return;
  clockQueued=true;
  queue=queue.then(async()=>{
    try{
      if(!active||active.mode!=='command'||active.paused)return;
      const to=clockTarget(active);
      if(to<=active.sim_time)return;
      const result=await game.tick(active.run_id,to,crypto.randomUUID());
      remember(result.view);
      publish({request_id:`clock-${crypto.randomUUID()}`,ok:true,view:result.view});
    }catch{
      blocked=true;
      active=null;
      scope.postMessage({request_id:'clock-fault',ok:false,code:'STORAGE_UNCONFIRMED'} satisfies Response);
    }finally{clockQueued=false;}
  });
},250);
scope.onmessage = (event: MessageEvent<unknown>) => {
  queue = queue.then(async () => {
    const raw: unknown = event.data,
      request_id = correlation(raw);
    try {
      if (!valid_request(raw)) throw new GameError("INVALID_INPUT");
      const input = raw;
      if(history&&['create','takeover','restart','operate'].includes(input.kind))throw new GameError('HISTORY_READ_ONLY');
      if(blocked&&['create','operate'].includes(input.kind))throw new GameError('STORAGE_UNCONFIRMED');
      let response: Response;
      let rememberResult=true;
      if (
        input.kind === "list" &&
        Object.keys(input).sort().join(",") === "kind,request_id"
      )
        response = {
          request_id: input.request_id,
          ok: true,
          runs: await store.list_runs(),
        };
      else if (
        input.kind === "create"
      ) {
        if (!(await acquire_writer())) throw new GameError("WRITER_BUSY");
        const definition=await load_definition(input.definition_ref==='FB02-ENG-RECORD'?recordEngineeringDefinition:input.definition_ref==='ENG-PRESTART-REPLACE'?prestartEngineeringDefinition:engineeringDefinition);
        const original=await store.creation(input.operation_id);
        if(!original)await pauseActiveRun();
        const created=await game.create_run(definition,input.mode,input.operation_id);
        const view=original?await game.get_view(created.run_id):created;
        if(original)rememberResult=active?.run_id===view.run_id;
        response={request_id:input.request_id,ok:true,view};
      } else if(input.kind==='management_pause'&&locked&&active){
        const view=await game.get_view(active.run_id);
        if(view.mode==='command'&&!view.paused){
          const to=clockTarget(view);
          const result=await game.control_clock({run_id:view.run_id,operation_id:crypto.randomUUID(),expected_revision:view.revision,intent:{kind:'pause',reason:input.reason}},to);
          remember(result.view);response={request_id:input.request_id,ok:true,...result};
        }else response={request_id:input.request_id,ok:true,view};
      } else if(input.kind==='previous'&&locked){
        const current=await game.get_view(input.run_id);if(!current.source_run)throw new GameError('RUN_NOT_FOUND');
        const source=await game.get_view(current.source_run);history=await game.get_replay(source.run_id,source.sim_time);
        response={request_id:input.request_id,ok:true,view:await history.get_view(source.run_id)};
      } else if(input.kind==='replay'){
        history=await game.get_replay(input.run_id,input.to,input.node_revision);
        response={request_id:input.request_id,ok:true,view:await history.get_view(input.run_id)};
      } else if(input.kind==='current'){
        const view=await game.get_view(input.run_id);history=null;
        response={request_id:input.request_id,ok:true,view};
      } else if(input.kind==='restart'&&locked){
        response={request_id:input.request_id,ok:true,view:await game.restart_run(input.run_id,input.operation_id)};
      } else if(input.kind==='takeover'){
        if(!(await acquire_writer()))throw new GameError('WRITER_BUSY');
        await pauseActiveRun();
        response={request_id:input.request_id,ok:true,...await game.restore(input.run_id,input.operation_id)};
        blocked=false;
      } else if (input.kind === "view" && locked)
        response = {
          request_id: input.request_id,
          ok: true,
          view: await (history??game).get_view(input.run_id),
        };
      else if (input.kind === "preview" && locked)
        response = {
          request_id: input.request_id,
          ok: true,
          plan: await (history??game).preview_plan(
            input.run_id,
            input.revision,
            input.editing_seq,
          ),
        };
      else if (input.kind === "operate" && locked) {
        const clock_to=active?.run_id===input.envelope.run_id&&active.mode==='command'&&!active.paused?clockTarget(active):undefined;
        const result =
          input.envelope.intent.kind === "issue"
            ? await game.issue_order(input.envelope)
            : input.envelope.intent.kind==='save'?await game.save(input.envelope,clock_to)
            : await game.control_clock(input.envelope,clock_to);
        response = { request_id: input.request_id, ok: true, ...result };
      } else if (input.kind === "receipt" && locked)
        response = {
          request_id: input.request_id,
          ok: true,
          receipt: await (history??game).get_receipt(input.run_id, input.operation_id),
        };
      else throw new GameError("INVALID_INPUT");
      if(rememberResult&&response.ok&&response.view&&!history&&locked&&!await store.is_read_only(response.view.run_id))remember(response.view);
      publish(response);
    } catch (error) {
      const code =
        error instanceof GameError ? error.code : "STORAGE_UNCONFIRMED";
      if(['STORAGE_UNCONFIRMED','ENGINE_UNCONFIRMED','STALE_WRITER'].includes(code)){blocked=true;active=null;}
      scope.postMessage({ request_id, ok: false, code } satisfies Response);
    }
  });
};
