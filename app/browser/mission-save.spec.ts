import {test,expect,type Page} from '@playwright/test';
async function begin(page:Page){
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('任务目的',{exact:true}).fill('核对两处联络点');await page.getByLabel('期望结果',{exact:true}).fill('总部收到两阶段合法抵达凭证');
}
async function observer(page:Page,fault:'abort'|'drop_save'|'hold_preview'|'hold_save'|'observe'){
  await page.addInitScript(fault=>{
    const Native=window.Worker,requests:Array<Record<string,unknown>>=[],responses:unknown[]=[],control={held:false,release:()=>{}};
    let once=false;
    class OwnedWorker extends Native{
      constructor(url:string|URL,options?:WorkerOptions){
        const actual=String(url),owned=actual.includes('/assets/worker-');
        const prefix=`const original=IDBObjectStore.prototype.put;let fired=false;IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);if(!fired&&this.transaction.db.name==='fogbound-map-b-game-1'&&this.name==='runs'&&args[0]?.schema===8&&args[0]?.inputs?.at(-1)?.envelope?.intent?.kind==='save_plan'){fired=true;request.addEventListener('success',()=>this.transaction.abort(),{once:true});}return request;};await import(${JSON.stringify(actual)});`;
        super(owned&&fault==='abort'?URL.createObjectURL(new Blob([prefix],{type:'text/javascript'})):url,options);
        if(owned){const post=this.postMessage.bind(this);this.postMessage=(message:Record<string,unknown>)=>{requests.push(structuredClone(message));post(message);};
          this.addEventListener('message',event=>{
            const request=requests.find(r=>r.request_id===event.data.request_id);responses.push(structuredClone(event.data));
            const target=fault==='hold_preview'?'preview_mission':'save_plan';
            if(!once&&request?.kind===target&&event.data.ok&&fault!=='abort'&&fault!=='observe'){
              once=true;event.stopImmediatePropagation();
              if(fault!=='drop_save'){control.held=true;const data=structuredClone(event.data);control.release=()=>{control.held=false;this.dispatchEvent(new MessageEvent('message',{data}));};}
            }
          });
        }
      }
    }
    window.Worker=OwnedWorker;Object.assign(window,{__b22Observed:{requests,responses},__b22Held:control});
  },fault);
}
test('B22 command mode saving rechecks a readable preview while the clock continues',async({page})=>{
  await observer(page,'observe');await page.goto('/');await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption('command');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByRole('button',{name:'暂停行动',exact:true}).click();await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  await page.getByLabel('任务目的',{exact:true}).fill('阅读后仍可保存');await page.getByLabel('期望结果',{exact:true}).fill('保存不暂停也不执行');
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();
  const before=await page.evaluate(()=>{const trace=Reflect.get(window,'__b22Observed') as {responses:Array<{view?:{revision:number;sim_time:number}}>};return trace.responses.filter(x=>x.view).at(-1)!.view!;});
  await page.getByRole('button',{name:'继续行动',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>{const trace=Reflect.get(window,'__b22Observed') as {responses:Array<{view?:{sim_time:number}}>};return trace.responses.filter(x=>x.view).at(-1)?.view?.sim_time??0;})).toBeGreaterThan(before.sim_time+500);
  await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');
  await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1 · 未下达');
  await expect(page.getByRole('button',{name:'暂停行动',exact:true})).toBeEnabled();await expect(page.getByTestId('mission-orders')).toContainText('尚未下达');
});
test('B22 PG09 abort preserves input through actual transaction failure and explicit recovery',async({page})=>{
  test.setTimeout(60000);await observer(page,'abort');await begin(page);
  await page.getByLabel('任务备注（仅供记录）').fill('中断后保留的输入');await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');
  await expect(page.getByRole('alert')).toContainText('尚未确认保存');await page.getByRole('button',{name:'查询保存结果',exact:true}).press('Enter');
  await expect(page.getByRole('status')).toContainText('尚未查到已提交结果');
  await page.getByRole('button',{name:'恢复最近记录并重新核对',exact:true}).press('Enter');
  await expect(page.getByRole('status')).toContainText('情况已更新；输入保留');
  await expect(page.getByRole('button',{name:'预览任务',exact:true})).toBeEnabled();
  await expect(page.getByLabel('任务备注（仅供记录）')).toHaveValue('中断后保留的输入');
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');
  await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1 · 未下达');
  const proof=await page.evaluate(()=>{const value=Reflect.get(window,'__b22Observed') as {requests:Array<{kind:string;envelope?:{operation_id:string}}>;responses:Array<{ok:boolean;code?:string}>};return {ids:value.requests.filter(x=>x.kind==='save_plan').map(x=>x.envelope?.operation_id),stale:value.responses.some(x=>!x.ok&&x.code==='STALE_REVISION')};});
  expect(proof.ids).toHaveLength(3);expect(proof.ids[1]).toBe(proof.ids[0]);expect(proof.ids[2]).not.toBe(proof.ids[0]);expect(proof.stale).toBe(true);
});
test('B22 PG09 lost committed reply is resolved with the original operation and one plan version',async({page})=>{
  test.setTimeout(60000);await observer(page,'drop_save');await begin(page);await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'查询保存结果',exact:true})).toBeVisible({timeout:15000});await page.getByRole('button',{name:'查询保存结果',exact:true}).press('Enter');
  await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1 · 未下达');
  const operations=await page.evaluate(()=>{const value=Reflect.get(window,'__b22Observed') as {requests:Array<{kind:string;envelope?:{operation_id:string}}>;responses:unknown[]};return value.requests.filter(x=>x.kind==='save_plan').map(x=>x.envelope?.operation_id);});expect(operations).toHaveLength(1);
});
for(const fault of ['hold_preview','hold_save'] as const){
  test(`B22 PG08 ${fault} cannot overwrite newer text or mark it saved`,async({page})=>{
    await observer(page,fault);await begin(page);
    await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');
    if(fault==='hold_save'){await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');}
    await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b22Held').held)).toBe(true);
    await page.getByLabel('任务备注（仅供记录）').fill('较新的未保存编辑');
    await page.evaluate(()=>Reflect.get(window,'__b22Held').release());
    await expect(page.getByRole('button',{name:'预览任务',exact:true})).toBeEnabled();
    await expect(page.getByLabel('任务备注（仅供记录）')).toHaveValue('较新的未保存编辑');
    await expect(page.getByTestId('mission-preview')).toHaveCount(0);
    if(fault==='hold_save'){await expect(page.getByTestId('mission-save-state')).toContainText('有未保存编辑');await expect(page.getByRole('status')).toContainText('当前输入仍有未保存改动');}
    await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();
  });
}
test('B22 T01 history shows its saved version instead of the current form',async({page})=>{
  await begin(page);
  for(const note of ['版本一原文','版本二原文']){
    await page.getByLabel('任务备注（仅供记录）').fill(note);await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');await expect(page.getByRole('status')).toContainText('任务草案已保存');
  }
  await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 2');
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByLabel('历史节点').selectOption('2');await page.getByRole('button',{name:'查看历史节点',exact:true}).press('Enter');await expect(page.locator('.clock')).toContainText('历史只读');
  await page.getByRole('button',{name:'任务规划',exact:true}).click();await expect(page.getByLabel('任务备注（仅供记录）')).toHaveValue('版本一原文');await expect(page.getByRole('button',{name:'保存草案',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');await page.getByRole('button',{name:'任务规划',exact:true}).click();await expect(page.getByLabel('任务备注（仅供记录）')).toHaveValue('版本二原文');
});
for(const [width,height] of [[1366,768],[1920,1080]]){
  test(`B22 T01 keyboard draft preview and save at ${width}`,async({page},info)=>{
    await page.setViewportSize({width,height});
    await page.goto('/');
    await page.getByLabel('演练任务').selectOption('B22-MISSION-01');
    await page.getByLabel('时间方式').selectOption('research');
    await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
    await expect(page.getByRole('heading',{name:'结构化任务',exact:true})).toBeVisible();
    await page.getByLabel('任务目的',{exact:true}).fill('核对两处联络点');
    await page.getByLabel('期望结果',{exact:true}).fill('总部收到两阶段合法抵达凭证');
    await page.getByLabel('任务备注（仅供记录）',{exact:true}).fill('自动维修／尽快执行');
    await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');
    await expect(page.getByTestId('mission-preview')).toContainText('29.5 秒');
    await expect(page.getByTestId('mission-preview')).toContainText('假设前阶段已确认');
    await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');
    await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1 · 未下达');
    await expect(page.getByLabel('任务备注（仅供记录）',{exact:true})).toHaveValue('自动维修／尽快执行');
    await expect(page.getByTestId('mission-resources')).toContainText('移动能量 20');
    await expect(page.getByTestId('mission-orders')).toContainText('尚未下达');
    await expect(page.getByRole('button',{name:'保存草案',exact:true})).toBeInViewport();
    await page.screenshot({path:info.outputPath('mission-draft.png'),fullPage:true});
    const focused:string[]=[];
    for(let i=0;i<80;i++){await page.keyboard.press('Tab');focused.push(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')??document.activeElement?.textContent??''));}
    for(const label of ['任务目的','期望结果','阶段 2 前置阶段','路线点 2 y','保存草案'])expect(focused.some(x=>x===label)).toBe(true);
  });
}
