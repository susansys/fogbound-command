import {test,expect,type Page} from '@playwright/test';
import type {MissionPlayerView} from '../src/mission-contracts';

async function observe(page:Page,fault:'none'|'hold_append'|'drop_append'|'abort_append'|'drop_restart'='none'){
  await page.addInitScript(fault=>{
    const Native=window.Worker,views:unknown[]=[],requests:Array<Record<string,unknown>>=[],responses:unknown[]=[],control={held:false,release:()=>{}};let once=false;
    window.Worker=class extends Native{
      constructor(url:string|URL,options?:WorkerOptions){
        const owned=String(url).includes('/assets/worker-');
        const prefix=`import ${JSON.stringify(String(url))};const put=IDBObjectStore.prototype.put;let fired=false;IDBObjectStore.prototype.put=function(...args){const request=put.apply(this,args);if(!fired&&this.transaction.db.name==='fogbound-map-b-game-1'&&this.name==='runs'&&args[0]?.schema===8&&args[0]?.inputs?.at(-1)?.envelope?.intent?.kind==='append_explanation'){fired=true;request.addEventListener('success',()=>this.transaction.abort(),{once:true});}return request;};`;
        super(owned&&fault==='abort_append'?URL.createObjectURL(new Blob([prefix],{type:'text/javascript'})):url,options);
        if(owned){Reflect.set(window,'__b22RecordWorker',this);const post=this.postMessage.bind(this);this.postMessage=(request:Record<string,unknown>)=>{requests.push(structuredClone(request));post(request);};
          this.addEventListener('message',event=>{responses.push(structuredClone(event.data));if(event.data?.ok&&event.data.view?.scenario_kind==='play_mission')views.push(structuredClone(event.data.view));
            if(!once&&['hold_append','drop_append','drop_restart'].includes(fault)&&event.data.ok&&requests.find(r=>r.request_id===event.data.request_id)?.kind===(fault==='drop_restart'?'restart':'append_explanation')){
              once=true;event.stopImmediatePropagation();if(fault==='hold_append'){control.held=true;const data=structuredClone(event.data);control.release=()=>{control.held=false;this.dispatchEvent(new MessageEvent('message',{data}));};}
            }
          });
        }
      }
    };
    Object.assign(window,{__b22RecordViews:views,__b22RecordRequests:requests,__b22RecordResponses:responses,__b22RecordHeld:control});
  },fault);
}
async function current(page:Page){return page.evaluate(()=>{const views=Reflect.get(window,'__b22RecordViews') as MissionPlayerView[];return views.at(-1)!;});}
async function begin(page:Page,fault:Parameters<typeof observe>[1]='none'){
  await observe(page,fault);await page.goto('/');await page.getByLabel('演练任务').selectOption('B22-MISSION-01');await page.getByLabel('时间方式').selectOption('research');await page.getByRole('button',{name:'开始演练',exact:true}).press('Enter');
  await page.getByLabel('任务目的',{exact:true}).fill('核对两处联络点');await page.getByLabel('期望结果',{exact:true}).fill('总部收到两阶段合法抵达凭证');
  await save(page,1);
}
async function save(page:Page,version:number){await page.getByRole('button',{name:'预览任务',exact:true}).press('Enter');await expect(page.getByTestId('mission-preview')).toBeVisible();await page.getByRole('button',{name:'保存草案',exact:true}).press('Enter');await expect(page.getByTestId('mission-save-state')).toContainText('已保存版本 '+version);await expect(page.getByTestId('mission-save-state')).not.toContainText('有未保存编辑');}

test('B22 task editing saves a new intent identity without rewriting the first draft',async({page})=>{
  await begin(page);const original=(await current(page)).plans[0];
  await page.getByLabel('任务目的',{exact:true}).fill('核对后续联络窗口');await save(page,2);
  const view=await current(page);expect(view.plans).toHaveLength(2);expect(view.plans[0]).toEqual(original);
  expect(view.plans[1].draft.intent).toMatchObject({id:'intent-M1',version:2,purpose:'核对后续联络窗口'});expect(view.plans[1].draft.phases).toEqual(original.draft.phases);expect(view.issued_orders).toEqual([]);expect(view.resources.movement_energy).toBe(20);
});

