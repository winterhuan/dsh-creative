import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-settings'

/** Settings namespace of the story plugin. Zhuque reads only this section. */
export const STORY_SETTINGS_NAMESPACE = 'story'

/**
 * Credential reference the Zhuque detector resolves. The key literal stays in
 * the credentials store; this field only names the reference.
 */
export interface ProduceConfig {
  /**
   * Credential references for the EdgeOne Makers key, comma-separated for
   * rotation. A stored value may itself hold newline-separated keys.
   * Defaults to MAKERS_API_KEY.
   */
  readonly makersApiKeyEnv?: string
}

/** Canonical environment name the detector reads, and the default reference. */
const MAKERS_ENV = 'MAKERS_API_KEY'

/**
 * Split one key field into the credential references it names. A blank field
 * falls back to the single default reference.
 * @param declared - the section's raw field value.
 * @param fallback - the default reference when the field names none.
 * @returns the references to resolve, in rotation order.
 */
export function keyReferences(declared: unknown, fallback: string): string[] {
  const refs = typeof declared === 'string'
    ? declared.split(',').map(part => part.trim()).filter(part => part !== '')
    : []
  return refs.length > 0 ? refs : [fallback]
}

/**
 * Split one resolved credential value into the keys it carries.
 * @param value - the stored credential value.
 * @returns the non-empty trimmed lines, in pool order.
 */
export function keyLines(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(line => line !== '')
}

/**
 * Project the story section into one environment per key rotation attempt.
 * Lookup references never rename `MAKERS_API_KEY`. An unset key stays unset
 * so the script reports `missing_credential` instead of receiving an empty value.
 * @param ctx - plugin context supplying the credential and environment planes.
 * @param section - the currently authoritative profile.
 * @returns one explicit environment per attempt; never secret metadata.
 */
export async function resolveProduceEnvs(
  ctx: Context,
  section: ProduceConfig,
): Promise<Array<Record<string, string>>> {
  const credentials = ctx.get('credentials')
  const launch = ctx.get('launchEnvironment')
  const values: string[] = []
  for (const ref of keyReferences(section.makersApiKeyEnv, MAKERS_ENV)) {
    const stored = await credentials?.resolve(credentialRef(ref))
    const raw = stored?.value ?? launch?.get(ref)?.value
    if (typeof raw !== 'string') continue
    values.push(...keyLines(raw))
  }
  if (values.length === 0) return [{}]
  return values.map(value => ({ [MAKERS_ENV]: value }))
}

/**
 * Inspect whether the Zhuque credential resolves, using the same lookup as execution.
 * @param ctx - context supplying credential and launch-environment services.
 * @param section - currently authoritative profile.
 * @returns `MAKERS_API_KEY` when at least one usable key exists; never secret values.
 */
export async function configuredProduceCredentials(ctx: Context, section: ProduceConfig): Promise<ReadonlySet<string>> {
  const envs = await resolveProduceEnvs(ctx, section)
  return envs.some(env => env[MAKERS_ENV] !== undefined) ? new Set([MAKERS_ENV]) : new Set()
}

/**
 * Read the story plugin's settings section when the settings service projects
 * it, otherwise the composition entry the plugin loaded with.
 * @param ctx - plugin context optionally carrying the settings service.
 * @param entry - composition entry fallback when no section is served.
 * @returns the resolved profile snapshot.
 */
export function currentProduceConfig(ctx: Context, entry: ProduceConfig): ProduceConfig {
  const settings = ctx.get('settings')
  if (settings === undefined) return entry
  const section = settings.describe().find(descriptor => descriptor.ns === STORY_SETTINGS_NAMESPACE)
  if (section === undefined) return entry
  const value = section.value as ProduceConfig | undefined
  const makersApiKeyEnv = value?.makersApiKeyEnv ?? entry.makersApiKeyEnv
  return makersApiKeyEnv === undefined ? {} : { makersApiKeyEnv }
}
