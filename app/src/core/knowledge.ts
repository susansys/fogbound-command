import type { PlayerView } from "../contracts";
import type { State } from "./state";
export function project_player_view(state: State): PlayerView {
  const can_issue =
    state.status === "ready" &&
    !state.finished &&
    state.sim_time >= state.public_rules.authority.from &&
    state.sim_time < state.public_rules.authority.to;
  return {
    run_id: state.run_id,
    revision: state.revision,
    sim_time: state.sim_time,
    mode: state.mode,
    rate: state.rate,
    paused: state.paused,
    finished: state.finished,
    source_run: state.source_run,
    status: state.status,
    position: structuredClone(state.known.position),
    report: structuredClone(state.known.report),
    delivery: structuredClone(state.known.delivery),
    resources: structuredClone(state.known.resources),
    geometry: structuredClone(state.public_rules.geometry),
    authority: structuredClone(state.public_rules.authority),
    can_issue,
    next_action: state.ended
      ? "查看已收到的行动记录"
      : state.status === "ready"
        ? can_issue
          ? "选择联络点T，核对并下达通行命令"
          : "查看原件与记录"
        : "等待编组位置及抵达回报",
    gap: state.finished
      ? "完成回执已收到"
      : state.status === "deadline"
        ? "未在时限内完成任务，确认宽限不能用来补做任务"
        : state.status === "ready"
          ? can_issue
            ? "尚未签发移动任务"
            : "公开授权窗口已结束"
          : state.sim_time >= state.public_rules.authority.to
            ? "行动时限已到，只能等待此前已完成任务的回报"
            : state.status === "queued"
              ? "命令已登记，尚未收到编组接令回报"
              : "编组已接令并开始行动，尚未收到抵达回报",
    log: structuredClone(state.log),
  };
}
export const reconstruct_known = project_player_view;
