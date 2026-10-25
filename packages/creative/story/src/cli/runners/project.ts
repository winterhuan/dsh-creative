/**
 * `project` commands. The book path has already passed the workspace guard.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkCast } from '../../core/cast.ts'
import { buildContext } from '../../core/context.ts'
import { recordReferenceFacts } from '../../core/facts.ts'
import { projectGates } from '../../core/gates.ts'
import { archiveReaderValue, retireContextItem } from '../../core/legacy.ts'
import { checkPlan } from '../../core/plan.ts'
import { projectCheckReport } from '../../core/project-check.ts'
import { lookupReference } from '../../core/reference.ts'
import { checkRhythm } from '../../core/rhythm.ts'
import { LOOKUP_DEFAULT_LIMIT, lookupSettings } from '../../core/settings-lookup.ts'
import { projectQuery, type QueryFilter, type QueryKind } from '../../core/tracking/query.ts'
import { normalizeInitialDocument, type TrackingState } from '../../core/tracking/schema.ts'
import { initialize, migrateTracking, statePath } from '../../core/tracking/store.ts'
import { migrateWritingGates } from '../../core/writing-check.ts'
import { CliError, containedTree, filePath, integer, readObject, text } from '../guards.ts'

/** Run one project action. */
export function runProject(book: string, workspace: string | undefined, action: string, values: Record<string, unknown>): [unknown, number] {
    if (action === 'init') {
      if (values.kind === 'short' && values.input !== undefined) throw new CliError('short initialization does not accept long-form tracking input')
      const document = typeof values.input === 'string' ? readObject(values.input) : null
      if (document !== null) {
        containedTree(book, join(book, '追踪'))
        normalizeInitialDocument(document)
        if (existsSync(statePath(book))) throw new CliError('tracking state already exists; initialization never overwrites it')
      }
      const created = !existsSync(book)
      mkdirSync(book, { recursive: true })
      if (values.kind === 'long') for (const directory of ['正文', '大纲', '设定']) mkdirSync(join(book, directory), { recursive: true })
      let state: TrackingState | undefined
      if (document !== null) {
        const written = initialize(book, document)
        state = written.state
        for (const warning of written.warnings) process.stderr.write(`${warning}\n`)
      }
      return [{
        schema: 'story-project-init/v1', book: values.book, project: book, kind: values.kind,
        initialized: existsSync(statePath(book)), created,
        ...(state === undefined ? {} : { last_committed_chapter: state.last_committed_chapter, state_revision: state.state_revision }),
      }, 0]
    }
    if (action === 'check') {
      containedTree(book, join(book, '追踪'))
      return [projectCheckReport(book), 0]
    }
    if (action === 'migrate') {
      containedTree(book, join(book, '追踪'))
      const target = values.to === '5' ? 5 : 6
      return [migrateTracking(book, target), 0]
    }
    if (action === 'gates') return [projectGates(book), 0]
    if (action === 'migrate-gates') return [migrateWritingGates(book, values['legacy-off'] === true), 0]
    if (action === 'context') {
      const source = typeof values.text === 'string' ? readFileSync(filePath(values.text, book), 'utf8') : undefined
      const profile = values.profile === 'lite' ? 'lite' as const : undefined
      return [buildContext(book, {
        ...(integer(values, 'chapter') === undefined ? {} : { chapter: integer(values, 'chapter') as number }),
        ...(source === undefined ? {} : { text: source }),
        ...(profile === undefined ? {} : { profile }),
      }), 0]
    }
    if (action === 'lookup') {
      const hasText = typeof values.text === 'string'
      const hasFile = typeof values.file === 'string'
      if (hasText === hasFile) throw new CliError('project lookup requires exactly one of --text or --file')
      const queryText = hasFile ? readFileSync(filePath(text(values, 'file'), book), 'utf8') : text(values, 'text')
      const revision = typeof values.revision === 'string' ? values.revision : undefined
      const limit = integer(values, 'limit') ?? LOOKUP_DEFAULT_LIMIT
      const settings = lookupSettings(book, queryText, {
        offset: integer(values, 'offset') ?? 0,
        limit,
        ...(revision === undefined ? {} : { expectedIndex: revision }),
      })
      if (values.reference !== true && values.record === true) throw new CliError('lookup --record requires --reference')
      if (values.reference !== true) return [settings, 0]
      const references = lookupReference(workspace ?? '', book, queryText, { limit })
      if (values.record !== true) return [{ ...settings, references }, 0]
      const prefix = references.title === null ? '' : `拆文库/${references.title}/`
      const referenceRecorded = prefix === '' ? { schema: 'story-facts/v1', recorded: 0, ids: [] } : recordReferenceFacts(book, references.items, prefix)
      return [{ ...settings, references, reference_recorded: referenceRecorded }, 0]
    }
    if (action === 'rhythm') {
      const from = integer(values, 'from') ?? 0
      const to = integer(values, 'to') ?? 0
      try {
        const report = checkRhythm(book, from, to)
        return [report, report.findings.length > 0 ? 1 : 0]
      } catch (error) {
        if (error instanceof RangeError) throw new CliError(error.message)
        throw error
      }
    }
    if (action === 'plan-check') {
      const report = checkPlan(book, integer(values, 'chapter') ?? 1)
      return [report, report.ok ? 0 : 1]
    }
    if (action === 'cast-check') {
      const from = integer(values, 'from')
      const to = integer(values, 'to')
      const report = checkCast(book, { ...(from === undefined ? {} : { from }), ...(to === undefined ? {} : { to }) })
      return [report, report.findings.length > 0 ? 1 : 0]
    }
    if (action === 'legacy-archive') {
      containedTree(book, join(book, '追踪'))
      return [archiveReaderValue(book), 0]
    }
    if (action === 'context-retire') {
      containedTree(book, join(book, '追踪'))
      return [retireContextItem(book, text(values, 'item'), text(values, 'reason')), 0]
    }
    const expectedRevision = integer(values, 'revision') ?? null
    if (action === 'status') return [projectQuery(book, { expectedRevision }), 0]
    const stalePlanted = integer(values, 'stale-planted')
    const staleCharacter = integer(values, 'stale-character')
    const staleThread = integer(values, 'stale-thread')
    return [projectQuery(book, {
      kind: values.kind as QueryKind, search: text(values, 'search'), selection: values.filter as QueryFilter,
      chapter: integer(values, 'chapter') ?? null, offset: integer(values, 'offset') ?? 0, limit: integer(values, 'limit') ?? 20, expectedRevision,
      ...(stalePlanted === undefined ? {} : { stalePlanted }),
      ...(staleCharacter === undefined ? {} : { staleCharacter }),
      ...(staleThread === undefined ? {} : { staleThread }),
    }), 0]
}
