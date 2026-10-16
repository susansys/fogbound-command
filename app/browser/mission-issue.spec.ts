import {test,expect,type Page} from '@playwright/test';
async function begin(page:Page){
  await page.goto('/');await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('任务目的',{exact:true}).fill('按既有预授权核对当前阶段');await page.getByLabel('期望结果',{exact:true}).fill('核对完成后再明确下达');
}

test('B22 an actual hard refusal remains a clear refusal rather than an unknown submission',async({page})=>{
  await observeIssue(page);await begin(page);await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1');
  await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByTestId('mission-readiness')).toContainText('时间窗不满足');
  await page.getByRole('button',{name:'核对当前阶段',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'确认下达 P1',exact:true})).toBeEnabled();await page.getByRole('button',{name:'确认下达 P1',exact:true}).press('Enter');
  await expect(page.getByRole('alert')).toContainText('已知硬条件、资源或时间窗不满足');await expect(page.getByRole('button',{name:'查询下达结果',exact:true})).toHaveCount(0);
  await expect(page.getByTestId('mission-orders')).toContainText('尚未下达');await expect(page.getByTestId('mission-resources')).toContainText('总部能量 16');
  const trace=await page.evaluate(()=>Reflect.get(window,'__b22IssueTrace') as {responses:Array<{ok:boolean;code?:string}>});expect(trace.responses.some(r=>!r.ok&&r.code==='CONSTRAINT_DENIED')).toBe(true);
});

test('B22 current issue readiness updates independently of an older readable preview',async({page})=>{
  await begin(page);await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1');
  await expect(page.getByTestId('mission-readiness')).toContainText('可直接下达');
  await page.getByLabel('推进到时刻（秒）').fill('1');await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');
  await expect(page.getByTestId('mission-readiness')).toContainText('当前条件不允许');
  await expect(page.getByTestId('mission-readiness')).toContainText('时间窗不满足');
  await expect(page.getByTestId('mission-preview')).toBeVisible();await expect(page.getByTestId('mission-orders')).toContainText('尚未下达');
});

async function observeIssue(page:Page,drop=false){
  await page.addInitScript(drop=>{
    const requests:unknown[]=[],responses:unknown[]=[],NativeWorker=window.Worker;let dropped=false;
    class ObservedWorker extends NativeWorker{
      constructor(url:string|URL,options?:WorkerOptions){
        super(url,options);Reflect.set(window,'__b22IssueWorker',this);
        this.addEventListener('message',event=>{
          responses.push(structuredClone(event.data));
          if(drop&&!dropped&&event.data?.ok&&event.data?.receipt?.kind==='issue_mission'){
            dropped=true;event.stopImmediatePropagation();
          }
        });
      }
      override postMessage(message:unknown){requests.push(structuredClone(message));super.postMessage(message);}
    }
    window.Worker=ObservedWorker;Reflect.set(window,'__b22IssueTrace',{requests,responses});
  },drop);
}
test.afterEach(async({page},info)=>{
  if(info.status!==info.expectedStatus&&!page.isClosed()){
    const trace=await page.evaluate(()=>Reflect.get(window,'__b22IssueTrace'));
    if(trace)await info.attach('actual-issue-worker-trace',{body:JSON.stringify(trace,null,2),contentType:'application/json'});
  }
});

for(const mode of ['query','retry'] as const)test(`B22 a lost actual issue receipt uses the original operation for ${mode} without a second message`,async({page})=>{
  await observeIssue(page,true);await begin(page);
  await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1');
  await page.getByRole('button',{name:'核对当前阶段',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'确认下达 P1',exact:true})).toBeEnabled();await page.getByRole('button',{name:'确认下达 P1',exact:true}).press('Enter');
  await expect.poll(()=>page.evaluate(()=>{const trace=Reflect.get(window,'__b22IssueTrace') as {requests:Array<{kind:string}>};return trace.requests.filter(r=>r.kind==='issue_mission').length;})).toBe(1);
  await page.getByLabel('任务备注（仅供记录）').fill('回执未知时仍保留的新编辑');
  const action=mode==='query'?'查询下达结果':'重试原操作';
  await expect(page.getByRole('button',{name:action,exact:true})).toBeEnabled({timeout:15000});await page.getByRole('button',{name:action,exact:true}).press('Enter');
  await expect(page.getByTestId('mission-orders')).toContainText('已发送 1 条指令');await expect(page.getByTestId('mission-resources')).toContainText('总部能量 15');
  await expect(page.getByLabel('任务备注（仅供记录）')).toHaveValue('回执未知时仍保留的新编辑');await expect(page.getByTestId('mission-save-state')).toContainText('有未保存编辑');
  const trace=await page.evaluate(()=>Reflect.get(window,'__b22IssueTrace') as {requests:Array<{kind:string;operation_id?:string;envelope?:{operation_id:string}}>;responses:Array<{receipt?:{kind:string;operation_id:string}}>});
  const issued=trace.requests.filter(r=>r.kind==='issue_mission');expect(issued).toHaveLength(mode==='retry'?2:1);
  expect(new Set(issued.map(r=>r.envelope!.operation_id)).size).toBe(1);
  if(mode==='query')expect(trace.requests.filter(r=>r.kind==='receipt').at(-1)?.operation_id).toBe(issued[0].envelope!.operation_id);
});

test('B22 saved draft requires a fresh explicit phase confirmation before one outbound order',async({page})=>{
  await begin(page);await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await expect(page.getByRole('button',{name:'保存草案',exact:true})).toBeEnabled();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');
  await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 1 · 未下达');
  await page.getByRole('button',{name:'核对当前阶段',exact:true}).press('Enter');
  const confirmation=page.getByRole('region',{name:'当前阶段下达核对'});
  await expect(confirmation).toContainText('P1');await expect(confirmation).toContainText('总部依据齐备仍需现场接令复核');
  await expect(page.getByTestId('mission-orders')).toContainText('尚未下达');
  await page.getByRole('button',{name:'确认下达 P1',exact:true}).press('Enter');
  await expect(page.getByTestId('mission-save-state')).toContainText('已下达冻结版本 1');
  await expect(page.getByTestId('mission-orders')).toContainText('已发送 1 条指令');
  await expect(page.getByTestId('mission-resources')).toContainText('移动能量 20 · 联络能量 16 · 总部能量 15');
  await expect(page.getByTestId('issued-plan-line')).toHaveCount(1);
});
test('B22 T02 authority preview states the existing staff grant without creating an approval',async({page})=>{
  await begin(page);await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');
  await expect(page.getByTestId('mission-preview')).toContainText('P1 · 既有参谋预授权已覆盖');
  await expect(page.getByTestId('mission-preview')).toContainText('核对不会产生新的批准记录');
  await expect(page.getByTestId('mission-save-state')).toContainText('尚未保存 · 未下达');
  await expect(page.getByTestId('mission-resources')).toContainText('移动能量 20 · 联络能量 16 · 总部能量 16');
});
test('B22 HQ gate preview identifies the legal proof separately from the grant',async({page})=>{
  await begin(page);await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');
  await expect(page.getByTestId('mission-preview')).toContainText('P1 · 总部进入门槛：满足');
  await expect(page.getByTestId('mission-preview')).toContainText('能力登记凭证');
  await expect(page.getByTestId('mission-preview')).toContainText('下达时仍会重核');
  await expect(page.getByTestId('mission-save-state')).toContainText('尚未保存 · 未下达');
});
