import type { PlayerView } from "../contracts";
import type { State } from "./state";
export function project_player_view(state: State): PlayerView {
  const can_issue = false; // T01 offers safe creation and reading; later vertical slices add actions.
  return {
    run_id: state.run_id,
    revision: state.revision,
    sim_time: state.sim_time,
    mode: state.mode,
    rate: state.rate,
    paused: state.paused,
    finished: state.finished,
    source_run: state.source_run,
    status: "ready",
    position: structuredClone(state.known.position),
    report: structuredClone(state.known.report),
    delivery: structuredClone(state.known.delivery),
    resources: structuredClone(state.known.resources),
    geometry: structuredClone(state.public_rules.geometry),
    authority: structuredClone(state.public_rules.authority),
    can_issue,
    next_action: "选择工位T，预览固定走廊草案",
    gap: "尚未签发移动任务",
    log: structuredClone(state.log),
  };
}
export const reconstruct_known = project_player_view;
