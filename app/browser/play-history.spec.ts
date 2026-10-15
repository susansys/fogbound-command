import {test,expect} from '@playwright/test';

test('PG15 saving an unissued draft explicitly distinguishes it from committed progress',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();await page.getByRole('button',{name:'新增折点',exact:true}).click();await page.getByLabel('折点 2 x',{exact:true}).fill('150');await page.getByRole('button',{name:'预览路线',exact:true}).click();await page.getByRole('button',{name:'保存行动',exact:true}).click();await expect(page.getByRole('status')).toContainText('未下达路线草案未保存');await expect(page.getByTestId('movement-status')).toContainText('可拟定移动任务');await expect(page.getByTestId('route-preview')).toContainText('100 图上米');
});

test('PG16 lost restart reply retries the original operation without creating a second child',async({page})=>{
  await page.addInitScript(()=>{
    const Native=window.Worker,requests:Array<{kind:string;request_id:string;operation_id?:string;run_id?:string}>=[];let dropped=false;
    class OwnedWorker extends Native{
      constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes('/assets/worker-')){
        const post=this.postMessage.bind(this);this.postMessage=(message:typeof requests[number])=>{requests.push(structuredClone(message));post(message);};
        this.addEventListener('message',event=>{const request=requests.find(r=>r.request_id===event.data.request_id);if(!dropped&&request?.kind==='restart'&&event.data.ok){dropped=true;event.stopImmediatePropagation();}});
      }}
    }
    window.Worker=OwnedWorker;Object.assign(window,{__b21RestartRequests:requests});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await page.getByRole('button',{name:'以相同条件重开',exact:true}).click();await page.getByRole('button',{name:'确认重新开始',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible({timeout:15000});await expect(page.getByRole('button',{name:'保留当前行动',exact:true})).toBeDisabled();await page.getByRole('button',{name:'确认重新开始',exact:true}).click();await expect(page.getByRole('button',{name:'上一场行动（只读）',exact:true})).toBeVisible();
  const requests=await page.evaluate(()=>Reflect.get(window,'__b21RestartRequests') as Array<{kind:string;operation_id?:string;run_id?:string}>),restarts=requests.filter(r=>r.kind==='restart');expect(restarts).toHaveLength(2);expect(restarts[1].operation_id).toBe(restarts[0].operation_id);expect(restarts[1].run_id).toBe(restarts[0].run_id);
  const stored=await page.evaluate(()=>new Promise<Array<{run_id:string;source_run:string|null}>>((resolve,reject)=>{const open=indexedDB.open('fogbound-map-b-game-1');open.onupgradeneeded=()=>{open.transaction!.abort();reject(Error('Expected owned DB'));};open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('runs','readonly'),request=tx.objectStore('runs').getAll();request.onsuccess=()=>{resolve(request.result);db.close();};};}));expect(stored).toHaveLength(2);expect(stored.filter(r=>r.source_run===restarts[0].run_id)).toHaveLength(1);
});

test('PG16 new run clears the unissued draft reason',async({page})=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  const draft=async()=>{await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();await page.getByRole('button',{name:'新增折点',exact:true}).click();await page.getByLabel('折点 2 x',{exact:true}).fill('150');await page.getByRole('button',{name:'预览路线',exact:true}).click();await page.getByRole('button',{name:'下达移动任务',exact:true}).click();};
  await draft();await page.getByLabel('理由（可选）').fill('上一场尚未下达的理由');await page.getByRole('button',{name:'以相同条件重开',exact:true}).click();await page.getByRole('button',{name:'确认重新开始',exact:true}).click();await expect(page.getByRole('button',{name:'拟定移动路线',exact:true})).toBeVisible();
  await draft();await expect(page.getByLabel('理由（可选）')).toHaveValue('');
});

test('PG16 real history before and after receipt returns current and starts a new run while keeping its parent readonly',async({page},info)=>{
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-region-state','ready',{timeout:25000});
  await page.getByRole('button',{name:'拟定移动路线',exact:true}).click();await page.getByRole('button',{name:'新增折点',exact:true}).click();await page.getByLabel('折点 2 x',{exact:true}).fill('150');await page.getByRole('button',{name:'预览路线',exact:true}).press('Enter');await page.getByRole('button',{name:'下达移动任务',exact:true}).click();await page.getByRole('button',{name:'确认并下达',exact:true}).press('Enter');
  await expect(page.getByTestId('movement-status')).toContainText('已签发');await page.getByLabel('推进到时刻（秒）').fill('40');await page.getByRole('button',{name:'推进到该时刻',exact:true}).click();await expect(page.getByTestId('movement-status')).toContainText('抵达已知');
  for(const [to,x] of [['31.499','50.00, 150.00'],['31.5','150.00, 150.00']]){
    await page.getByRole('button',{name:'行动复盘',exact:true}).click();await page.getByLabel('回看时刻（秒）').fill(to);await page.getByRole('button',{name:'查看当时情况',exact:true}).click();await expect(page.locator('.clock')).toContainText('历史只读');await expect(page.getByTestId('scope-detail')).toContainText(x);await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeDisabled();await page.getByRole('main').getByRole('button',{name:'返回当前行动',exact:true}).click();await expect(page.getByTestId('movement-status')).toContainText('抵达已知');
  }
  await page.getByRole('button',{name:'以相同条件重开',exact:true}).click();await expect(page.getByRole('dialog',{name:'确认重开行动'})).toContainText('上一场保留为只读');await page.getByRole('button',{name:'确认重新开始',exact:true}).click();
  await expect(page.getByTestId('movement-status')).toContainText('可拟定移动任务');await expect(page.getByTestId('scope-detail')).toContainText('50.00, 150.00');await expect(page.locator('.clock')).toContainText('00:00');
  await page.getByRole('button',{name:'上一场行动（只读）',exact:true}).click();await expect(page.locator('.clock')).toContainText('历史只读');await expect(page.getByTestId('scope-detail')).toContainText('150.00, 150.00');await expect(page.getByRole('button',{name:'拟定移动路线',exact:true})).toBeDisabled();
  await page.screenshot({path:info.outputPath('readonly-parent.png'),fullPage:true});await page.getByRole('main').getByRole('button',{name:'返回当前行动',exact:true}).click();await expect(page.getByTestId('scope-detail')).toContainText('50.00, 150.00');
});
