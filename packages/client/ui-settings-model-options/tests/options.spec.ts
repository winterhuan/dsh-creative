/** Field edits preserve unrelated settings and match the pinned adapter's capability schema. */
import { Context } from '@deepseek-ai/cordis'
import Llm from '@deepseek-ai/dsh-llm'
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { describe, expect, it } from 'vitest'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { draftError, modelOptions, optionOperations, reasoningDraft } from '../src/client/options.ts'
import type { OptionsDraft, ReadPath, ReasoningDraft } from '../src/client/options.ts'

const read: ReadPath = (value, path) => path.reduce<unknown>((node, key) =>
  node !== null && typeof node === 'object' ? Reflect.get(node, key) : undefined, value)

function snapshot(value: unknown, base: unknown = {}): ConfigFormSnapshot<unknown> {
  return { status: 'ready', value, base, user: value, revision: 4, writable: true, mode: 'host' }
}

const model = { id: 'custom', name: 'Custom', contextWindow: 32768, maxTokens: 4096, input: ['text'] }
const profile = { models: [model], baseURL: 'https://example.invalid/v1' }
const providerPath = ['providers', 'gateway']

function draft(reasoning: ReasoningDraft, base: unknown = {}): OptionsDraft {
  return { snapshot: snapshot({ providers: { gateway: profile } }, base), reasoning: new Map([['custom', reasoning]]) }
}

describe('reasoning capabilities', () => {
  it('keeps omitted metadata, explicit non-reasoning, and omitted off parameter distinct', () => {
    expect(reasoningDraft(undefined).mode).toBe('inherit')
    expect(reasoningDraft(false).mode).toBe('disabled')
    expect(reasoningDraft({ off: null, high: 'ultra' })).toEqual({ mode: 'custom', efforts: { off: '', high: 'ultra' } })
    expect(reasoningDraft({ off: 'none', high: 'high' }).efforts.off).toBe('none')
  })

  it('edits a model leaf without restating its catalog, context, modalities, or endpoint', () => {
    const edits = draft({ mode: 'custom', efforts: { off: '', high: 'ultra' } })
    const ops = optionOperations(edits, providerPath, modelOptions(profile, [], read), read)
    expect(ops).toEqual([{ op: 'set', path: [...providerPath, 'models', '0', 'reasoningEfforts'], value: { off: null, high: 'ultra' } }])
    expect(profile.models).toEqual([model])
  })

  it('edits catalog overrides without pinning the catalog as an explicit model list', () => {
    const configured = { modelOverrides: { old: { name: 'Renamed' } } }
    const models = modelOptions(configured, [{ id: 'catalog', name: 'Catalog' }], read)
    expect(models.map(item => item.id)).toEqual(['catalog', 'old'])
    const edits: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map([['catalog', { mode: 'disabled', efforts: {} }]]) }
    expect(optionOperations(edits, providerPath, models, read)).toEqual([
      { op: 'set', path: [...providerPath, 'modelOverrides', 'catalog', 'reasoningEfforts'], value: false },
    ])
  })

  it.each([
    [{}, 'missingLevel'], [{ off: '' }, 'missingLevel'], [{ high: '' }, 'missingWire'], [{ low: '  ' }, 'missingWire'],
  ] as const)('rejects unusable capability declarations %j', (efforts, error) => {
    expect(draftError(draft({ mode: 'custom', efforts }))).toBe(error)
  })

  it('advertises exactly the declared levels through the real pi-ai adapter', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(Llm).await()
      await ctx.plugin(PiAi, { providers: { gateway: {
        api: 'openai-completions', baseURL: 'https://example.invalid/v1',
        models: [{ id: 'custom', reasoningEfforts: { off: null, high: 'ultra' } }],
      } } }).await()
      const info = await ctx.llm.resolveModelInfo('gateway', 'custom')
      expect(info.reasoning?.efforts.map(effort => effort.id)).toEqual(['off', 'high'])
    } finally { await ctx.fiber.dispose() }
  })
})

describe('retry counts', () => {
  it.each(['', ' ', '-1', '1.5', 'Infinity', '9007199254740992'])('rejects invalid input %j', count => {
    expect(draftError({ ...draft({ mode: 'inherit', efforts: {} }), retry: { mode: 'normal', count } })).toBe('invalidRetries')
  })

  it.each([0, 1, 3])('sets %i additional attempts without touching backoff or error codes', count => {
    const edits: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map(), retry: { mode: 'normal', count: String(count) } }
    expect(optionOperations(edits, providerPath, [], read)).toEqual([
      { op: 'set', path: [...providerPath, 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: [...providerPath, 'retryPolicy', 'maxRetries'], value: count },
    ])
  })

  it('restores the default without leaving a policy missing its required mode', () => {
    const edits: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map(), retry: { mode: 'inherit' } }
    expect(optionOperations(edits, [], [], read)).toEqual([
      { op: 'set', path: ['retryPolicy', 'mode'], value: 'normal' },
      { op: 'unset', path: ['retryPolicy', 'maxRetries'] },
    ])
  })

  it('restores the inherited mode when a deployment supplies a retry policy', () => {
    const edits: OptionsDraft = { snapshot: snapshot({}, { retryPolicy: { mode: 'always' } }), reasoning: new Map(), retry: { mode: 'inherit' } }
    expect(optionOperations(edits, [], [], read)[0]).toEqual({ op: 'unset', path: ['retryPolicy', 'mode'] })
  })
})
