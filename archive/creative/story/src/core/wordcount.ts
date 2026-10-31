/**
 * Deterministic wordcount core shared by chapter checks and tracking commits.
 *
 * Port of `tests/reference/wordcount_core.py`: the `visible_chars_v1` metric, target
 * bands, outline target parsing, chapter file resolution and source-identity
 * snapshots. Results keep the Python field names so the CLI JSON stays
 * byte-compatible while both implementations coexist.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { paddedChapterNumber } from './chapter-names.ts'

/** Schema of {@link evaluateWordcount} results. */
export const WORDCOUNT_SCHEMA = 'story-wordcount-result/v1'
/** Schema of {@link measureWordcount} results. */
export const MEASUREMENT_SCHEMA = 'story-wordcount-measurement/v1'
/** Schema of {@link checkpointWordcount} results. */
export const CHECKPOINT_SCHEMA = 'story-wordcount-checkpoint/v1'
/** The only supported wordcount metric. */
export const METRIC = 'visible_chars_v1'
/** Resolutions a committed wordcount record may carry. */
export const RESOLUTIONS: readonly string[] = ['within_user_band', 'accepted_current_length']

function codepointRange(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

const WHITE_SPACE_CODEPOINTS = new Set<number>([
  ...codepointRange(0x0009, 0x000d),
  0x0020, 0x0085, 0x00a0, 0x1680, ...codepointRange(0x2000, 0x200a),
  0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
])
const FRONTMATTER_KEY_RE = /^[A-Za-z_㐀-鿿][^:\n]{0,80}:[ \t]*(?:.*)$/
const LEADING_BLANK_RE = /^[\u0009 　]*$/
const ATX_HEADING_RE = /^[\u0009 ]{0,3}#{1,6}[\u0009 ]+\S/
const POSITIVE_INTEGER_RE = /^[1-9]\d*$/
const TARGET_LINE_RE = /^[ \t>*-]*字数目标[ \t]*[:：][ \t]*([1-9]\d*)[ \t]*(?:字)?[ \t]*$/gm
const METRIC_LINE_RE = /^[ \t>*-]*字数口径[ \t]*[:：][ \t]*([A-Za-z0-9_-]+)[ \t]*$/gm
const SHA256_RE = /^[0-9a-f]{64}$/

/** Expected deterministic wordcount contract failure. */
export class WordcountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WordcountError'
  }
}

/**
 * Raise a {@link WordcountError} when a contract condition fails.
 * @param condition - the condition that must hold.
 * @param message - the failure reported to the caller.
 */
export function require(condition: boolean, message: string): asserts condition {
  if (!condition) throw new WordcountError(message)
}

/** An inclusive wordcount band. */
export interface WordcountBand {
  readonly min: number
  readonly max: number
}

/** A band with the evaluated pass/fail status of one chapter. */
export interface WordcountBandStatus extends WordcountBand {
  readonly status: 'pass' | 'fail'
}

/** Status of an evaluated chapter length. */
export type WordcountStatus = 'internal_pass' | 'borderline' | 'under' | 'over' | 'invalid'

/** One evaluated chapter length (`story-wordcount-result/v1`). */
export interface WordcountResult {
  readonly schema: string
  readonly metric: string
  readonly chapter: number | null
  readonly case_id: string | null
  readonly target: number | null
  readonly actual: number | null
  readonly internal_band: WordcountBandStatus | null
  readonly user_band: WordcountBandStatus | null
  readonly signed_error_pct: number | null
  readonly absolute_error_pct: number | null
  readonly status: WordcountStatus
  readonly invalid_reason: string | null
}

/** One measured chapter length without a target (`story-wordcount-measurement/v1`). */
export interface MeasurementResult {
  readonly schema: string
  readonly metric: string
  readonly chapter: number | null
  readonly case_id: string | null
  readonly actual: number
  readonly status: 'measured'
  readonly invalid_reason: null
}

/** Remaining length toward the user band (`story-wordcount-checkpoint/v1`). */
export interface CheckpointResult {
  readonly schema: string
  readonly metric: string
  readonly chapter: number | null
  readonly case_id: string | null
  readonly target: number
  readonly actual: number
  readonly user_band: WordcountBand
  readonly remaining_user_range: WordcountBand
}

/** The wordcount record a tracking transaction persists for one chapter. */
export interface WordcountRecord {
  readonly metric: string
  readonly target: number
  readonly actual: number
  readonly status: WordcountStatus
  readonly resolution: string
  readonly body_sha256: string
}

