import {GameError} from '../contracts';
import type {Coordinate} from '../spatial';
import type {PlayDefinition} from './scenario';
import type {MovementBasis,MovementCause} from '../route-contracts';

export type Fraction={n:string;d:string};
export type RationalPosition={x:Fraction;y:Fraction};
function gcd(a:bigint,b:bigint):bigint{a=a<0n?-a:a;while(b!==0n){const r=a%b;a=b;b=r;}return a;}
export function fraction(n:bigint|number,d:bigint|number=1):Fraction{
  let numerator=BigInt(n),denominator=BigInt(d);if(denominator===0n)throw new GameError('ENGINE_UNCONFIRMED');
  if(denominator<0n){numerator=-numerator;denominator=-denominator;}
  const divisor=gcd(numerator,denominator);return {n:String(numerator/divisor),d:String(denominator/divisor)};
}
export function number_fraction(value:number):Fraction{
  if(!Number.isFinite(value))throw new GameError('ENGINE_UNCONFIRMED');
  const match=String(value).match(/^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/);if(!match)throw new GameError('ENGINE_UNCONFIRMED');
  const decimals=match[3]??'',scale=decimals.length-Number(match[4]??0),n=BigInt(match[2]+decimals)*(match[1]? -1n:1n);
  return scale>=0?fraction(n,10n**BigInt(scale)):fraction(n*10n**BigInt(-scale));
}
export const add_fraction=(a:Fraction,b:Fraction)=>fraction(BigInt(a.n)*BigInt(b.d)+BigInt(b.n)*BigInt(a.d),BigInt(a.d)*BigInt(b.d));
export const subtract_fraction=(a:Fraction,b:Fraction)=>fraction(BigInt(a.n)*BigInt(b.d)-BigInt(b.n)*BigInt(a.d),BigInt(a.d)*BigInt(b.d));
export const multiply_fraction=(a:Fraction,b:Fraction)=>fraction(BigInt(a.n)*BigInt(b.n),BigInt(a.d)*BigInt(b.d));
export const divide_fraction=(a:Fraction,b:Fraction)=>fraction(BigInt(a.n)*BigInt(b.d),BigInt(a.d)*BigInt(b.n));
export function compare_fraction(a:Fraction,b:Fraction):number{const delta=BigInt(a.n)*BigInt(b.d)-BigInt(b.n)*BigInt(a.d);return delta<0n?-1:delta>0n?1:0;}
export const fraction_to_number=(value:Fraction)=>Number(value.n)/Number(value.d);
export function ceil_fraction(value:Fraction):number{const n=BigInt(value.n),d=BigInt(value.d);const result=Number(n/d+(n%d>0n?1n:0n));if(!Number.isSafeInteger(result))throw new GameError('ENGINE_UNCONFIRMED');return result;}
export const rational_position=(point:Coordinate):RationalPosition=>({x:number_fraction(point[0]),y:number_fraction(point[1])});

export function movement_basis_for_definition(definition:PlayDefinition):MovementBasis{
  const seen=new Set<string>(),applied_causes:MovementCause[]=[],factors={terrain:1,environment:1};
  for(const declared of definition.catalogs.movement_causes){
    const key=JSON.stringify([declared.cause_id,declared.rule_ref,declared.consumer]);if(seen.has(key))continue;seen.add(key);
    const cause:MovementCause={cause_id:declared.cause_id,rule_ref:declared.rule_ref,consumer:'R:move',slot:declared.slot as 'terrain'|'environment',factor:declared.factor,evidence_ref:declared.evidence_ref};
    applied_causes.push(cause);factors[cause.slot]*=cause.factor;
  }
  const capability=definition.capabilities[0];
  return {capability_ref:capability.id,speed:capability.speed,unit:'fictional_metre/s',load:definition.catalogs.actor.load,terrain_factor:factors.terrain,environment_factor:factors.environment,load_factor_per_unit:definition.rules.load_factor_per_unit,length_scale:1000000,applied_causes,evidence_refs:[...new Set([...capability.evidence_refs,...applied_causes.map(cause=>cause.evidence_ref)])]};
}
export type PathTiming={length_units:string[];segment_ms:Fraction[];duration_ms:Fraction;applied_causes:MovementCause[]};
export function path_timing(path:Coordinate[],basis:MovementBasis):PathTiming{
  const loadFactor=add_fraction(fraction(1),multiply_fraction(number_fraction(basis.load_factor_per_unit),number_fraction(basis.load)));
  const causeFactor=basis.applied_causes.reduce((factor,cause)=>multiply_fraction(factor,number_fraction(cause.factor)),fraction(1));
  const travelFactor=multiply_fraction(causeFactor,loadFactor);
  const msPerUnit=divide_fraction(multiply_fraction(fraction(1000),travelFactor),multiply_fraction(number_fraction(basis.speed),fraction(basis.length_scale)));
  const length_units=path.slice(1).map((p,i)=>String(Math.floor(Math.hypot(p[0]-path[i][0],p[1]-path[i][1])*basis.length_scale+0.5)));
  const segment_ms=length_units.map(length=>multiply_fraction(fraction(BigInt(length)),msPerUnit));
  return {length_units,segment_ms,duration_ms:segment_ms.reduce(add_fraction,fraction(0)),applied_causes:structuredClone(basis.applied_causes)};
}
export function progress_on_path(path:Coordinate[],timing:PathTiming,elapsed:number|Fraction):{position:RationalPosition;distance:Fraction;segment_index:number}{
  let remaining=typeof elapsed==='number'?number_fraction(Math.max(0,elapsed)):elapsed,distance=fraction(0);
  for(let i=0;i<timing.segment_ms.length;i++){
    const length=fraction(BigInt(timing.length_units[i]),1000000);
    if(compare_fraction(remaining,timing.segment_ms[i])>=0){remaining=subtract_fraction(remaining,timing.segment_ms[i]);distance=add_fraction(distance,length);continue;}
    const portion=divide_fraction(remaining,timing.segment_ms[i]),a=path[i],b=path[i+1];
    return {position:{x:add_fraction(number_fraction(a[0]),multiply_fraction(subtract_fraction(number_fraction(b[0]),number_fraction(a[0])),portion)),y:add_fraction(number_fraction(a[1]),multiply_fraction(subtract_fraction(number_fraction(b[1]),number_fraction(a[1])),portion))},distance:add_fraction(distance,multiply_fraction(length,portion)),segment_index:i};
  }
  return {position:rational_position(path[path.length-1]),distance,segment_index:timing.segment_ms.length-1};
}
export function first_closure_time(path:Coordinate[],timing:PathTiming,closed_at_x:number|null):Fraction|null{
  if(closed_at_x===null)return null;
  let elapsed=fraction(0);
  for(let i=0;i<timing.segment_ms.length;i++){
    const [a,b]=[path[i],path[i+1]],min=Math.min(a[0],b[0]),max=Math.max(a[0],b[0]);
    if(closed_at_x>=min&&closed_at_x<=max){
      const portion=a[0]===b[0]?fraction(0):divide_fraction(subtract_fraction(number_fraction(closed_at_x),number_fraction(a[0])),subtract_fraction(number_fraction(b[0]),number_fraction(a[0])));
      return add_fraction(elapsed,multiply_fraction(timing.segment_ms[i],portion));
    }
    elapsed=add_fraction(elapsed,timing.segment_ms[i]);
  }
  return null;
}
