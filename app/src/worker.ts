/// <reference lib="webworker" />
import { Game } from "./core/game";
import { Persistence } from "./core/persistence";
import { engineeringDefinition } from "./core/scenario";
import { GameError, type PlayerView } from "./contracts";
import type { Request, Response } from "./transport";
import { valid_request, correlation } from "./protocol";
const scope = self as unknown as DedicatedWorkerGlobalScope;
const store = new Persistence("fogbound-fb01-schema4");
const game = new Game(store);
let locked = false;
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
let anchor={wall:0,sim:0};
let clockQueued=false;
function remember(view:PlayerView){
  if(active?.run_id===view.run_id&&view.revision<active.revision)return;
  if(!active||active.run_id!==view.run_id||active.paused!==view.paused||active.rate!==view.rate)anchor={wall:performance.now(),sim:view.sim_time};
  active=view;
}
setInterval(()=>{
  if(clockQueued||!locked||!active||active.mode!=='command'||active.paused)return;
  clockQueued=true;
  queue=queue.then(async()=>{
    try{
      if(!active||active.mode!=='command'||active.paused)return;
      const to=Math.min(610000,anchor.sim+Math.floor((performance.now()-anchor.wall)*active.rate));
      if(to<=active.sim_time)return;
      const result=await game.tick(active.run_id,to,crypto.randomUUID());
      remember(result.view);
      scope.postMessage({request_id:`clock-${crypto.randomUUID()}`,ok:true,view:result.view} satisfies Response);
    }catch{
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
      let response: Response;
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
        input.kind === "create" &&
        Object.keys(input).sort().join(",") ===
          "kind,mode,operation_id,request_id"
      ) {
        if (!(await acquire_writer())) throw new GameError("WRITER_BUSY");
        response = {
          request_id: input.request_id,
          ok: true,
          view: await game.create_run(
            engineeringDefinition,
            input.mode,
            input.operation_id,
          ),
        };
      } else if (input.kind === "view" && locked)
        response = {
          request_id: input.request_id,
          ok: true,
          view: await game.get_view(input.run_id),
        };
      else if (input.kind === "preview" && locked)
        response = {
          request_id: input.request_id,
          ok: true,
          plan: await game.preview_plan(
            input.run_id,
            input.revision,
            input.editing_seq,
          ),
        };
      else if (input.kind === "operate" && locked) {
        const clock_to=active?.run_id===input.envelope.run_id&&active.mode==='command'&&!active.paused?Math.min(610000,anchor.sim+Math.floor((performance.now()-anchor.wall)*active.rate)):undefined;
        const result =
          input.envelope.intent.kind === "issue"
            ? await game.issue_order(input.envelope)
            : await game.control_clock(input.envelope,clock_to);
        response = { request_id: input.request_id, ok: true, ...result };
      } else if (input.kind === "receipt" && locked)
        response = {
          request_id: input.request_id,
          ok: true,
          receipt: await game.get_receipt(input.run_id, input.operation_id),
        };
      else throw new GameError("INVALID_INPUT");
      if(response.ok&&response.view)remember(response.view);
      scope.postMessage(response);
    } catch (error) {
      const code =
        error instanceof GameError ? error.code : "STORAGE_UNCONFIRMED";
      scope.postMessage({ request_id, ok: false, code } satisfies Response);
    }
  });
};
