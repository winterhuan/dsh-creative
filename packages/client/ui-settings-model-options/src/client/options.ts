/** Reasoning and retry drafts translated into revision-fenced, field-only settings edits. */
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ModelCatalogModel, SettingsPathOpView } from '@deepseek-ai/dsh-api-remotes/client'
import type { PiAiModelProfile } from '@deepseek-ai/dsh-llm-pi-ai'

/** A level supported by the pinned pi-ai adapter. */
export type ThinkingLevel = keyof Exclude<PiAiModelProfile['reasoningEfforts'], false | undefined>

const levels: Record<ThinkingLevel, true> = {
  off: true, minimal: true, low: true, medium: true, high: true, xhigh: true, max: true,
}

/** Canonical order of the adapter's selectable thinking levels. */
export const THINKING_LEVELS = Object.keys(levels) as ThinkingLevel[]

/** A model's capability declaration; an empty off value means omit the request parameter. */
export interface ReasoningDraft {
  mode: 'inherit' | 'disabled' | 'custom'
  efforts: Partial<Record<ThinkingLevel, string>>
}

/** Restore the inherited retry limit or set a finite number of additional attempts. */
export type RetryDraft = { mode: 'inherit' } | { mode: 'normal'; count: string }

/** Edits retain the exact snapshot from which the first field was changed. */
export interface OptionsDraft {
  snapshot: ConfigFormSnapshot<unknown>
  reasoning: ReadonlyMap<string, ReasoningDraft>
  retry?: RetryDraft
}

/** One configured or catalog model, with its adapter-owned settings address. */
export interface ModelOption {
  id: string
  name: string
  path: string[]
  reasoning: unknown
}

/** Bound settings service reader, also usable by pure draft operations. */
export type ReadPath = (value: unknown, path: readonly string[]) => unknown

/**
 * Join stored models with catalog labels without materializing a replacement catalog.
 * @param profile - resolved provider settings.
 * @param catalog - current models reported by the Host.
 * @param read - settings-owned path reader.
 * @returns declared models, or catalog models and retained overrides when no list is configured.
 */
export function modelOptions(profile: unknown, catalog: readonly ModelCatalogModel[], read: ReadPath): ModelOption[] {
  const configured = read(profile, ['models'])
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.flatMap((model: unknown, index) => {
      const id = read(model, ['id'])
      const name = read(model, ['name'])
      return typeof id === 'string' ? [{
        id, name: typeof name === 'string' ? name : id,
        path: ['models', String(index)], reasoning: read(model, ['reasoningEfforts']),
      }] : []
    })
  }
  const overrides = read(profile, ['modelOverrides'])
  const ids = new Set(catalog.map(model => model.id))
  if (typeof overrides === 'object' && overrides !== null) {
    for (const id of Object.keys(overrides)) ids.add(id)
  }
  return [...ids].map(id => ({
    id, name: catalog.find(model => model.id === id)?.name ?? id,
    path: ['modelOverrides', id], reasoning: read(overrides, [id, 'reasoningEfforts']),
  }))
}

/**
 * Decode persisted capability metadata into editable values.
 * @param value - a model's reasoningEfforts setting.
 * @returns inherited, disabled, or explicitly declared levels.
 */
export function reasoningDraft(value: unknown): ReasoningDraft {
  if (value === false) return { mode: 'disabled', efforts: {} }
  if (typeof value !== 'object' || value === null) return { mode: 'inherit', efforts: {} }
  const efforts: ReasoningDraft['efforts'] = {}
  for (const level of THINKING_LEVELS) {
    const wire: unknown = Reflect.get(value, level)
    if (typeof wire === 'string') efforts[level] = wire
    else if (level === 'off' && wire === null) efforts.off = ''
  }
  return { mode: 'custom', efforts }
}

/**
 * Validate the draft before the Host performs protocol-specific validation.
 * @param draft - pending edits.
 * @returns the locale key of the first invalid field, or undefined.
 */
export function draftError(draft: OptionsDraft): 'invalidRetries' | 'missingLevel' | 'missingWire' | undefined {
  if (draft.retry?.mode === 'normal') {
    const count = Number(draft.retry.count)
    if (draft.retry.count.trim() === '' || !Number.isSafeInteger(count) || count < 0) return 'invalidRetries'
  }
  for (const reasoning of draft.reasoning.values()) {
    const error = reasoningError(reasoning)
    if (error !== undefined) return error
  }
  return undefined
}

/**
 * Check one capability declaration before editing or copying it.
 * @param reasoning - the source model's staged or stored capability.
 * @returns a field validation key, or undefined when the declaration can be saved.
 */
export function reasoningError(reasoning: ReasoningDraft): 'missingLevel' | 'missingWire' | undefined {
  if (reasoning.mode !== 'custom') return undefined
  if (!THINKING_LEVELS.some(level => level !== 'off' && reasoning.efforts[level] !== undefined)) return 'missingLevel'
  if (THINKING_LEVELS.some(level => level !== 'off' && reasoning.efforts[level]?.trim() === '')) return 'missingWire'
  return undefined
}

/**
 * Build atomic edits against the draft's original model addresses.
 * @param draft - validated edits and their starting snapshot.
 * @param providerPath - provider's address within its settings namespace.
 * @param models - model addresses read from that snapshot.
 * @param read - settings-owned reader for inherited retry settings.
 * @returns field operations preserving other model fields, credentials, backoff, and retry codes.
 * @throws when a draft is invalid or a selected model is absent.
 */
export function optionOperations(draft: OptionsDraft, providerPath: readonly string[], models: readonly ModelOption[], read: ReadPath): SettingsPathOpView[] {
  const error = draftError(draft)
  if (error !== undefined) throw new Error(error)
  const ops: SettingsPathOpView[] = []
  if (draft.retry !== undefined) {
    const path = [...providerPath, 'retryPolicy']
    if (draft.retry.mode === 'inherit') {
      const inheritedMode = read(draft.snapshot.base, [...path, 'mode'])
      ops.push(inheritedMode === undefined
        ? { op: 'set', path: [...path, 'mode'], value: 'normal' }
        : { op: 'unset', path: [...path, 'mode'] })
      ops.push({ op: 'unset', path: [...path, 'maxRetries'] })
    } else {
      ops.push({ op: 'set', path: [...path, 'mode'], value: 'normal' })
      ops.push({ op: 'set', path: [...path, 'maxRetries'], value: Number(draft.retry.count) })
    }
  }
  for (const [id, reasoning] of draft.reasoning) {
    const model = models.find(candidate => candidate.id === id)
    if (model === undefined) throw new Error(`Model ${id} is absent from the settings draft`)
    const path = [...providerPath, ...model.path, 'reasoningEfforts']
    if (reasoning.mode === 'inherit') ops.push({ op: 'unset', path })
    else if (reasoning.mode === 'disabled') ops.push({ op: 'set', path, value: false })
    else {
      const value: Record<string, string | null> = {}
      for (const level of THINKING_LEVELS) {
        const wire = reasoning.efforts[level]
        if (wire !== undefined) value[level] = level === 'off' && wire.trim() === '' ? null : wire
      }
      ops.push({ op: 'set', path, value })
    }
  }
  return ops
}