async function issue(page:Page,phase:string){await page.getByRole('button',{name:'核对当前阶段',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'确认下达 '+phase,exact:true})).toBeEnabled();await page.getByRole('button',{name:'确认下达 '+phase,exact:true}).press('Enter');await expect(page.getByTestId('issued-plan-line')).toHaveCount(phase==='P1'?1:2);}
async function advance(page:Page,seconds:string){await page.getByLabel('推进到时刻（秒）').fill(seconds);await page.getByRole('button',{name:'推进到该时刻',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'推进到该时刻',exact:true})).toBeEnabled();}

test('B22 confirmed P1 survives a real UI future P2 route and window amendment and its actual receipt',async({page})=>{
  await begin(page);await issue(page,'P1');await advance(page,'31.5');await expect(page.getByTestId('mission-phase-results')).toContainText('P1 · 版本 1 · 合法抵达已确认');
  const before=await current(page);
  await page.getByLabel('阶段 2 最早开始').fill('40000');await page.getByLabel('阶段 2 最晚结束').fill('71000');
  await page.getByLabel('编辑阶段路线').selectOption('1');await page.getByLabel('路线点 2 x',{exact:true}).fill('200');await page.getByRole('button',{name:'新增路线点',exact:true}).press('Enter');await page.getByLabel('路线点 3 x',{exact:true}).fill('250');await page.getByLabel('路线点 3 y',{exact:true}).fill('150');
  await save(page,2);const amended=await current(page);
  expect(amended.plans[0]).toEqual(before.plans[0]);expect(amended.issued_orders).toEqual(before.issued_orders);expect(amended.reports).toEqual(before.reports);expect(amended.deliveries).toEqual(before.deliveries);expect(amended.phase_results).toEqual(before.phase_results);
  expect(amended.plans[1].draft.phases[0]).toEqual(before.plans[0].draft.phases[0]);expect(amended.plans[1].draft.phases[1]).toMatchObject({id:'P2',version:2,activity:{route_ref:{version:2}},earliest_start_time_ms:40000,latest_finish_time_ms:71000});
  expect(amended.plans[1].draft.routes[1]).toEqual({id:'route-P2',version:2,path:[[150,150],[200,150],[250,150]]});
  await issue(page,'P2');await expect(page.getByLabel('阶段 2 最早开始',{exact:true})).toBeDisabled();await expect(page.getByLabel('路线点 2 x',{exact:true})).toHaveJSProperty('readOnly',true);await expect(page.getByTestId('route-draft-line')).toHaveCount(0);await advance(page,'69.5');await expect(page.getByTestId('mission-readiness')).not.toContainText('移动目标已确认');
  await advance(page,'70.5');await expect(page.getByTestId('mission-readiness')).toContainText('移动目标已确认');await expect(page.getByTestId('mission-phase-results')).toContainText('P2 · 版本 2 · 合法抵达已确认 · 计划版本 2');await expect(page.getByTestId('mission-resources')).toContainText('移动能量 18 · 联络能量 12 · 总部能量 14');
});

test('B22 signed fields and map route editing remain frozen while the future window is editable',async({page})=>{
  await begin(page);await issue(page,'P1');
  await expect(page.getByTestId('route-draft-line')).toHaveCount(0);
  await page.getByLabel('公开态势地图',{exact:true}).click({position:{x:180,y:180}});
  await expect(page.getByLabel(/^路线点 \d+ x$/)).toHaveCount(2);await expect(page.getByTestId('mission-save-state')).not.toContainText('有未保存编辑');
  for(const label of ['任务目的','期望结果','路线点 1 x','路线点 2 y'])await expect(page.getByLabel(label,{exact:true})).toHaveJSProperty('readOnly',true);
  for(const label of ['窄目标','阶段 1 最早开始','阶段 1 最晚结束','阶段 1 前置阶段','阶段 2 前置阶段'])await expect(page.getByLabel(label,{exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'新增路线点',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'删除路线点 2',exact:true})).toBeDisabled();
  await expect(page.getByLabel('阶段 2 最早开始',{exact:true})).toBeEditable();
});

