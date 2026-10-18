/**
 * Chapter checks and guarded tracking commits.
 *
 * Port of `tests/reference/storyctl.py` and the snapshot command of `tests/reference/cli.py`.
 * The four text checkers run in-process; their findings keep the JSON the
 * subprocess-based reference reported, including the `file` field.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { scanAiPatterns } from './checks/ai-patterns.ts'
import { scanDegeneration } from './checks/degeneration.ts'
import type { CheckFinding } from './checks/findings.ts'
import { checkOutlineCopy } from './checks/outline-copy.ts'
import { normalizePunctuation, readProjectPunctuationPolicy } from './checks/punctuation.ts'
import { scanChapterQuality } from './rules.ts'
import { verifyOutline } from './outline-contract.ts'
import { normalizeState, require as requireTracking } from './tracking/schema.ts'
import { applyTransaction, loadState, projectCommitInProgress, statePath } from './tracking/store.ts'
import {
  WordcountError, buildProjectWordcountRecord, chapterSourceDigests, chapterSourceSnapshot, decodeUtf8,
  evaluateWordcount, findChapterFile, require, requireChapterSourcesUnchanged, targetFromOutline,
  validateExpectedSourceDigests, type WordcountRecord, type WordcountResult,
} from './wordcount.ts'

/** Schema of {@link chapterCheck} results. */
export const CHAPTER_CHECK_SCHEMA = 'story-chapter-check/v1'
/** Schema of {@link chapterSnapshot} results. */
export const CHAPTER_SNAPSHOT_SCHEMA = 'story-chapter-snapshot/v1'

/** One finding row of the quality report; checker findings carry their file, tool failures do not. */
export type QualityRow = Readonly<Record<string, unknown>> & { readonly source: string; readonly type: string }

/** The deterministic quality report of one chapter body. */
export interface QualityReport {
  readonly status: 'pass' | 'fail'
  readonly blocking_findings: readonly QualityRow[]
  readonly advisories: readonly QualityRow[]
}

/** The outline readiness report. */
export interface OutlineReadiness {
  readonly status: 'pass' | 'fail'
  readonly failures: readonly unknown[]
}

/** Everything a chapter check reports. */
export interface ChapterCheck {
  schema: string
  chapter: number
  length: WordcountResult
  outline_readiness: OutlineReadiness
  quality: QualityReport
  compression: { readonly mode: string; readonly remove_to_internal_band: { readonly min: number; readonly max: number }; readonly remove_to_user_band: { readonly min: number; readonly max: number } } | null
  state_revision: number
  outline_sha256: string
  body_sha256: string
  tracking_committed: boolean
  next_chapter_started: boolean
  available_actions: readonly string[]
  wordcount?: WordcountRecord | undefined
}

function punctuationAdvisory(body: string, text: string, project: string | undefined): QualityRow | undefined {
  let policy: 'preserve' | 'normalize-narration' = 'preserve'
  try {
    if (project !== undefined) policy = readProjectPunctuationPolicy(project) ?? 'preserve'
  } catch (error) {
    return { source: 'punctuation', type: 'TOOL_ERROR', message: `normalize-punctuation.js exited 2: ${error instanceof Error ? error.message : String(error)}` }
  }
  const findings = normalizePunctuation(text, { policy, quoteMode: 'keep' }).findings
  if (findings.length === 0) return undefined
  const message = findings.map(finding => `${body}:${String(finding.line)}:${String(finding.column)}: ${finding.type}: ${finding.message}`).join('\n')
  return { source: 'punctuation', type: 'PUNCTUATION_REVIEW', message }
}

/**
 * Run the deterministic checkers over one chapter body.
 * @param outline - the chapter outline path.
 * @param body - the chapter body path.
 * @param project - the book directory supplying the punctuation policy.
 * @returns blocking findings, advisories and the overall status.
 */
