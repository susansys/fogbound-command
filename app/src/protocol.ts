import type { Request } from "./transport";
import type { Envelope } from "./contracts";
export function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function valid_id(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_.-]{1,128}$/.test(value);
}
export function fields(
  value: Record<string, unknown>,
  expected: string[],
): boolean {
  return Object.keys(value).sort().join(",") === expected.sort().join(",");
}
export function valid_request(
  value: unknown,
): value is Request & { request_id: string } {
  if (!record(value) || !valid_id(value.request_id)) return false;
  if (value.kind === "list") return fields(value, ["kind", "request_id"]);
  if (value.kind === "create")
    return (
      fields(value, ["kind", "mode", "operation_id", "request_id"]) &&
      (value.mode === "command" || value.mode === "research") &&
      valid_id(value.operation_id)
    );
  if (value.kind === "view")
    return (
      fields(value, ["kind", "run_id", "request_id"]) && valid_id(value.run_id)
    );
  if (value.kind === "preview")
    return (
      fields(value, [
        "kind",
        "run_id",
        "revision",
        "editing_seq",
        "request_id",
      ]) &&
      valid_id(value.run_id) &&
      typeof value.revision === "number" &&
      Number.isSafeInteger(value.revision) &&
      typeof value.editing_seq === "number" &&
      Number.isSafeInteger(value.editing_seq) &&
      value.editing_seq >= 0
    );
  if (value.kind === "operate")
    return (
      fields(value, ["kind", "request_id", "envelope"]) &&
      valid_envelope(value.envelope) && value.envelope.intent.kind !== 'tick'
    );
  if (value.kind === "receipt")
    return (
      fields(value, ["kind", "request_id", "run_id", "operation_id"]) &&
      valid_id(value.run_id) &&
      valid_id(value.operation_id)
    );
  return false;
}
export function correlation(value: unknown): string {
  return record(value) && valid_id(value.request_id)
    ? value.request_id
    : "invalid-request";
}
export function valid_envelope(value: unknown): value is Envelope {
  if (
    !record(value) ||
    !fields(value, ["run_id", "operation_id", "expected_revision", "intent"]) ||
    !valid_id(value.run_id) ||
    !valid_id(value.operation_id) ||
    typeof value.expected_revision !== "number" ||
    !Number.isSafeInteger(value.expected_revision) ||
    value.expected_revision < 1 ||
    !record(value.intent)
  )
    return false;
  const intent = value.intent;
  if(intent.kind==='pause')return fields(intent,['kind','reason'])&&['manual','focus_lost','application_hidden'].includes(String(intent.reason));
  if(intent.kind==='continue')return fields(intent,['kind']);
  if(intent.kind==='rate')return fields(intent,['kind','rate'])&&[1,2,4].includes(Number(intent.rate))&&typeof intent.rate==='number';
  if(intent.kind==='mode')return fields(intent,['kind','mode'])&&['command','research'].includes(String(intent.mode));
  if (intent.kind === "advance" || intent.kind==='tick')
    return (
      fields(intent, ["kind", "to"]) &&
      typeof intent.to === "number" &&
      Number.isSafeInteger(intent.to) &&
      intent.to >= 0 &&
      intent.to <= 610000
    );
  if (intent.kind === "issue")
    return (
      fields(intent, [
        "kind",
        "command_id",
        "plan",
        ...(intent.reason === undefined ? [] : ["reason"]),
      ]) &&
      valid_id(intent.command_id) &&
      (intent.reason === undefined ||
        (typeof intent.reason === "string" && intent.reason.length <= 2000)) &&
      record(intent.plan) &&
      fields(intent.plan, [
        "run_id",
        "revision",
        "editing_seq",
        "version",
        "actor",
        "target",
        "path",
        "distance",
        "estimated_move_ms",
        "link_ms",
        "allowed",
        "gap",
      ]) &&
      valid_id(intent.plan.run_id) &&
      typeof intent.plan.revision==='number'&&Number.isSafeInteger(intent.plan.revision)&&intent.plan.revision>=1&&
      intent.plan.version===1&&intent.plan.actor==='R'&&intent.plan.target==='T'&&intent.plan.path==='H-T'&&intent.plan.distance===120&&intent.plan.estimated_move_ms===31800&&intent.plan.link_ms===1000&&typeof intent.plan.allowed==='boolean'&&typeof intent.plan.gap==='string'&&intent.plan.gap.length<=300&&
      typeof intent.plan.editing_seq === "number" &&
      Number.isSafeInteger(intent.plan.editing_seq) &&
      intent.plan.editing_seq >= 0
    );
  return false;
}