/** Exact bytes and file identities of one chapter's outline and body. */
export interface ChapterSourceSnapshot {
  readonly paths: { readonly outline: string; readonly body: string }
  readonly contents: { readonly outline: Buffer; readonly body: Buffer }
  /** `[dev, ino, size, mtimeNs, ctimeNs]` as decimal strings. */
  readonly versions: { readonly outline: readonly string[]; readonly body: readonly string[] }
}

/** Chapter and case identity options shared by the evaluation entry points. */
export interface WordcountIdentity {
  readonly chapter?: number | null
  readonly caseId?: string | null
}

/**
 * Normalize CRLF and CR line endings to LF.
 * @param value - raw text.
 * @returns the LF-only text.
 */
export function normalizeNewlines(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

/**
 * Drop a leading YAML front matter block when it has a closing marker within
 * 200 lines and at least one key-like line.
 * @param value - LF-normalized text.
 * @returns the text without the recognized front matter.
 */
export function stripRecognizableFrontmatter(value: string): string {
  const lines = value.split('\n')
  if (lines.length === 0 || lines[0] !== '---') return value
  let closing = -1
  for (let index = 1; index < Math.min(lines.length, 201); index += 1) {
    const line = lines[index]
    if (line === '---' || line === '...') { closing = index; break }
  }
  if (closing < 2 || !lines.slice(1, closing).some(line => FRONTMATTER_KEY_RE.test(line))) return value
  return lines.slice(closing + 1).join('\n')
}

/**
 * Reduce a chapter body to the text the metric counts: no BOM, no recognized
 * front matter, no leading blank lines and no leading ATX heading.
 * @param value - raw chapter text.
 * @returns the visible body.
 */
export function visibleBody(value: string): string {
  let text = normalizeNewlines(value)
  if (text.startsWith('﻿')) text = text.slice(1)
  const lines = stripRecognizableFrontmatter(text).split('\n')
  while (lines.length > 0 && LEADING_BLANK_RE.test(lines[0] ?? '')) lines.shift()
  if (lines.length > 0 && ATX_HEADING_RE.test(lines[0] ?? '')) lines.shift()
  return lines.join('\n')
}

/**
 * Count the `visible_chars_v1` metric: every code point of the visible body
 * that is not whitespace.
 * @param value - raw chapter text.
 * @returns the visible character count.
 */
export function countVisibleChars(value: string): number {
  let count = 0
  for (const character of visibleBody(value)) {
    if (!WHITE_SPACE_CODEPOINTS.has(character.codePointAt(0) ?? 0)) count += 1
  }
  return count
}

/**
 * Parse a positive integer target within `Number.MAX_SAFE_INTEGER`.
 * @param value - the raw target, usually a string from the CLI or outline.
 * @returns the target.
 * @throws WordcountError when the value is not a positive safe integer.
 */
export function parseTarget(value: unknown): number {
  const raw = value === undefined || value === null ? '' : String(value)
  if (!POSITIVE_INTEGER_RE.test(raw)) throw new WordcountError('target must be a positive integer')
  const target = Number(raw)
  require(target <= Number.MAX_SAFE_INTEGER, 'target exceeds Number.MAX_SAFE_INTEGER')
  return target
}

function bandBound(target: number, percent: number, roundUp: boolean): number {
  const scaled = BigInt(target) * BigInt(percent) + (roundUp ? 99n : 0n)
  return Number(scaled / 100n)
}

/**
 * Compute the internal (88–112%) and user (85–115%) bands around a target.
 * @param value - the raw target.
 * @returns both inclusive bands.
 */
export function computeWordcountBands(value: unknown): { readonly internal: WordcountBand; readonly user: WordcountBand } {
  const target = parseTarget(value)
  return {
    internal: { min: bandBound(target, 88, true), max: bandBound(target, 112, false) },
    user: { min: bandBound(target, 85, true), max: bandBound(target, 115, false) },
  }
}

/**
 * Build the invalid-result record for a failed evaluation.
 * @param reason - the `invalid_reason` code.
 * @param fields - identity and any values resolved before the failure.
 * @returns the invalid result.
 */
export function invalidWordcountResult(
  reason: string,
  fields: WordcountIdentity & { readonly target?: number | null; readonly actual?: number | null } = {},
): WordcountResult {
  return {
    schema: WORDCOUNT_SCHEMA, metric: METRIC, chapter: fields.chapter ?? null, case_id: fields.caseId ?? null,
    target: fields.target ?? null, actual: fields.actual ?? null, internal_band: null, user_band: null,
    signed_error_pct: null, absolute_error_pct: null,
    status: 'invalid', invalid_reason: reason,
  }
}

/**
 * Measure a chapter body without a target.
 * @param value - raw chapter text.
 * @param identity - chapter and case identity echoed into the result.
 * @returns the measurement.
 */
export function measureWordcount(value: string, identity: WordcountIdentity = {}): MeasurementResult {
  return {
    schema: MEASUREMENT_SCHEMA, metric: METRIC, chapter: identity.chapter ?? null,
    case_id: identity.caseId ?? null, actual: countVisibleChars(value), status: 'measured', invalid_reason: null,
  }
}

/**
 * Evaluate a chapter body against a target and its bands.
 * @param value - raw chapter text.
 * @param targetValue - the raw target.
 * @param identity - chapter and case identity echoed into the result.
 * @returns the evaluation, or an invalid result for a bad target or empty body.
 */
export function evaluateWordcount(value: string, targetValue: unknown, identity: WordcountIdentity = {}): WordcountResult {
  let target: number
  try {
    target = parseTarget(targetValue)
  } catch (error) {
    if (!(error instanceof WordcountError)) throw error
    return invalidWordcountResult('INVALID_TARGET', identity)
  }
  const actual = countVisibleChars(value)
  if (actual === 0) return invalidWordcountResult('EMPTY_BODY', { ...identity, target, actual })
  const bands = computeWordcountBands(target)
  const internalPass = bands.internal.min <= actual && actual <= bands.internal.max
  const userPass = bands.user.min <= actual && actual <= bands.user.max
  const status: WordcountStatus = internalPass ? 'internal_pass'
    : userPass ? 'borderline' : actual < bands.user.min ? 'under' : 'over'
  const signedError = (actual - target) / target
  return {
    schema: WORDCOUNT_SCHEMA, metric: METRIC, chapter: identity.chapter ?? null, case_id: identity.caseId ?? null,
    target, actual,
    internal_band: { ...bands.internal, status: internalPass ? 'pass' : 'fail' },
    user_band: { ...bands.user, status: userPass ? 'pass' : 'fail' },
    signed_error_pct: signedError, absolute_error_pct: Math.abs(signedError),
    status, invalid_reason: null,
  }
}

/**
 * Report how much length remains toward the user band.
 * @param value - raw chapter text.
 * @param targetValue - the raw target.
 * @param identity - chapter and case identity echoed into the result.
 * @returns the checkpoint.
 * @throws WordcountError when the target is invalid.
 */
export function checkpointWordcount(value: string, targetValue: unknown, identity: WordcountIdentity = {}): CheckpointResult {
  const target = parseTarget(targetValue)
  const actual = countVisibleChars(value)
  const user = computeWordcountBands(target).user
  return {
    schema: CHECKPOINT_SCHEMA, metric: METRIC, chapter: identity.chapter ?? null, case_id: identity.caseId ?? null,
    target, actual, user_band: user,
    remaining_user_range: { min: Math.max(0, user.min - actual), max: Math.max(0, user.max - actual) },
  }
}

function uniqueCaptures(text: string, pattern: RegExp): string[] {
  return [...new Set([...text.matchAll(pattern)].map(match => match[1] ?? ''))]
}

/**
 * Read the single `字数目标` and `字数口径` declarations of an outline.
 * @param value - outline text.
 * @returns the declared target.
 * @throws WordcountError unless exactly one target and the supported metric appear.
 */
export function targetFromOutline(value: string): number {
  let text = normalizeNewlines(value)
  if (text.startsWith('﻿')) text = text.slice(1)
  const targets = uniqueCaptures(text, TARGET_LINE_RE)
  const metrics = uniqueCaptures(text, METRIC_LINE_RE)
  require(targets.length === 1, '字数目标 must appear exactly once with one value')
  require(metrics.length === 1 && metrics[0] === METRIC, `字数口径 must appear exactly once as ${METRIC}`)
  return parseTarget(targets[0])
}

function chapterNumberFromName(name: string, outline: boolean): number | null {
  const match = (outline ? /^细纲_第0*(\d+)章.*\.md$/ : /^第0*(\d+)章(?:[_\- 　].*)?\.md$/).exec(name)
  return match === null ? null : Number(match[1])
}

function isDirectory(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true
}

/**
 * Resolve one chapter's outline or body file; preparation may ask for the
 * proposed path of a missing file.
 * @param directory - the `大纲` or `正文` directory.
 * @param chapter - the 1-based chapter number.
 * @param options - whether an outline is wanted and whether a missing file is acceptable.
 * @returns the unique matching path, or the canonical missing path when allowed.
 * @throws WordcountError for an invalid chapter, a missing directory or an ambiguous match.
 */
export function findChapterFile(directory: string, chapter: number, options: { readonly outline: boolean; readonly allowMissing?: boolean }): string {
  require(Number.isInteger(chapter) && chapter >= 1, 'chapter must be >= 1')
  const allowMissing = options.allowMissing === true
  const exists = statSync(directory, { throwIfNoEntry: false }) !== undefined
  require(isDirectory(directory) || (allowMissing && !exists && isDirectory(dirname(directory))),
    `chapter directory is missing: ${directory}`)
  const matches = isDirectory(directory)
    ? readdirSync(directory)
      .map(name => join(directory, name))
      .filter(path => statSync(path, { throwIfNoEntry: false })?.isFile() === true
        && chapterNumberFromName(path.slice(directory.length + 1), options.outline) === chapter)
      .sort()
    : []
  if (allowMissing && matches.length === 0) {
    return join(directory, `${options.outline ? '细纲_' : ''}第${paddedChapterNumber(chapter)}章.md`)
  }
  const label = options.outline ? 'outline' : 'body'
  const names = matches.map(path => path.slice(directory.length + 1)).join(', ')
  require(matches.length === 1,
    `chapter ${chapter} must have exactly one ${label} file in ${directory}; found: ${names || '(none)'}`)
  return matches[0] ?? ''
}

function fileVersion(path: string): string[] {
  const stat = statSync(path, { bigint: true })
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(part => part.toString())
}

function sameVersions(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index])
}