test('B22 players inspect the real decision and append a separate explanation without backfilling its reason',async({page})=>{
  await begin(page);await issue(page,'P1');await page.getByRole('button',{name:'指挥记录',exact:true}).press('Enter');
  const card=page.getByTestId('mission-decision-record');await expect(card).toHaveCount(1);await expect(card).toContainText('当时声明理由：未记录');
  await card.getByRole('button',{name:'检查当时记录',exact:true}).press('Enter');await expect(card.getByTestId('mission-decision-checks')).toContainText('上下文与引用 · 满足');await expect(card.getByTestId('mission-decision-checks')).toContainText('当时公开硬规则 · 满足');await expect(card.getByTestId('mission-decision-checks')).toContainText('声明理由的可评性 · 不可评价');
  const before=await current(page);await card.getByLabel('事后解释（不改当时理由）',{exact:true}).fill('这是事后说明，不能替代当时未记录的理由。');await card.getByRole('button',{name:'追加事后解释',exact:true}).press('Enter');
  await expect(card.getByTestId('mission-retrospective-explanations')).toContainText('这是事后说明，不能替代当时未记录的理由。');await expect(card).toContainText('当时声明理由：未记录');await expect(card.getByLabel('事后解释（不改当时理由）',{exact:true})).toHaveValue('');
  const after=await current(page);expect(after.decision_records).toEqual(before.decision_records);expect(after.retrospective_explanations).toHaveLength(1);expect(after.retrospective_explanations[0].layer).toBe('retrospective_inference');expect(after.resources).toEqual(before.resources);expect(after.sim_time).toBe(before.sim_time);
  await card.getByRole('button',{name:'检查当时记录',exact:true}).press('Enter');await expect(card.getByTestId('mission-decision-checks')).toContainText('声明理由的可评性 · 不可评价');
});

test('B22 late explanation acknowledgement preserves newer unsaved explanation text',async({page})=>{
  await begin(page,'hold_append');await issue(page,'P1');await page.getByRole('button',{name:'指挥记录',exact:true}).press('Enter');
  const card=page.getByTestId('mission-decision-record'),editor=card.getByLabel('事后解释（不改当时理由）',{exact:true});
  await editor.fill('第一条已提交说明');await card.getByRole('button',{name:'追加事后解释',exact:true}).press('Enter');await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__b22RecordHeld').held)).toBe(true);
  await editor.fill('较新的未提交说明');await page.evaluate(()=>Reflect.get(window,'__b22RecordHeld').release());await expect(card.getByRole('button',{name:'追加事后解释',exact:true})).toBeEnabled();
  await expect(card.getByTestId('mission-retrospective-explanations')).toContainText('第一条已提交说明');await expect(editor).toHaveValue('较新的未提交说明');expect((await current(page)).retrospective_explanations.map(e=>e.text)).toEqual(['第一条已提交说明']);
});

test('B22 lost real explanation reply is queried by its original identity without a duplicate append',async({page})=>{
  test.setTimeout(45000);await begin(page,'drop_append');await issue(page,'P1');await page.getByRole('button',{name:'指挥记录',exact:true}).press('Enter');const card=page.getByTestId('mission-decision-record');
  await card.getByLabel('事后解释（不改当时理由）',{exact:true}).fill('查询原操作后保留一次');await card.getByRole('button',{name:'追加事后解释',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'查询追加结果',exact:true})).toBeVisible({timeout:15000});await page.getByRole('button',{name:'查询追加结果',exact:true}).press('Enter');
  await expect(card.getByTestId('mission-retrospective-explanations')).toContainText('查询原操作后保留一次');expect((await current(page)).retrospective_explanations).toHaveLength(1);
  const proof=await page.evaluate(()=>{const requests=Reflect.get(window,'__b22RecordRequests') as Array<{kind:string;operation_id?:string;envelope?:{operation_id:string}}> ;return {append:requests.filter(r=>r.kind==='append_explanation').map(r=>r.envelope!.operation_id),queried:requests.filter(r=>r.kind==='receipt').map(r=>r.operation_id)};});
  expect(proof.append).toHaveLength(1);expect(proof.queried).toEqual(proof.append);
});

