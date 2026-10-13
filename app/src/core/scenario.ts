import definition from "./engineering.json";
import recordDefinition from "./record-engineering.json";
import {GameError} from '../contracts';
export const engineeringDefinition = definition;
export const recordEngineeringDefinition = recordDefinition;
export type Definition = typeof definition | typeof recordDefinition;
export function definition_for_package(schema:unknown,definitionHash:unknown):Definition {
  const found=[definition,recordDefinition].find(candidate=>candidate.schema===schema&&candidate.definition_hash===definitionHash);
  if(!found)throw new GameError('INVALID_SAVE');
  return found;
}
export async function hash(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function load_definition(input: unknown): Promise<Definition> {
  const selected = [definition, recordDefinition].find(candidate => JSON.stringify(input) === JSON.stringify(candidate));
  if (!selected)
    throw new GameError("INVALID_DEFINITION");
  const { definition_hash, ...payload } = selected;
  if ((await hash(payload)) !== definition_hash)
    throw new GameError("INVALID_DEFINITION");
  for (const key of ['profile','capabilities','rules','catalogs'] as const) {
    if (await hash(selected[key]) !== selected.hashes[key]) throw new GameError('INVALID_DEFINITION');
  }
  if (await hash([]) !== selected.hashes.media) throw new GameError('INVALID_DEFINITION');
  return structuredClone(selected);
}
export function describe_capabilities() {
  return [...definition.capabilities];
}