/**
 * Read exact source bytes of a chapter's outline and body, rejecting
 * replacement or edits during collection.
 * @param project - the book directory.
 * @param chapter - the 1-based chapter number.
 * @returns the snapshot with paths, contents and file versions.
 * @throws WordcountError when a file is missing, ambiguous or changes while reading.
 */
export function chapterSourceSnapshot(project: string, chapter: number): ChapterSourceSnapshot {
  const root = realpathSync(project)
  const paths = {
    outline: findChapterFile(join(root, '大纲'), chapter, { outline: true }),
    body: findChapterFile(join(root, '正文'), chapter, { outline: false }),
  }
  try {
    const before = { outline: fileVersion(paths.outline), body: fileVersion(paths.body) }
    const contents = { outline: readFileSync(paths.outline), body: readFileSync(paths.body) }
    const after = { outline: fileVersion(paths.outline), body: fileVersion(paths.body) }
    require(sameVersions(before.outline, after.outline) && sameVersions(before.body, after.body),
      'chapter files changed while reading; check and review again')
    return { paths, contents, versions: before }
  } catch (error) {
    if (error instanceof WordcountError) throw error
    throw new WordcountError(`unable to read chapter files: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * SHA-256 digests of the snapshot contents.
 * @param snapshot - a chapter source snapshot.
 * @returns the outline and body digests.
 */
export function chapterSourceDigests(snapshot: ChapterSourceSnapshot): { readonly outline_sha256: string; readonly body_sha256: string } {
  return {
    outline_sha256: createHash('sha256').update(snapshot.contents.outline).digest('hex'),
    body_sha256: createHash('sha256').update(snapshot.contents.body).digest('hex'),
  }
}

/**
 * Require that a chapter's sources still match an earlier snapshot.
 * @param project - the book directory.
 * @param chapter - the 1-based chapter number.
 * @param snapshot - the earlier snapshot.
 * @throws WordcountError when paths, bytes or file versions differ.
 */
export function requireChapterSourcesUnchanged(project: string, chapter: number, snapshot: ChapterSourceSnapshot): void {
  const current = chapterSourceSnapshot(project, chapter)
  const unchanged = current.paths.outline === snapshot.paths.outline && current.paths.body === snapshot.paths.body
    && current.contents.outline.equals(snapshot.contents.outline) && current.contents.body.equals(snapshot.contents.body)
    && sameVersions(current.versions.outline, snapshot.versions.outline)
    && sameVersions(current.versions.body, snapshot.versions.body)
  require(unchanged, 'chapter files changed during validation; check and review again')
}

/**
 * Validate any `expected_*_sha256` fields a transaction carries against the current digests.
 * @param document - the transaction document.
 * @param digests - current digests keyed like {@link chapterSourceDigests}.
 * @throws WordcountError for a malformed or stale expected digest.
 */
export function validateExpectedSourceDigests(document: Readonly<Record<string, unknown>>, digests: Readonly<Record<string, string>>): void {
  for (const [name, current] of Object.entries(digests)) {
    const key = `expected_${name}`
    if (!Object.hasOwn(document, key)) continue
    const value = document[key]
    require(typeof value === 'string' && SHA256_RE.test(value), `${key} is invalid`)
    require(value === current, `${key} is stale; check and review the current files again`)
  }
}

/**
 * Build the wordcount record for the chapter as it exists on disk.
 * @param project - the book directory.
 * @param chapter - the 1-based chapter number.
 * @param resolution - how the length was accepted.
 * @returns the record bound to the current body digest.
 * @throws WordcountError when the length is invalid or disagrees with the resolution.
 */
export function buildProjectWordcountRecord(project: string, chapter: number, resolution: string): WordcountRecord {
  require(RESOLUTIONS.includes(resolution), `unsupported wordcount resolution: ${resolution}`)
  const snapshot = chapterSourceSnapshot(project, chapter)
  let target: number
  let body: string
  try {
    target = targetFromOutline(decodeUtf8(snapshot.contents.outline))
    body = decodeUtf8(snapshot.contents.body)
  } catch (error) {
    if (error instanceof WordcountError) throw error
    throw new WordcountError(`unable to decode chapter files: ${error instanceof Error ? error.message : String(error)}`)
  }
  const result = evaluateWordcount(body, target, { chapter })
  require(result.status !== 'invalid', `invalid chapter wordcount: ${String(result.invalid_reason)}`)
  const inUserBand = result.status === 'internal_pass' || result.status === 'borderline'
  require(
    (resolution === 'within_user_band' && inUserBand) || (resolution === 'accepted_current_length' && !inUserBand),
    'wordcount resolution does not match the current length',
  )
  return {
    metric: METRIC, target: result.target ?? target, actual: result.actual ?? 0, status: result.status,
    resolution, body_sha256: chapterSourceDigests(snapshot).body_sha256,
  }
}

/**
 * Decode UTF-8 bytes strictly, as the Python reference does.
 * @param bytes - file bytes.
 * @returns the decoded text.
 */
export function decodeUtf8(bytes: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/**
 * Validate the fields of a persisted wordcount record.
 * @param value - the raw record.
 * @returns the validated record.
 * @throws WordcountError for unknown fields or inconsistent status and resolution.
 */
export function normalizeWordcountRecord(value: unknown): WordcountRecord {
  require(typeof value === 'object' && value !== null && !Array.isArray(value), 'wordcount record must be an object')
  const record = value as Readonly<Record<string, unknown>>
  const expectedKeys = ['metric', 'target', 'actual', 'status', 'resolution', 'body_sha256']
  const keys = Object.keys(record)
  require(keys.length === expectedKeys.length && expectedKeys.every(key => Object.hasOwn(record, key)), 'wordcount record fields are invalid')
  require(record.metric === METRIC, 'wordcount metric is unsupported')
  const target = parseTarget(record.target)
  const actual = record.actual
  require(typeof actual === 'number' && Number.isInteger(actual) && actual >= 1, 'wordcount actual is invalid')
  const expected = evaluateWordcount('字'.repeat(actual), target)
  require(record.status === expected.status, 'wordcount status does not match target and actual')
  const resolution = record.resolution
  require(typeof resolution === 'string' && RESOLUTIONS.includes(resolution), 'wordcount resolution is unsupported')
  const inUserBand = expected.status === 'internal_pass' || expected.status === 'borderline'
  require((resolution === 'within_user_band') === inUserBand, 'wordcount resolution does not match status')
  const digest = record.body_sha256
  require(typeof digest === 'string' && SHA256_RE.test(digest), 'body_sha256 is invalid')
  return { metric: METRIC, target, actual, status: expected.status, resolution, body_sha256: digest }
}

/**
 * Validate a wordcount record against the chapter as it exists on disk.
 * @param project - the book directory.
 * @param chapter - the 1-based chapter number.
 * @param value - the raw record.
 * @returns the validated record.
 * @throws WordcountError when the record is malformed or stale.
 */
export function validateCurrentWordcountRecord(project: string, chapter: number, value: unknown): WordcountRecord {
  const record = normalizeWordcountRecord(value)
  const current = buildProjectWordcountRecord(project, chapter, record.resolution)
  require(
    record.metric === current.metric && record.target === current.target && record.actual === current.actual
    && record.status === current.status && record.resolution === current.resolution && record.body_sha256 === current.body_sha256,
    'wordcount record is stale for the current body or target',
  )
  return record
}
