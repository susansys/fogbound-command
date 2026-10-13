import {is_record_plan} from '../contracts';
import {GameError,type RecordPlan} from '../contracts';
import type {State} from './state';
import {record_definition_for_package} from './scenario';

export type ExactQuantity={numerator:number;denominator:number;unit:'record_work'|'record_energy'|'record_pack'};
export function quantity(numerator:number,denominator:number,unit:ExactQuantity['unit']):ExactQuantity {
  if(!Number.isSafeInteger(numerator)||numerator<0||!Number.isSafeInteger(denominator)||denominator<1)throw new GameError('ENGINE_UNCONFIRMED');
  let a=numerator,b=denominator;
  while(b){const remainder=a%b;a=b;b=remainder;}
  return {numerator:numerator/a,denominator:denominator/a,unit};
}
export function initial_record_accounts(parameters:{record_energy:number;record_wear:number;record_packs:number;hq_energy:number;hq_wear:number}) {
  return {record_energy:quantity(parameters.record_energy,1,'record_energy'),record_energy_used:quantity(0,1,'record_energy'),record_energy_reserved:quantity(0,1,'record_energy'),record_work:quantity(0,1,'record_work'),record_wear:parameters.record_wear,record_packs:parameters.record_packs,record_packs_accrued:quantity(0,1,'record_pack'),record_packs_used:0,record_packs_reserved:0,hq_energy:parameters.hq_energy,hq_wear:parameters.hq_wear,record_causes:[] as string[],record_artifacts:[]};
}
export function record_work_at(plan:RecordPlan,accepted:number,at:number):ExactQuantity {
  const elapsed=Math.max(0,Math.min(plan.estimated_record_ms,at-accepted-plan.setup_ms));
  return quantity(elapsed*plan.work,plan.estimated_record_ms,'record_work');
}
export function record_cause(state:State,cause:string):void {
  if(!state.world.record_causes||state.world.record_causes.includes(cause))throw new GameError('ENGINE_UNCONFIRMED');
  state.world.record_causes.push(cause);
}
export function account_record_progress(state:State,at:number,settle=false):void {
  const order=state.order;
  if(!order||!(is_record_plan(order.plan))||order.accepted===null)return;
  const plan=order.plan,world=state.world;
  const work=record_work_at(plan,order.accepted,at);
  const spent=quantity(work.numerator*plan.record_energy,work.denominator*plan.work,'record_energy');
  const used=settle?quantity(Math.ceil(spent.numerator/spent.denominator),1,'record_energy'):spent;
  const initial=record_definition_for_package(state.schema,state.definition_hash).profile.parameters.record_energy;
  world.record_work=work;
  world.record_packs_accrued=quantity(work.numerator*plan.record_packs,work.denominator*plan.work,'record_pack');
  world.record_energy_used=used;
  world.record_energy=quantity(initial*used.denominator-used.numerator,used.denominator,'record_energy');
  world.record_energy_reserved=settle?quantity(0,1,'record_energy'):quantity(plan.record_energy*used.denominator-used.numerator,used.denominator,'record_energy');
  world.record_packs_reserved=settle?0:plan.record_packs;
  if(settle){
    record_cause(state,`${order.command_id}.settle`);
    const packs=Math.ceil(work.numerator*plan.record_packs/(work.denominator*plan.work));
    world.record_packs=world.record_packs!-packs;
    world.record_packs_used=packs;
  }
}
