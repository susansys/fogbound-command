import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';

test('B25 E08/E09 command stale preparation rejection remains visible after correlated current-view refresh',async({page},info)=>{
 await page.addInitScript(()=>{
  const trace:{requests:Record<string,unknown>[];replies:Record<string,unknown>[];released:Record<string,unknown>|null;laterClocks:number}={requests:[],replies:[],released:null,laterClocks:0};
  Reflect.set(window,'__b25Diagnostic',trace);
  const Native=window.Worker;
  window.Worker=new Proxy(Native,{construct(Target,args){
   const worker=Reflect.construct(Target,args) as Worker,post=worker.postMessage.bind(worker);
   if(!String(args[0]).includes('/assets/worker-'))return worker;
   let held:Record<string,any>|null=null,first=true,rejected=false;
   worker.postMessage=(input:Record<string,any>)=>{
    trace.requests.push({request_id:input.request_id,kind:input.kind,intent:input.envelope?.intent.kind,operation_id:input.envelope?.operation_id,run_id:input.run_id??input.envelope?.run_id,expected_revision:input.envelope?.expected_revision});
    if(first&&input.kind==='operate_outcome'&&input.envelope?.intent.kind==='save_plan'){first=false;held=input;return;}
    post(input);
   };
   worker.addEventListener('message',(event:MessageEvent)=>{
    const data=event.data,request=trace.requests.find(r=>r.request_id===data.request_id);
    const isClock=typeof data.request_id==='string'&&data.request_id.startsWith('clock-')&&data.ok&&data.view;
    if(isClock&&rejected)trace.laterClocks++;
    if(request)trace.replies.push({request_id:data.request_id,ok:data.ok,code:data.code,kind:request.kind,intent:request.intent,run_id:data.view?.run_id,revision:data.view?.revision,receipt_kind:data.receipt?.kind,operation_id:data.receipt?.operation_id});
    if(request?.intent==='save_plan'&&!data.ok)rejected=true;
    if(held&&isClock&&data.view.run_id===held.envelope.run_id&&data.view.revision>held.envelope.expected_revision){
     const original=held;held=null;trace.released={request_id:original.request_id,operation_id:original.envelope.operation_id,expected_revision:original.envelope.expected_revision,tick_revision:data.view.revision,clock_request_id:data.request_id};post(original);
    }
   });
   return worker;
  }});
 });
 try{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B24-OUTCOME-01');
  await expect(page.getByLabel('时间方式')).toHaveValue('command');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();
  const purpose=page.getByLabel('准备目的',{exact:true});await purpose.fill('B25保留本次未获保存的准备内容');
  await page.getByRole('button',{name:'保存准备草案',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b25Diagnostic').replies.some((r:any)=>r.intent==='save_plan'&&!r.ok&&r.code==='STALE_REVISION'))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>{const t=Reflect.get(window,'__b25Diagnostic');return t.replies.some((r:any)=>r.kind==='view'&&r.ok)&&t.laterClocks>=2;})).toBe(true);
  const trace=await page.evaluate(()=>Reflect.get(window,'__b25Diagnostic'));
  expect(trace.requests.filter((r:any)=>r.intent==='save_plan')).toHaveLength(1);
  expect(trace.replies.filter((r:any)=>r.intent==='save_plan'&&r.ok)).toHaveLength(0);
  expect(trace.released.tick_revision).toBeGreaterThan(trace.released.expected_revision);
  expect(trace.requests.some((r:any)=>r.kind==='management_pause'||r.intent==='request_preparation')).toBe(false);
  await expect(page.getByTestId('intelligence-plan')).toContainText('草案尚未保存');
  await expect(purpose).toHaveValue('B25保留本次未获保存的准备内容');
  await expect(page.getByRole('alert')).toContainText('情况记录已更新，请重新核对预案后再下达。');
 }finally{
  const trace=await page.evaluate(()=>Reflect.get(window,'__b25Diagnostic')).catch(()=>null);
  await fs.writeFile(info.outputPath('b25-real-worker-stale-evidence.json'),JSON.stringify({trace,controlled_technical_probe:true,natural_walkthrough:false,synthetic_rejection:false,private_world_read:false},null,2),{flag:'wx'});
 }
});
