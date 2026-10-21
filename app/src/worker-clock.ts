export const worker_now=()=>performance.now();
// The source belongs to this Worker. Only the isolated verification build
// replaces worker_now; no production message or browser state selects it.
export function create_worker_clock(now:()=>number=worker_now){let anchor={wall:0,sim:0};return{reset(sim:number){anchor={wall:now(),sim};},target(rate:1|2|4,bound:number){return Math.min(bound,anchor.sim+Math.floor((now()-anchor.wall)*rate));}};}
