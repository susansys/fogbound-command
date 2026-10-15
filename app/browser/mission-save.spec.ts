import {test,expect,type Page} from '@playwright/test';
async function begin(page:Page,mode:'command'|'research'='research'){
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption(mode);await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('任务目的',{exact:true}).fill('核对两处联络点');await page.getByLabel('期望结果',{exact:true}).fill('总部收到两阶段合法抵达凭证');
}
async function observer(page:Page,fault:'abort'|'clock_abort'|'clock_drop_restore'|'delay_pause'|'delay_two_pauses'|'drop_save'|'hold_preview'|'hold_save'|'observe'){
  await page.addInitScript(fault=>{
    const Native=window.Worker,requests:Array<Record<string,unknown>>=[],responses:unknown[]=[],errors:string[]=[],control={held:false,release:()=>{}};
    let once=false,pauseDelays=0;
    class OwnedWorker extends Native{
      constructor(url:string|URL,options?:WorkerOptions){
        const actual=String(url),owned=actual.includes('/assets/worker-');
        const predicate=['clock_abort','clock_drop_restore'].includes(fault)?"args[0]?.plans?.length===1&&args[0]?.inputs?.at(-1)?.envelope?.intent?.kind==='tick'":"args[0]?.inputs?.at(-1)?.envelope?.intent?.kind==='save_plan'";
        // Static import completes the real Worker's handler registration before
        // queued messages can run; patch the external DB boundary before any input.
        const prefix=`import ${JSON.stringify(actual)};const original=IDBObjectStore.prototype.put;let fired=false;IDBObjectStore.prototype.put=function(...args){const request=original.apply(this,args);if(!fired&&this.transaction.db.name==='fogbound-map-b-game-1'&&this.name==='runs'&&args[0]?.schema===8&&(${predicate})){fired=true;request.addEventListener('success',()=>this.transaction.abort(),{once:true});}return request;};`;
        super(owned&&['abort','clock_abort','clock_drop_restore'].includes(fault)?URL.createObjectURL(new Blob([prefix],{type:'text/javascript'})):url,options);
        if(owned){const post=this.postMessage.bind(this);this.postMessage=(message:Record<string,unknown>)=>{
          requests.push(structuredClone(message));
          const envelope=message.envelope as {intent?:{kind:string}}|undefined;
          if(['delay_pause','delay_two_pauses'].includes(fault)&&pauseDelays<(fault==='delay_two_pauses'?2:1)&&message.kind==='operate_mission'&&envelope?.intent?.kind==='pause'){pauseDelays++;setTimeout(()=>post(message),600);}
          else post(message);
        };
          Object.assign(window,{__b22OwnedWorker:this});
          this.addEventListener('error',event=>errors.push(event.message));
          this.addEventListener('messageerror',()=>errors.push('messageerror'));
          this.addEventListener('message',event=>{
            const request=requests.find(r=>r.request_id===event.data.request_id);responses.push(structuredClone(event.data));
            const target=fault==='hold_preview'?'preview_mission':fault==='clock_drop_restore'?'takeover':'save_plan';
            if(!once&&request?.kind===target&&event.data.ok&&!['abort','clock_abort','delay_pause','delay_two_pauses','observe'].includes(fault)){
              once=true;event.stopImmediatePropagation();
              if(!['drop_save','clock_drop_restore'].includes(fault)){control.held=true;const data=structuredClone(event.data);control.release=()=>{control.held=false;this.dispatchEvent(new MessageEvent('message',{data}));};}
            }
          });
        }
      }
    }
    window.Worker=OwnedWorker;Object.assign(window,{__b22Observed:{requests,responses,errors},__b22Held:control});
  },fault);
}
test.afterEach(async({page},info)=>{
  if(info.status!==info.expectedStatus&&!page.isClosed()){
    const trace=await page.evaluate(()=>{const value=Reflect.get(window,'__b22Observed');return value?{requests:value.requests.slice(-20),responses:value.responses.slice(-20),errors:value.errors}:null;});
    if(trace)await info.attach('actual-worker-trace',{body:JSON.stringify(trace,null,2),contentType:'application/json'});
  }
});
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

test('B22 PG03 self dependency is publicly explained and keeps the editable draft',async({page})=>{
  await begin(page);
  await page.getByLabel('任务备注（仅供记录）').fill('自环拒绝后保留的备注');
  await page.getByLabel('阶段 1 前置阶段').selectOption('P1');
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');
  await expect(page.getByRole('alert')).toContainText('阶段不能依赖自身');
  await expect(page.getByTestId('mission-preview')).toHaveCount(0);
  await expect(page.getByLabel('阶段 1 前置阶段')).toHaveValue('P1');
  await expect(page.getByLabel('任务备注（仅供记录）')).toHaveValue('自环拒绝后保留的备注');
  await page.getByLabel('阶段 1 前置阶段').selectOption('');
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');
  await expect(page.getByTestId('mission-preview')).toBeVisible();
});

test('B22 real Worker publishes only the safe self dependency explanation field',async({page})=>{
  await observer(page,'observe');await begin(page);
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();
  const response=await page.evaluate(async()=>{
    const trace=Reflect.get(window,'__b22Observed') as {requests:Array<{kind:string;draft?:{run_id:string;phases:Array<{dependencies:unknown[]}>}}>};
    const input=structuredClone(trace.requests.find(r=>r.kind==='preview_mission')!);
    input.draft!.phases[0].dependencies=[{run_id:input.draft!.run_id,kind:'phase',id:'P1',version:1}];
    const request={...input,request_id:crypto.randomUUID()},worker=Reflect.get(window,'__b22OwnedWorker') as Worker;
    return await new Promise(resolve=>{
      const timeout=setTimeout(()=>{worker.removeEventListener('message',receive);resolve({timeout:true});},5000);
      function receive(event:MessageEvent){if(event.data.request_id===request.request_id){clearTimeout(timeout);worker.removeEventListener('message',receive);resolve(event.data);}}
      worker.addEventListener('message',receive);worker.postMessage(request);
    });
  });
  expect(response).toMatchObject({ok:false,code:'INVALID_REQUEST',field_path:'mission_draft.phases.self_dependency'});
  expect(Object.keys(response as object).sort()).toEqual(['code','field_path','ok','request_id']);
});