export function checkBlockingQuality(outline: string, body: string, project?: string): QualityReport {
  const blocking: QualityRow[] = []
  const advisories: QualityRow[] = []
  let text: string
  try {
    text = readFileSync(body, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    for (const source of ['ai-pattern', 'degeneration', 'punctuation', 'outline-copy']) {
      blocking.push({ type: 'TOOL_ERROR', source, message: `unable to read ${body}: ${message}` })
    }
    return { status: 'fail', blocking_findings: blocking, advisories }
  }
  const sorted = (name: string, findings: readonly CheckFinding[]): void => {
    for (const finding of findings) {
      const row: QualityRow = { source: name, file: body, ...finding }
      ;(finding.severity === 'blocking' ? blocking : advisories).push(row)
    }
  }
  sorted('ai-pattern', scanAiPatterns(text))
  sorted('degeneration', scanDegeneration(text))
  const punctuation = punctuationAdvisory(body, text, project)
  if (punctuation !== undefined) (punctuation.type === 'TOOL_ERROR' ? blocking : advisories).push(punctuation)
  try {
    const copied = checkOutlineCopy(body, outline)
    if (copied.status === 1) advisories.push({ source: 'outline-copy', type: 'OUTLINE_COPY_REVIEW', message: copied.output.trim() })
  } catch (error) {
    blocking.push({ source: 'outline-copy', type: 'TOOL_ERROR', message: `check-outline-copy.js exited 2: ${error instanceof Error ? error.message : String(error)}` })
  }
  if (project !== undefined) {
    try {
      for (const hit of scanChapterQuality(project, outline, body, text)) {
        const row: QualityRow = {
          source: 'chapter-rules',
          type: hit.kind === 'forbidden' ? 'FORBIDDEN' : hit.kind === 'era' ? 'ERA_DENY' : hit.kind === 'cast' ? 'CAST' : 'VOID_TERM',
          severity: hit.severity,
          file: body,
          message: hit.message,
          id: hit.id,
          ...(hit.line === undefined ? {} : { line: hit.line }),
          ...(hit.rule === undefined ? {} : { rule: hit.rule }),
        }
        ;(hit.severity === 'blocking' ? blocking : advisories).push(row)
      }
    } catch (error) {
      blocking.push({ source: 'chapter-rules', type: 'TOOL_ERROR', message: `chapter rules scan failed: ${error instanceof Error ? error.message : String(error)}` })
    }
  }
  return { status: blocking.length > 0 ? 'fail' : 'pass', blocking_findings: blocking, advisories }
}

/**
 * Check one chapter: length against its outline target, outline readiness and deterministic quality.
 * @param project - the book directory.
 * @param chapter - the chapter number.
 * @returns the check with the actions it allows.
 * @throws WordcountError or TrackingError when files are missing, ambiguous or change during the check.
 */
export function chapterCheck(project: string, chapter: number): ChapterCheck {
  const state = loadState(project)
  const snapshot = chapterSourceSnapshot(project, chapter)
  const { outline, body: bodyPath } = snapshot.paths
  let target: number
  let body: string
  try {
    target = targetFromOutline(decodeUtf8(snapshot.contents.outline))
    body = decodeUtf8(snapshot.contents.body)
  } catch (error) {
    if (error instanceof WordcountError) throw error
    throw new WordcountError(`unable to decode chapter files: ${error instanceof Error ? error.message : String(error)}`)
  }
  const length = evaluateWordcount(body, target, { chapter })
  const outlineReport = verifyOutline(outline)
  const outlineReadiness: OutlineReadiness = { status: outlineReport.ok ? 'pass' : 'fail', failures: outlineReport.failures }
  const quality = checkBlockingQuality(outline, bodyPath, project)
  const lengthOk = length.status === 'internal_pass' || length.status === 'borderline'
  let actions: string[]
  if (outlineReadiness.status !== 'pass' || quality.status !== 'pass' || length.status === 'invalid') actions = []
  else if (lengthOk) actions = ['commit']
  else if (length.status === 'over') actions = ['compress-once', 'accept-current-length', 'revise-outline-or-target', 'discard']
  else actions = ['accept-current-length', 'revise-outline-or-target', 'discard']
  requireChapterSourcesUnchanged(project, chapter, snapshot)
  require(loadState(project).state_revision === state.state_revision, 'tracking state changed during check; reload context and check again')
  let compression: ChapterCheck['compression'] = null
  if (length.status === 'over' && quality.status === 'pass' && length.actual !== null && length.internal_band !== null && length.user_band !== null) {
    const actual = length.actual
    compression = {
      mode: 'single_pass_remove_only',
      remove_to_internal_band: { min: actual - length.internal_band.max, max: actual - length.internal_band.min },
      remove_to_user_band: { min: actual - length.user_band.max, max: actual - length.user_band.min },
    }
  }
  const digests = chapterSourceDigests(snapshot)
  return {
    schema: CHAPTER_CHECK_SCHEMA,
    chapter,
    length,
    outline_readiness: outlineReadiness,
    quality,
    compression,
    state_revision: state.state_revision,
    outline_sha256: digests.outline_sha256,
    body_sha256: digests.body_sha256,
    tracking_committed: state.last_committed_chapter >= chapter,
    next_chapter_started: state.last_committed_chapter > chapter,
    available_actions: actions,
  }
}

function readJsonObject(path: string, label: string): Record<string, unknown> {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new WordcountError(`unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`)
  }
  require(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be an object`)
  return value as Record<string, unknown>
}

/**
 * Commit one checked chapter through its tracking transaction.
 * @param project - the book directory.
 * @param chapter - the chapter number.
 * @param inputPath - the transaction JSON file.
 * @param acceptCurrentLength - whether an out-of-band length is explicitly accepted.
 * @returns the check extended with the persisted wordcount record.
 */
export function chapterCommit(project: string, chapter: number, inputPath: string, acceptCurrentLength: boolean): ChapterCheck {
  const checked = chapterCheck(project, chapter)
  require(checked.outline_readiness.status === 'pass', 'outline readiness findings must be fixed before commit')
  require(checked.quality.status === 'pass', 'blocking quality findings must be fixed before commit')
  const lengthStatus = checked.length.status
  const inUserBand = lengthStatus === 'internal_pass' || lengthStatus === 'borderline'
  let resolution: string
  if (acceptCurrentLength) {
    require(lengthStatus === 'under' || lengthStatus === 'over', 'accept-current-length requires a valid out-of-band chapter')
    resolution = 'accepted_current_length'
  } else {
    require(inUserBand, 'chapter length is outside the user band; use accept-current-length or revise it')
    resolution = 'within_user_band'
  }
  const document = readJsonObject(inputPath, 'tracking transaction')
  require(document.chapter === chapter, 'tracking transaction chapter does not match command')
  require(!Object.hasOwn(document, 'wordcount'), 'tracking transaction must not provide wordcount')
  require(document.expected_state_revision === checked.state_revision, 'tracking state changed since this transaction was prepared')
  const digests = { body_sha256: checked.body_sha256, outline_sha256: checked.outline_sha256 }
  validateExpectedSourceDigests(document, digests)
  // Bind this check to the locked transaction even on the ordinary direct path.
  document.expected_body_sha256 = digests.body_sha256
  document.expected_outline_sha256 = digests.outline_sha256
  document.wordcount = buildProjectWordcountRecord(project, chapter, resolution)
  const { state } = applyTransaction(project, document)
  checked.tracking_committed = state.last_committed_chapter >= chapter
  checked.next_chapter_started = state.last_committed_chapter > chapter
  checked.wordcount = state.wordcount_records[String(chapter)]
  return checked
}

/** Source identity of one chapter for workflow stages to compare. */
export interface ChapterSnapshot {
  readonly schema: string
  readonly chapter: number
  readonly body_path: string
  readonly outline_path: string
  readonly state_revision: number
  readonly outline_sha256: string
  readonly body_sha256?: string
  readonly file_versions: Readonly<Record<string, readonly string[]>>
}

function fileVersion(path: string): string[] {
  const stat = statSync(path, { bigint: true })
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(part => part.toString())
}

/**
 * Capture the identity of a chapter's sources and tracking revision without writing.
 * @param project - the book directory.
 * @param chapter - the chapter number.
 * @param outlineOnly - capture only the prepared outline before a body exists.
 * @returns paths, digests, file versions and the state revision.
 * @throws TrackingError or WordcountError when tracking is missing, a commit is in progress, or files change.
 */
export function chapterSnapshot(project: string, chapter: number, outlineOnly = false): ChapterSnapshot {
  const stateFile = statePath(project)
  requireTracking(existsSync(stateFile), `file does not exist: ${stateFile}`)
  requireTracking(!projectCommitInProgress(project), 'tracking commit is in progress; retry after it finishes')
  const before = readFileSync(stateFile)
  const state = normalizeState(JSON.parse(before.toString('utf8')))
  if (outlineOnly) {
    const outlinePath = findChapterFile(join(project, '大纲'), chapter, { outline: true })
    const bodyPath = findChapterFile(join(project, '正文'), chapter, { outline: false, allowMissing: true })
    const collect = (): { version: string[]; content: Buffer } => ({ version: fileVersion(outlinePath), content: readFileSync(outlinePath) })
    const source = collect()
    const same = (): boolean => {
      const again = collect()
      return again.content.equals(source.content) && again.version.every((part, index) => part === source.version[index])
    }
    require(same(), 'outline changed while collecting source identity')
    require(same(), 'outline changed during source identity check')
    require(!projectCommitInProgress(project) && readFileSync(stateFile).equals(before), 'tracking changed during source identity check')
    return {
      schema: CHAPTER_SNAPSHOT_SCHEMA, chapter, body_path: bodyPath, outline_path: outlinePath,
      state_revision: state.state_revision,
      outline_sha256: createHash('sha256').update(source.content).digest('hex'),
      file_versions: { outline: source.version },
    }
  }
  const source = chapterSourceSnapshot(project, chapter)
  requireChapterSourcesUnchanged(project, chapter, source)
  require(!projectCommitInProgress(project) && readFileSync(stateFile).equals(before), 'tracking changed during source identity check')
  const digests = chapterSourceDigests(source)
  return {
    schema: CHAPTER_SNAPSHOT_SCHEMA, chapter, body_path: source.paths.body, outline_path: source.paths.outline,
    state_revision: state.state_revision,
    outline_sha256: digests.outline_sha256, body_sha256: digests.body_sha256,
    file_versions: { outline: source.versions.outline, body: source.versions.body },
  }
}

