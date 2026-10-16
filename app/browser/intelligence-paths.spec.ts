import {test,expect,type Page} from '@playwright/test';

async function publicView(page:Page){return page.evaluate(()=>Reflect.get(window,'__b23T04PublicView'));}
async function commit(page:Page,name:string){const before=await publicView(page);await page.getByRole('button',{name,exact:true}).press('Enter');await expect.poll(async()=>(await publicView(page))?.revision??0).toBeGreaterThan(before.revision);await expect(page.getByRole('alert')).toHaveCount(0);}
async function advance(page:Page,to:number){await page.getByLabel('推进到时刻（秒）').fill(String(to/1000));await commit(page,'推进到该时刻');expect((await publicView(page)).sim_time).toBe(to);}
async function prepare(page:Page){await commit(page,'保存准备草案');await commit(page,'提交准备申请');}
async function verify(page:Page){const source=page.getByTestId('intelligence-source-R3');await source.getByRole('button',{name:'展开原文及递交',exact:true}).press('Enter');await expect(source).toContainText('来源时点不详');const before=await publicView(page);await source.getByRole('button',{name:'请求核实这份原文',exact:true}).press('Enter');await expect.poll(async()=>(await publicView(page)).revision).toBeGreaterThan(before.revision);}

for(const path of ['preparation-first','verification-first'])test('B23 E35 real keyboard/Worker '+path+' states the received milestone and preserves custody',async({page})=>{
  await page.addInitScript(()=>{const Native=Worker;window.Worker=new Proxy(Native,{construct(Target,args){const worker=Reflect.construct(Target,args);worker.addEventListener('message',(event:MessageEvent)=>{if(event.data.ok&&event.data.view)Reflect.set(window,'__b23T04PublicView',event.data.view);});return worker;}});});
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B23-INTELLIGENCE-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'情报与协作任务',exact:true})).toBeVisible();
  if(path==='preparation-first'){
    await prepare(page);await commit(page,'下达R前往A');await advance(page,32000);await commit(page,'下达A处记录');await advance(page,79000);await advance(page,80000);await commit(page,'下达R前往B');await advance(page,86000);await verify(page);await advance(page,146000);await commit(page,'下达W维修B');await advance(page,166000);await advance(page,213000);await advance(page,214000);await commit(page,'下达B处记录');await advance(page,260000);
  }else{
    await advance(page,86000);await verify(page);await advance(page,107000);await commit(page,'下达R前往A');await commit(page,'保存准备草案');await advance(page,108000);await commit(page,'提交准备申请');await advance(page,139000);await commit(page,'下达A处记录');await advance(page,169000);await commit(page,'下达W维修B');await advance(page,187000);await commit(page,'下达R前往B');await advance(page,236000);await advance(page,237000);await commit(page,'下达B处记录');await advance(page,283000);
  }
  await expect(page.getByTestId('intelligence-artifacts')).not.toContainText('B · 回报称现场已生成');
  await advance(page,path==='preparation-first'?261000:284000);await expect(page.getByTestId('intelligence-artifacts')).toContainText('B · 回报称现场已生成');
  const view=await publicView(page);expect(view).toMatchObject({finished:false,processing:{energy_confirmed:12,energy_reserved:0},actors:[{equipment_energy:12,durability:94,packs:0,link:{energy:8,durability:92}},{equipment_energy:18,durability:95,packs:0}]});expect(view.artifact_reports).toHaveLength(2);
  await expect(page.getByRole('status')).toContainText('A、B两处现场成果回报已收到');await expect(page.getByTestId('intelligence-artifacts')).toContainText('尚未交接或终局核验');
});
