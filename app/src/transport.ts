import type { Mode, Plan, Envelope, Receipt,DefinitionRef,PrestartCaseRef } from "./contracts";
import type {GamePlayerView as PlayerView} from './play-contracts';
import {valid_response} from './dto';
import {correlation} from './protocol';
export type RunSummary = {
  run_id: string;
  revision: number;
  sim_time: number;
  mode: Mode;
  finished: boolean;
  scenario_kind?: 'move'|'record'|'prestart_move'|'play_corridor';
  read_only?:boolean;
};
export type Request =
  | { kind: "create"; mode: Mode; operation_id: string;definition_ref?:DefinitionRef;case_ref?:PrestartCaseRef }
  | { kind: "list" }
  | { kind: "view"; run_id: string }
  | { kind: "preview"; run_id: string; revision: number; editing_seq: number }
  | { kind: "operate"; envelope: Envelope }
  | { kind: "receipt"; run_id: string; operation_id: string }
  | { kind:'takeover';run_id:string;operation_id:string }
  | {kind:'restart';run_id:string;operation_id:string}
  | {kind:'replay';run_id:string;to:number;node_revision?:number}
  | {kind:'current';run_id:string}
  | {kind:'previous';run_id:string}
  | {kind:'management_pause';reason:'focus_lost'|'application_hidden'};
export type Response =
  | {
      request_id: string;
      ok: true;
      view?: PlayerView;
      runs?: RunSummary[];
      plan?: Plan;
      receipt?: Receipt | null;
    }
  | { request_id: string; ok: false; code: string;field_path?:string };
export class Transport {
  private listeners=new Set<(response:Response)=>void>();
  subscribe(listener:(response:Response)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  private worker: Worker;
  private pending = new Map<
    string,
    { resolve: (value: Response) => void; reject: (error: Error) => void;timer:ReturnType<typeof setTimeout> }
  >();
  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      const response:Response = valid_response(event.data)?event.data:{request_id:correlation(event.data),ok:false,code:'CHANNEL_UNCERTAIN'},
        waiting = this.pending.get(response.request_id);
      for(const listener of this.listeners)listener(response);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      this.pending.delete(response.request_id);
      waiting.resolve(response);
    };
    this.worker.onerror = () => {
      for (const waiting of this.pending.values())
        {clearTimeout(waiting.timer);waiting.reject(Error("CHANNEL_UNCERTAIN"));}
      this.pending.clear();
    };
  }
  request(request: Request): Promise<Response> {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer=setTimeout(()=>{this.pending.delete(request_id);reject(Error('CHANNEL_UNCERTAIN'));},10000);
      this.pending.set(request_id, { resolve, reject,timer });
      this.worker.postMessage({ ...request, request_id });
    });
  }
  close() {
    this.worker.terminate();
    for (const p of this.pending.values()) {clearTimeout(p.timer);p.reject(Error("CHANNEL_UNCERTAIN"));}
    this.pending.clear();
  }
}
