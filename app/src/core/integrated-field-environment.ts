import {GameError} from '../contracts';
import type {IntegratedFieldDefinition} from './integrated-field-definition';
import type {IntegratedFieldState} from './integrated-field-state';
export type IntegratedEnvironmentProfile=keyof IntegratedFieldDefinition['environment_inputs'];
export type IntegratedEnvironmentState={profile:IntegratedEnvironmentProfile;cursor:number;rain:boolean;ground:'dry'|'wet';fog:boolean;references:{near50:'visible'|'unavailable';far100:'visible'|'not_visible'}};
type Event={at:number;kind:'rain'|'wet_road'|'fog';active:boolean};
function schedule(definition:Pick<IntegratedFieldDefinition,'environment_inputs'>,profile:IntegratedEnvironmentProfile):Event[]{
 if(!Object.hasOwn(definition.environment_inputs,profile))throw new GameError('INVALID_DEFINITION');const input=definition.environment_inputs[profile],events:Event[]=[],kinds=['rain','wet_road','fog'] as const;
 for(const kind of kinds){let end=-1;if(input[kind].length>4)throw new GameError('INVALID_DEFINITION');for(const interval of input[kind]){if(interval.length!==2||!interval.every(Number.isSafeInteger)||interval[0]<0||interval[0]<end||interval[1]<=interval[0]||interval[1]>900000)throw new GameError('INVALID_DEFINITION');events.push({at:interval[0],kind,active:true},{at:interval[1],kind,active:false});end=interval[1];}}
 return events.sort((a,b)=>a.at-b.at||kinds.indexOf(a.kind)-kinds.indexOf(b.kind));
}
export function initial_integrated_environment(definition:IntegratedFieldDefinition,profile:IntegratedEnvironmentProfile):IntegratedEnvironmentState{schedule(definition,profile);return{profile,cursor:0,rain:false,ground:'dry',fog:false,references:{near50:'visible',far100:'visible'}};}
export function validate_environment_inputs(definition:Pick<IntegratedFieldDefinition,'environment_inputs'>){for(const profile of Object.keys(definition.environment_inputs))schedule(definition,profile as IntegratedEnvironmentProfile);}
export function next_environment_boundary(state:IntegratedFieldState,cursor:number,to:number){const events=schedule(state.definition,state.environment.profile);return Math.min(to,events.find((event,index)=>index>=state.environment.cursor&&event.at>cursor)?.at??to);}
export function apply_integrated_environment(state:IntegratedFieldState,at:number){
 const events=schedule(state.definition,state.environment.profile),local=state.environment;
 while(local.cursor<events.length&&events[local.cursor].at<=at){const event=events[local.cursor++];if(event.kind==='rain')local.rain=event.active;else if(event.kind==='wet_road')local.ground=event.active?'wet':'dry';else{local.fog=event.active;local.references={near50:'visible',far100:event.active?'not_visible':'visible'};}}
 local.references.near50=state.guidance_loss_at!==null&&at>=state.guidance_loss_at?'unavailable':'visible';
}