test('B22 actual explanation transaction abort keeps input through original-id recovery before one new append',async({page})=>{
  await begin(page,'abort_append');await issue(page,'P1');await page.getByRole('button',{name:'指挥记录',exact:true}).press('Enter');const card=page.getByTestId('mission-decision-record'),before=await current(page),editor=card.getByLabel('事后解释（不改当时理由）',{exact:true});
  await editor.fill('提交中断仍保留这条输入');await card.getByRole('button',{name:'追加事后解释',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'查询追加结果',exact:true})).toBeVisible();
  await expect(card.getByTestId('mission-retrospective-explanations')).not.toContainText('提交中断仍保留这条输入');await expect(editor).toHaveValue('提交中断仍保留这条输入');
  await page.getByRole('button',{name:'查询追加结果',exact:true}).press('Enter');await expect(page.getByRole('status')).toContainText('尚未查到已提交结果');await page.getByRole('button',{name:'恢复最近记录并重新核对',exact:true}).press('Enter');
  await expect(page.getByRole('status')).toContainText('情况已更新；输入保留');await expect(editor).toHaveValue('提交中断仍保留这条输入');await card.getByRole('button',{name:'追加事后解释',exact:true}).press('Enter');
  await expect(card.getByTestId('mission-retrospective-explanations')).toContainText('提交中断仍保留这条输入');const after=await current(page);expect(after.retrospective_explanations).toHaveLength(1);expect(after.decision_records).toEqual(before.decision_records);expect(after.resources).toEqual(before.resources);expect(after.paused).toBe(true);
  const ids=await page.evaluate(()=>(Reflect.get(window,'__b22RecordRequests') as Array<{kind:string;envelope?:{operation_id:string}}>).filter(r=>r.kind==='append_explanation').map(r=>r.envelope!.operation_id));expect(ids).toHaveLength(3);expect(ids[1]).toBe(ids[0]);expect(ids[2]).not.toBe(ids[0]);
});

test('B22 history checks use the old record and disable explanation writes until returning to current',async({page})=>{
  await begin(page);await issue(page,'P1');const issued=await current(page);await page.getByRole('button',{name:'指挥记录',exact:true}).press('Enter');const card=page.getByTestId('mission-decision-record');
  await card.getByLabel('事后解释（不改当时理由）',{exact:true}).fill('只在后来的节点存在');await card.getByRole('button',{name:'追加事后解释',exact:true}).press('Enter');await expect(card.getByTestId('mission-retrospective-explanations')).toContainText('只在后来的节点存在');
  await page.getByRole('button',{name:'行动复盘',exact:true}).press('Enter');await page.getByLabel('历史节点',{exact:true}).selectOption(String(issued.revision));await page.getByRole('button',{name:'查看历史节点',exact:true}).press('Enter');await expect(page.locator('.clock')).toContainText('历史只读');
  await page.getByRole('button',{name:'指挥记录',exact:true}).press('Enter');await expect(card.getByTestId('mission-retrospective-explanations')).not.toContainText('只在后来的节点存在');await expect(card.getByLabel('事后解释（不改当时理由）',{exact:true})).toHaveJSProperty('readOnly',true);await expect(card.getByRole('button',{name:'追加事后解释',exact:true})).toBeDisabled();
  await card.getByRole('button',{name:'检查当时记录',exact:true}).press('Enter');await expect(card.getByTestId('mission-decision-checks')).toContainText('声明理由的可评性 · 不可评价');
  await page.getByRole('button',{name:'行动复盘',exact:true}).press('Enter');await page.getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');await page.getByRole('button',{name:'指挥记录',exact:true}).press('Enter');await expect(card.getByTestId('mission-retrospective-explanations')).toContainText('只在后来的节点存在');await expect(card.getByLabel('事后解释（不改当时理由）',{exact:true})).toBeEditable();
});

