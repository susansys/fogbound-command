import {test,expect,chromium,type BrowserContext,type Page} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';

type ProcessIdentity={ProcessId:number;CreationDate:string;ExecutablePath:string;CommandLine:string};
function processes(ids:number[],includeCommand=false):ProcessIdentity[]{
  if(!ids.length)return [];
  if(ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw Error('Invalid owned browser process ID');
  const filter=ids.map(id=>'ProcessId='+id).join(' OR ');
  const output=execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new();Get-CimInstance Win32_Process -Filter '"+filter+"' | Select-Object ProcessId,CreationDate,ExecutablePath"+(includeCommand?",CommandLine":"")+" | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
  const value=output?JSON.parse(output):[];return Array.isArray(value)?value:[value];
}
async function observe(context:BrowserContext){
  await context.addInitScript(()=>{
    const Native=Worker;
    window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args);worker.addEventListener('message',(e:MessageEvent)=>{if(e.data.ok&&e.data.view)Reflect.set(window,'__b31NativeLatest',structuredClone(e.data.view));if(e.data.ok&&e.data.receipt?.kind==='save')Reflect.set(window,'__b31NativeSave',structuredClone(e.data));});return worker;}});
  });
}
const latest=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__b31NativeLatest'));


async function closeFully(context:BrowserContext,profile:string){
 const cdp=await context.browser()!.newBrowserCDPSession(),version=await cdp.send('Browser.getVersion'),info=await cdp.send('SystemInfo.getProcessInfo'),ids=info.processInfo.map(p=>p.id),before=processes(ids,true);expect(before.some(p=>p.CommandLine?.includes(profile))).toBe(true);await context.close();
 const remaining=()=>processes(ids).filter(after=>before.some(prior=>prior.ProcessId===after.ProcessId&&prior.CreationDate===after.CreationDate));await expect.poll(()=>remaining().length,{timeout:10000}).toBe(0);return {version,before,closed_at:new Date().toISOString(),same_identity_after_close:remaining()};
}

for(const browserKind of ['chrome','edge'] as const)test('B31 E15 '+browserKind+' restores the source variant before and after relation retraction',async({},info)=>{
 test.skip(process.platform!=='win32','Windows native evidence; Linux does not sign this carrier.');test.setTimeout(180000);
 const profileRoot=process.env.B31_NATIVE_PROFILE_ROOT;if(!profileRoot||!path.isAbsolute(profileRoot))throw Error('B31 native carrier requires its admitted absolute profile root');await fs.mkdir(profileRoot,{recursive:true});
 const executable=browserKind==='chrome'?process.env.FB01_BROWSER!:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',profile=path.join(profileRoot,randomUUID()),origin=process.env.FB01_URL!;await fs.mkdir(profile);
 const evidence:Record<string,unknown>={browserKind,executable,profile,origin,started:new Date().toISOString(),special_browser_args:[],mode:'command',profile_retained:true,nodes:[]};let context:BrowserContext|undefined,currentNode:Record<string,unknown>|undefined,beforeRevision:number|undefined;
 const open=async()=>{context=await chromium.launchPersistentContext(profile,{executablePath:executable,headless:false,viewport:{width:1366,height:768}});await observe(context);const page=context.pages()[0]??await context.newPage();page.setDefaultTimeout(10000);await page.goto(origin);await page.bringToFront();return page;};
 try{
  let page=await open();await page.getByLabel('演练任务').selectOption('B31-SOURCE-TIME-01');await expect(page.getByLabel('时间方式')).toHaveValue('command');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'返回与交付任务',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();await page.getByLabel('推进速度',{exact:true}).selectOption('4');await expect.poll(async()=>(await latest(page)).rate).toBe(4);await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');await expect.poll(async()=>(await latest(page)).sim_time,{timeout:35000}).toBeGreaterThanOrEqual(95000);await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  for(const phase of ['before-retraction','after-retraction']){
   const prior=await latest(page);expect(prior.paused).toBe(true);expect(prior.source_reading.deliveries).toHaveLength(phase==='before-retraction'?5:6);expect(prior.source_reading.scoped_independence).toMatchObject([{report_refs:[{id:'M1'},{id:'M3'}],count:2}]);if(phase==='before-retraction'){expect(prior.sim_time).toBeLessThan(115000);expect(prior.source_reading.groups).toHaveLength(1);}else expect(prior.source_reading.groups).toEqual([]);
   currentNode={phase,before_save:prior};await page.getByRole('button',{name:'保存行动',exact:true}).press('Enter');await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b31NativeSave')?.view?.revision)).toBeGreaterThan(prior.revision);const saved=await page.evaluate(()=>Reflect.get(window,'__b31NativeSave'));currentNode.saved=saved;if(phase==='before-retraction')beforeRevision=saved.view.revision;await page.screenshot({path:info.outputPath(browserKind+'-'+phase+'-saved.png'),fullPage:true});currentNode.closed=await closeFully(context!,profile);context=undefined;
   page=await open();await page.getByLabel('演练任务').selectOption('B31-SOURCE-TIME-01');await page.getByRole('button',{name:'接手这场演练',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();const restored=await latest(page);expect(restored).toMatchObject({run_id:saved.view.run_id,sim_time:saved.view.sim_time,paused:true,source_reading:saved.view.source_reading,actors:saved.view.actors,preparation:saved.view.preparation,processing:saved.view.processing,decision_records:saved.view.decision_records});currentNode.restored=restored;await page.waitForTimeout(500);expect((await latest(page)).sim_time).toBe(saved.view.sim_time);
   if(phase==='after-retraction'){
    await page.getByLabel('历史节点',{exact:true}).selectOption(String(beforeRevision));await page.getByRole('button',{name:'查看历史节点',exact:true}).press('Enter');await expect(page.locator('.clock')).toContainText('历史只读');const history=await latest(page);expect(history).toMatchObject({can_issue:false,source_reading:{groups:[{report_refs:[{id:'M1'},{id:'M2'}]}],scoped_independence:[{count:2}],relations:[{status:'confirmed'}]}});currentNode.pre_retraction_history=history;await page.getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();expect((await latest(page)).source_reading).toEqual(saved.view.source_reading);
   }
   await page.screenshot({path:info.outputPath(browserKind+'-'+phase+'-restored.png'),fullPage:true});await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');await expect.poll(async()=>(await latest(page)).sim_time,{timeout:20000}).toBeGreaterThanOrEqual(phase==='before-retraction'?115000:saved.view.sim_time+1000);await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();const resumed=await latest(page);expect(resumed.source_reading.deliveries).toHaveLength(6);expect(new Set(resumed.source_reading.deliveries.map((d:{ref:{id:string}})=>d.ref.id)).size).toBe(6);expect(resumed.source_reading).toMatchObject({groups:[],relations:[{status:'retracted'}],scoped_independence:[{count:2}],independence:{kind:'unknown'}});currentNode.resumed=resumed;(evidence.nodes as unknown[]).push(currentNode);currentNode=undefined;
  }
  evidence.final_close=await closeFully(context!,profile);context=undefined;evidence.passed=true;
 }catch(error){evidence.failure=String(error);if(currentNode)evidence.incomplete_node=currentNode;try{await context?.pages()[0]?.screenshot({path:info.outputPath(browserKind+'-failure.png'),fullPage:true});}catch{}throw error;}
 finally{if(context)await context.close();evidence.finished=new Date().toISOString();await fs.writeFile(info.outputPath(browserKind+'-native-evidence.json'),JSON.stringify(evidence,null,2)+'\n');}
});