test('B22 clock transaction failure blocks controls until explicit recovery without losing input',async({page})=>{
  await observer(page,'clock_abort');await begin(page,'command');
  await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();
  await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1');
  await page.getByLabel('任务备注（仅供记录）').fill('时钟写入失败仍保留的新编辑');
  await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');
  await expect(page.getByRole('alert')).toContainText('尚未确认保存');
  await expect(page.locator('.clock')).toContainText('进度未确认');
  await expect(page.getByRole('button',{name:'暂停行动',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'保存草案',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'恢复最近记录并重新核对',exact:true}).press('Enter');
  await expect(page.locator('.clock')).toContainText('已暂停');
  await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  await expect(page.getByLabel('任务备注（仅供记录）')).toHaveValue('时钟写入失败仍保留的新编辑');
  const before=await page.locator('.clock strong').innerText();await page.waitForTimeout(1100);await expect(page.locator('.clock strong')).toHaveText(before);
  await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');await expect(page.locator('.clock strong')).not.toHaveText(before);
  const faults=await page.evaluate(()=>Reflect.get(window,'__b22Observed').responses.filter((x:{request_id:string;ok:boolean})=>x.request_id==='clock-fault'&&!x.ok).length);
  expect(faults).toBe(1);
});

for(const resolution of ['query','retry'] as const){
test(`B22 lost committed restore reply ${resolution} preserves its original identity and one committed restore`,async({page})=>{
  test.setTimeout(60000);await observer(page,'clock_drop_restore');await begin(page,'command');
  await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1');
  await page.getByLabel('任务备注（仅供记录）').fill('恢复回复丢失仍保留的编辑');await page.getByRole('button',{name:'继续行动',exact:true}).press('Enter');await expect(page.locator('.clock')).toContainText('进度未确认');
  await page.getByRole('button',{name:'恢复最近记录并重新核对',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'查询恢复结果',exact:true})).toBeEnabled({timeout:15000});
  await page.getByRole('button',{name:resolution==='query'?'查询恢复结果':'重试原恢复操作',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();await expect(page.locator('.clock')).toContainText('已暂停');
  await expect(page.getByLabel('任务备注（仅供记录）')).toHaveValue('恢复回复丢失仍保留的编辑');
  const proof=await page.evaluate(()=>{const trace=Reflect.get(window,'__b22Observed') as {requests:Array<{kind:string;operation_id?:string}>;responses:Array<{receipt?:{kind:string;operation_id:string;revision:number;fingerprint:string}}>};return {restore:trace.requests.filter(r=>r.kind==='takeover'),query:trace.requests.filter(r=>r.kind==='receipt'),receipts:trace.responses.filter(r=>r.receipt?.kind==='restore').map(r=>r.receipt)};});
  expect(proof.restore).toHaveLength(resolution==='query'?1:2);expect(proof.query).toHaveLength(resolution==='query'?1:0);
  expect(new Set(proof.restore.map(r=>r.operation_id)).size).toBe(1);
  if(resolution==='query')expect(proof.query[0].operation_id).toBe(proof.restore[0].operation_id);
  expect(proof.receipts.length).toBeGreaterThanOrEqual(2);expect(new Set(proof.receipts.map(r=>r!.revision)).size).toBe(1);expect(new Set(proof.receipts.map(r=>r!.fingerprint)).size).toBe(1);
});
}

for(const fault of ['delay_pause','delay_two_pauses'] as const){
test(`B22 manual pause rechecks definite stale rejections with ${fault}`,async({page})=>{
  await observer(page,fault);await begin(page,'command');
  await page.getByRole('button',{name:'暂停行动',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'继续行动',exact:true})).toBeEnabled();
  await expect(page.locator('.clock')).toContainText('已暂停');
  const before=await page.locator('.clock strong').innerText();await page.waitForTimeout(800);await expect(page.locator('.clock strong')).toHaveText(before);
  const proof=await page.evaluate(()=>{
    const trace=Reflect.get(window,'__b22Observed') as {requests:Array<{request_id:string;kind:string;envelope?:{operation_id:string;intent:{kind:string}}}>;responses:Array<{request_id:string;ok:boolean;code?:string;receipt?:{kind:string;result:string}}>} ;
    const requests=trace.requests.filter(r=>r.kind==='operate_mission'&&r.envelope?.intent.kind==='pause');
    return {ids:requests.map(r=>r.envelope!.operation_id),outcomes:requests.map(r=>trace.responses.find(response=>response.request_id===r.request_id))};
  });
  expect(proof.ids.length).toBeGreaterThanOrEqual(fault==='delay_two_pauses'?3:2);expect(proof.ids.length).toBeLessThanOrEqual(3);expect(new Set(proof.ids).size).toBe(proof.ids.length);
  for(const rejected of proof.outcomes.slice(0,-1))expect(rejected).toMatchObject({ok:false,code:'STALE_REVISION'});
  expect(proof.outcomes.at(-1)).toMatchObject({ok:true,receipt:{kind:'pause',result:'committed'}});
  expect(proof.outcomes.filter(r=>r?.ok)).toHaveLength(1);
});
}
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
