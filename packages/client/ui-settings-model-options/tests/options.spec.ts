/** Field edits preserve unrelated settings and match the pinned adapter's capability schema. */
import { Context } from '@deepseek-ai/cordis'
import Llm, { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import * as PiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { describe, expect, it } from 'vitest'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { draftError, imageDraft, modelOptions, optionOperations, reasoningDraft } from '../src/client/options.ts'
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
  return { snapshot: snapshot({ providers: { gateway: profile } }, base), reasoning: new Map([['custom', reasoning]]), image: new Map() }
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
    const edits: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map([['catalog', { mode: 'disabled', efforts: {} }]]), image: new Map() }
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
  it.for([[], providerPath])('enables invalid-request retries at settings path %j using the runtime defaults', path => {
    const edits: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map(), image: new Map(), retryInvalidRequests: true }
    const defaults = resolveRetryPolicy(undefined, 'test')
    expect(defaults.mode).toBe('normal')
    if (defaults.mode !== 'normal') throw new Error('Expected finite retry defaults')
    expect(optionOperations(edits, path, [], read)).toEqual([
      { op: 'set', path: [...path, 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: [...path, 'retryPolicy', 'retryableCodes'], value: [...defaults.retryableCodes, 'INVALID_REQUEST'] },
    ])
  })

  it.each([true, false])('changes invalid-request eligibility to %s without replacing other error codes or backoff', enabled => {
    const policy = { mode: 'normal', maxRetries: 2, retryableCodes: ['SERVER', 'CUSTOM', 'INVALID_REQUEST'], backoff: { initialDelayMs: 1000 } }
    const edits: OptionsDraft = { snapshot: snapshot({ retryPolicy: policy }), reasoning: new Map(), image: new Map(), retryInvalidRequests: enabled }
    expect(optionOperations(edits, [], [], read)).toEqual([
      { op: 'set', path: ['retryPolicy', 'retryableCodes'], value: enabled ? policy.retryableCodes : ['SERVER', 'CUSTOM'] },
    ])
    expect(policy.retryableCodes).toEqual(['SERVER', 'CUSTOM', 'INVALID_REQUEST'])
  })

  it.each([['AUTH', 'retryAuthErrors'], ['QUOTA', 'retryQuotaErrors'], ['PI_AI_ERROR', 'retryUnclassifiedErrors']] as const)('adds %s without replacing other error codes or backoff', (code, field) => {
    const policy = { mode: 'normal', maxRetries: 2, retryableCodes: ['SERVER', 'CUSTOM'], backoff: { initialDelayMs: 1000 } }
    const edits: OptionsDraft = { snapshot: snapshot({ retryPolicy: policy }), reasoning: new Map(), image: new Map(), [field]: true }
    expect(optionOperations(edits, [], [], read)).toEqual([
      { op: 'set', path: ['retryPolicy', 'retryableCodes'], value: ['SERVER', 'CUSTOM', code] },
    ])
  })

  it('removes QUOTA while retaining AUTH and INVALID_REQUEST', () => {
    const edits: OptionsDraft = { snapshot: snapshot({ retryPolicy: { mode: 'normal', retryableCodes: ['AUTH', 'QUOTA', 'INVALID_REQUEST'] } }),
      reasoning: new Map(), image: new Map(), retryQuotaErrors: false }
    expect(optionOperations(edits, [], [], read)).toEqual([
      { op: 'set', path: ['retryPolicy', 'retryableCodes'], value: ['AUTH', 'INVALID_REQUEST'] },
    ])
  })

  it('removes the unclassified class while retaining AUTH and INVALID_REQUEST', () => {
    const edits: OptionsDraft = { snapshot: snapshot({ retryPolicy: { mode: 'normal', retryableCodes: ['AUTH', 'PI_AI_ERROR', 'INVALID_REQUEST'] } }),
      reasoning: new Map(), image: new Map(), retryUnclassifiedErrors: false }
    expect(optionOperations(edits, [], [], read)).toEqual([
      { op: 'set', path: ['retryPolicy', 'retryableCodes'], value: ['AUTH', 'INVALID_REQUEST'] },
    ])
  })

  it.each([['INVALID_REQUEST', 'retryInvalidRequests'], ['PI_AI_ERROR', 'retryUnclassifiedErrors']] as const)('restores transient defaults when %s is the only configured error class', (code, field) => {
    const edits: OptionsDraft = { snapshot: snapshot({ retryPolicy: { mode: 'normal', retryableCodes: [code] } }),
      reasoning: new Map(), image: new Map(), [field]: false }
    const defaults = resolveRetryPolicy(undefined, 'test')
    if (defaults.mode !== 'normal') throw new Error('Expected finite retry defaults')
    expect(optionOperations(edits, [], [], read)).toEqual([
      { op: 'set', path: ['retryPolicy', 'retryableCodes'], value: defaults.retryableCodes },
    ])
  })

  it.each(['', ' ', '-1', '1.5', 'Infinity', '9007199254740992'])('rejects invalid input %j', count => {
    expect(draftError({ ...draft({ mode: 'inherit', efforts: {} }), retry: { mode: 'normal', count } })).toBe('invalidRetries')
  })

  it.each([0, 1, 3])('sets %i additional attempts without touching backoff or error codes', count => {
    const edits: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map(), image: new Map(), retry: { mode: 'normal', count: String(count) } }
    expect(optionOperations(edits, providerPath, [], read)).toEqual([
      { op: 'set', path: [...providerPath, 'retryPolicy', 'mode'], value: 'normal' },
      { op: 'set', path: [...providerPath, 'retryPolicy', 'maxRetries'], value: count },
    ])
  })

  it('restores the default without leaving a policy missing its required mode', () => {
    const edits: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map(), image: new Map(), retry: { mode: 'inherit' } }
    expect(optionOperations(edits, [], [], read)).toEqual([
      { op: 'set', path: ['retryPolicy', 'mode'], value: 'normal' },
      { op: 'unset', path: ['retryPolicy', 'maxRetries'] },
    ])
  })

  it('restores the inherited mode when a deployment supplies a retry policy', () => {
    const edits: OptionsDraft = { snapshot: snapshot({}, { retryPolicy: { mode: 'always' } }), reasoning: new Map(), image: new Map(), retry: { mode: 'inherit' } }
    expect(optionOperations(edits, [], [], read)[0]).toEqual({ op: 'unset', path: ['retryPolicy', 'mode'] })
  })
})

