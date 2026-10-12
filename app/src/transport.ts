import type { Mode, PlayerView, Plan, Envelope, Receipt } from "./contracts";
export type RunSummary = {
  run_id: string;
  revision: number;
  sim_time: number;
  mode: Mode;
  finished: boolean;
};
export type Request =
  | { kind: "create"; mode: Mode; operation_id: string }
  | { kind: "list" }
  | { kind: "view"; run_id: string }
  | { kind: "preview"; run_id: string; revision: number; editing_seq: number }
  | { kind: "operate"; envelope: Envelope }
  | { kind: "receipt"; run_id: string; operation_id: string };
export type Response =
  | {
      request_id: string;
      ok: true;
      view?: PlayerView;
      runs?: RunSummary[];
      plan?: Plan;
      receipt?: Receipt | null;
    }
  | { request_id: string; ok: false; code: string };
export class Transport {
  private listeners=new Set<(response:Response)=>void>();
  subscribe(listener:(response:Response)=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  private worker: Worker;
  private pending = new Map<
    string,
    { resolve: (value: Response) => void; reject: (error: Error) => void }
  >();
  constructor() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = (event: MessageEvent<Response>) => {
      const response = event.data,
        waiting = this.pending.get(response.request_id);
      for(const listener of this.listeners)listener(response);
      if (!waiting) return;
      this.pending.delete(response.request_id);
      waiting.resolve(response);
    };
    this.worker.onerror = () => {
      for (const waiting of this.pending.values())
        waiting.reject(Error("CHANNEL_UNCERTAIN"));
      this.pending.clear();
    };
  }
  request(request: Request): Promise<Response> {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(request_id, { resolve, reject });
      this.worker.postMessage({ ...request, request_id });
    });
  }
  close() {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(Error("CHANNEL_UNCERTAIN"));
    this.pending.clear();
  }
}
