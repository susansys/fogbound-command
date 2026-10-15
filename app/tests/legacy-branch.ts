import type {GamePlayerView} from '../src/play-contracts';
import type {StoredState,State} from '../src/core/state';
import type {PlayerView} from '../src/contracts';

// Old scenarios must keep their exact branch. These checks also fail at runtime
// if a regression accidentally routes an old fixture through schema7.
export function legacy_view(value:GamePlayerView):PlayerView{
  if(value.scenario_kind==='play_corridor')throw Error('Legacy fixture returned schema7');
  return value;
}
export function legacy_result<T extends {view:GamePlayerView}>(value:T):Omit<T,'view'>&{view:PlayerView}{return {...value,view:legacy_view(value.view)};}
export function legacy_state(value:StoredState):State;
export function legacy_state(value:StoredState|undefined):State|undefined;
export function legacy_state(value:StoredState|undefined):State|undefined{
  if(value?.schema===7)throw Error('Legacy fixture stored schema7');
  return value;
}