describe('image capabilities', () => {
  it('decodes absent, text-only, and multimodal input declarations', () => {
    expect(imageDraft(undefined)).toEqual({ mode: 'inherit' })
    expect(imageDraft([])).toEqual({ mode: 'inherit' })
    expect(imageDraft(['text'])).toEqual({ mode: 'text' })
    expect(imageDraft(['text', 'image'])).toEqual({ mode: 'textAndImage' })
  })

  it('reads the adapter-owned image field from model entries and catalog overrides', () => {
    const [configured] = modelOptions(profile, [], read)
    expect(configured).toMatchObject({ id: 'custom', path: ['models', '0'], image: ['text'], imageField: 'input' })
    const [deepseek] = modelOptions({ models: [{ id: 'ds', inputModalities: ['text', 'image'] }] }, [], read, 'inputModalities')
    expect(deepseek).toMatchObject({ image: ['text', 'image'], imageField: 'inputModalities' })
    const overrides = { modelOverrides: { a: { input: ['text', 'image'] } } }
    const models = modelOptions(overrides, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], read)
    expect(models[0]).toMatchObject({ path: ['modelOverrides', 'a'], image: ['text', 'image'] })
    expect(models[1]).toMatchObject({ path: ['modelOverrides', 'b'], image: undefined })
  })

  it('sets and restores a pi-ai image declaration without restating other model fields', () => {
    const models = modelOptions(profile, [], read)
    const options: OptionsDraft = { snapshot: snapshot({ providers: { gateway: profile } }), reasoning: new Map(), image: new Map([['custom', { mode: 'textAndImage' }]]) }
    expect(optionOperations(options, providerPath, models, read)).toEqual([
      { op: 'set', path: [...providerPath, 'models', '0', 'input'], value: ['text', 'image'] },
    ])
    const inherited: OptionsDraft = { ...options, image: new Map([['custom', { mode: 'inherit' }]]) }
    expect(optionOperations(inherited, providerPath, models, read)).toEqual([
      { op: 'unset', path: [...providerPath, 'models', '0', 'input'] },
    ])
    expect(profile.models).toEqual([model])
  })

  it('edits a catalog override image declaration without pinning the catalog', () => {
    const models = modelOptions({}, [{ id: 'catalog', name: 'Catalog' }], read)
    const options: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map(), image: new Map([['catalog', { mode: 'text' }]]) }
    expect(optionOperations(options, providerPath, models, read)).toEqual([
      { op: 'set', path: [...providerPath, 'modelOverrides', 'catalog', 'input'], value: ['text'] },
    ])
  })

  it('clears deepseek image request limits when a model becomes text-only', () => {
    const deepseekProfile = { models: [{ id: 'ds', inputModalities: ['text', 'image'], imagePixelBudget: 'low', imageMaxBytes: 2048 }] }
    const models = modelOptions(deepseekProfile, [], read, 'inputModalities')
    const options: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map(), image: new Map([['ds', { mode: 'text' }]]) }
    expect(optionOperations(options, providerPath, models, read)).toEqual([
      { op: 'set', path: [...providerPath, 'models', '0', 'inputModalities'], value: ['text'] },
      { op: 'unset', path: [...providerPath, 'models', '0', 'imagePixelBudget'] },
      { op: 'unset', path: [...providerPath, 'models', '0', 'imageMaxBytes'] },
    ])
    expect(deepseekProfile.models).toEqual([{ id: 'ds', inputModalities: ['text', 'image'], imagePixelBudget: 'low', imageMaxBytes: 2048 }])
  })

  it('keeps deepseek image request limits when a model accepts images', () => {
    const deepseekProfile = { models: [{ id: 'ds', inputModalities: ['text'], imagePixelBudget: 'low' }] }
    const models = modelOptions(deepseekProfile, [], read, 'inputModalities')
    const options: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map(), image: new Map([['ds', { mode: 'textAndImage' }]]) }
    expect(optionOperations(options, providerPath, models, read)).toEqual([
      { op: 'set', path: [...providerPath, 'models', '0', 'inputModalities'], value: ['text', 'image'] },
    ])
  })

  it('rejects image edits naming an absent model', () => {
    const options: OptionsDraft = { snapshot: snapshot({}), reasoning: new Map(), image: new Map([['gone', { mode: 'text' }]]) }
    expect(() => optionOperations(options, providerPath, [], read)).toThrow('Model gone is absent from the settings draft')
  })

  it('advertises declared image input through the real pi-ai adapter', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(Llm).await()
      await ctx.plugin(PiAi, { providers: { gateway: {
        api: 'openai-completions', baseURL: 'https://example.invalid/v1',
        models: [{ id: 'custom', input: ['text', 'image'] }],
      } } }).await()
      const info = await ctx.llm.resolveModelInfo('gateway', 'custom')
      expect(info.inputModalities).toEqual(['text', 'image'])
    } finally { await ctx.fiber.dispose() }
  })
})
