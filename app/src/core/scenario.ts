import definition from './engineering.json';
export const engineeringDefinition = definition;
export type Definition = typeof definition;
export async function hash(value:unknown):Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function load_definition(input:unknown):Promise<Definition> {
  if (JSON.stringify(input) !== JSON.stringify(definition)) throw new Error('INVALID_DEFINITION');
  const {definition_hash,...payload}=definition;
  if (await hash(payload)!==definition_hash) throw new Error('INVALID_DEFINITION');
  return structuredClone(definition);
}
export function describe_capabilities() { return [...definition.capabilities]; }
