import type {GamePlayerView} from '../src/play-contracts';
import type {StoredState,State} from '../src/core/state';
import type {PlayerView} from '../src/contracts';

// Old scenarios must keep their exact branch. These checks also fail at runtime
// if a regression accidentally routes an old fixture through schema7.
export function legacy_view(value:GamePlayerView):PlayerView{
  if(value.scenario_kind==='play_corridor'||value.scenario_kind==='play_mission'||value.scenario_kind==='play_intelligence'||value.scenario_kind==='play_outcome'||value.scenario_kind==='play_integrated_field')throw Error('Legacy fixture returned a later schema');
  return value;
}
export function legacy_result<T extends {view:GamePlayerView}>(value:T):Omit<T,'view'>&{view:PlayerView}{return {...value,view:legacy_view(value.view)};}
export function legacy_state(value:StoredState):State;
export function legacy_state(value:StoredState|undefined):State|undefined;
export function legacy_state(value:StoredState|undefined):State|undefined{
  if(value?.schema===7||value?.schema===8||value?.schema===9||value?.schema===10||value?.schema===11||value?.schema===12||value?.schema===13)throw Error('Legacy fixture stored a later schema');
  return value;
}
