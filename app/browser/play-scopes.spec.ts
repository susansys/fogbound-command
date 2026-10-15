import {test,expect} from '@playwright/test';
test.use({viewport:{width:1366,height:768},deviceScaleFactor:1});
test.beforeEach(async({browser},info)=>{await info.attach('native-runtime',{body:JSON.stringify({browser:browser.version(),node:process.version,origin:process.env.FB01_URL,viewport:[1366,768],dpr:1,temp:process.env.TEMP,tmp:process.env.TMP}),contentType:'application/json'});});

test('PG01 six public scope kinds are readable through the registered scene and real Worker',async({page},info)=>{
  await page.goto('/');
  await expect(page.getByLabel('演练任务').locator('option[value="B21-CORRIDOR-01"]')).toHaveCount(1);
  await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');
  await page.getByLabel('时间方式').selectOption('research');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('heading',{name:'连续走廊'})).toBeVisible();
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-region-state','ready',{timeout:25000});
  await page.getByRole('button',{name:'范围 approximate',exact:true}).click();
  await expect(page.getByTestId('scope-detail')).toContainText('75.25, 151.50');
  await expect(page.getByTestId('scope-detail')).toContainText('误差 5 图上米');
  await page.getByRole('button',{name:'范围 area-with-hole',exact:true}).click();
  await expect(page.getByTestId('scope-detail')).toContainText('孔 1');
  await page.getByRole('button',{name:'范围 separate-regions',exact:true}).click();
  await expect(page.getByTestId('scope-detail')).toContainText('area-with-hole、detached-area');
  await page.getByRole('button',{name:'范围 pending-location',exact:true}).click();
  await expect(page.getByTestId('scope-detail')).toContainText('待定位');
  await expect(page.getByTestId('scope-detail')).not.toContainText('坐标');
  await expect(page.getByTestId('scope-detail')).toBeInViewport({ratio:0.5});
  await page.screenshot({path:info.outputPath('scopes-readable.png'),fullPage:true});
});

test('PG04 a validated clock-fault channel response is visible and locks unconfirmed controls',async({page})=>{
  // Owned external-channel fault injection; this does not claim a Dexie abort.
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;
    const workers:Worker[]=[];
    class OwnedWorker extends NativeWorker{constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes('/assets/worker-'))workers.push(this);}}
    window.Worker=OwnedWorker;
    Object.assign(window,{__b21OwnedClockFault:()=>{if(workers.length!==1)throw Error('Expected sole Game Worker');workers[0].dispatchEvent(new MessageEvent('message',{data:{request_id:'clock-fault',ok:false,code:'STORAGE_UNCONFIRMED'}}));}});
  });
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B21-CORRIDOR-01');
  await page.getByRole('button',{name:'开始演练',exact:true}).click();
  await expect(page.getByRole('heading',{name:'连续走廊'})).toBeVisible();
  await page.evaluate(()=>{const value=Reflect.get(window,'__b21OwnedClockFault');if(typeof value!=='function')throw Error('Owned channel seam unavailable');value();});
  await expect(page.getByRole('alert')).toContainText('尚未确认保存');
  await expect(page.getByRole('button',{name:'保存行动',exact:true})).toBeDisabled();
  await expect(page.locator('.clock')).toContainText('进度未确认');
});