test('B22 an explicit new run preserves the previous decision and explanations as readonly records',async({page})=>{
  await begin(page);await issue(page,'P1');await page.getByRole('button',{name:'指挥记录',exact:true}).press('Enter');const card=page.getByTestId('mission-decision-record');await card.getByLabel('事后解释（不改当时理由）',{exact:true}).fill('父行动的独立说明');await card.getByRole('button',{name:'追加事后解释',exact:true}).press('Enter');await expect(card.getByTestId('mission-retrospective-explanations')).toContainText('父行动的独立说明');const parent=await current(page);
  await page.getByRole('button',{name:'行动复盘',exact:true}).press('Enter');await page.getByRole('button',{name:'重开这场演练',exact:true}).press('Enter');await expect(page.getByRole('button',{name:'确认重开',exact:true})).toBeVisible();expect((await current(page)).run_id).toBe(parent.run_id);await page.getByRole('button',{name:'确认重开',exact:true}).press('Enter');
  await expect.poll(async()=>(await current(page)).source_run).toBe(parent.run_id);const fresh=await current(page);expect(fresh.run_id).not.toBe(parent.run_id);expect(fresh).toMatchObject({sim_time:0,paused:true,plans:[],issued_orders:[],decision_records:[],retrospective_explanations:[]});await expect(page.getByLabel('任务目的',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'行动复盘',exact:true}).press('Enter');await page.getByRole('button',{name:'查看上一场记录',exact:true}).press('Enter');await expect(page.locator('.clock')).toContainText('历史只读');await page.getByRole('button',{name:'指挥记录',exact:true}).press('Enter');await expect(card).toContainText('当时声明理由：未记录');await expect(card.getByTestId('mission-retrospective-explanations')).toContainText('父行动的独立说明');await expect(card.getByRole('button',{name:'追加事后解释',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'行动复盘',exact:true}).press('Enter');await page.getByRole('button',{name:'返回当前行动',exact:true}).press('Enter');await expect.poll(async()=>(await current(page)).run_id).toBe(fresh.run_id);await expect(page.getByRole('button',{name:'重开这场演练',exact:true})).toBeEnabled();
});

test('B22 a lost real restart reply retains one identity and prevents leaving before the original operation is resolved',async({page})=>{
  test.setTimeout(45000);await begin(page,'drop_restart');const parent=await current(page);await page.getByRole('button',{name:'行动复盘',exact:true}).press('Enter');await page.getByRole('button',{name:'重开这场演练',exact:true}).press('Enter');await page.getByRole('button',{name:'确认重开',exact:true}).press('Enter');
  await expect(page.getByRole('button',{name:'重试原重开操作',exact:true})).toBeVisible({timeout:15000});await expect(page.getByRole('button',{name:'更换演练任务',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'查看历史节点',exact:true})).toBeDisabled();await page.getByRole('button',{name:'重试原重开操作',exact:true}).press('Enter');
  await expect(page.getByLabel('任务目的',{exact:true})).toHaveValue('');const child=await current(page);expect(child.source_run).toBe(parent.run_id);expect(child.run_id).not.toBe(parent.run_id);
  const proof=await page.evaluate(()=>{const requests=Reflect.get(window,'__b22RecordRequests') as Array<{kind:string;operation_id?:string}>;return requests.filter(r=>r.kind==='restart').map(r=>r.operation_id);});expect(proof).toHaveLength(2);expect(proof[1]).toBe(proof[0]);
});
