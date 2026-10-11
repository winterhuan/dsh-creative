/**
 * Code-selected writing context for one chapter: the hot continuity card,
 * every due foreshadow, the characters a draft or outline actually mentions,
 * and the timeline facts those characters are part of.
 *
 * This is the fast inner loop: the context is assembled deterministically from
 * the committed tracking state, so one generation call can follow without a
 * sub-agent chain. Nothing here writes.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { matchesForeshadow } from './tracking/query.ts'
import type { CharacterSnapshot, ForeshadowRow, TimelineRow } from './tracking/schema.ts'
import { loadState, trackingRoot } from './tracking/store.ts'

/** Schema of {@link buildContext} results. */
export const CONTEXT_SCHEMA = 'story-context/v1'
/** Largest encoded context bundle; lower-priority sections are omitted first. */
export const CONTEXT_BUNDLE_MAX_BYTES = 16_384

/** One character name found in the scanned text. */
export interface Mention {
  readonly name: string
  readonly count: number
  readonly first_line: number
}

/** Options of {@link buildContext}. */
export interface ContextOptions {
  /** The chapter being written; defaults to the next uncommitted chapter. */
  readonly chapter?: number
  /** Text to scan for character mentions (draft, outline or instructions). */
  readonly text?: string
}

/** The context bundle. */
export interface ContextBundle {
  readonly schema: string
  readonly book_title: string
  readonly state_revision: number
  readonly through_chapter: number
  readonly chapter: number
  readonly hot_context: string
  readonly position: unknown
  readonly next_chapter_commitments: readonly string[]
  readonly continuity_risks: readonly string[]
  readonly long_term_constraints: readonly string[]
  readonly mentions: readonly Mention[]
  readonly characters: readonly { readonly name: string; readonly selected_by: 'active' | 'mention'; readonly snapshot: CharacterSnapshot }[]
  readonly due_foreshadow: readonly ForeshadowRow[]
  readonly timeline: readonly TimelineRow[]
  readonly omitted: { readonly characters: number; readonly due_foreshadow: number; readonly timeline: number }
}

/**
 * Count every occurrence of each name in a text, longest names first so a
 * name that contains another is not double counted.
 * @param text - the text to scan.
 * @param names - character names from the tracking state.
 * @returns mentions in order of first appearance.
 */
export function scanMentions(text: string, names: readonly string[]): Mention[] {
  const found = new Map<string, { count: number; first: number }>()
  const masked = text.split('')
  for (const name of [...names].sort((a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0))) {
    if (name === '') continue
    const haystack = masked.join('')
    let index = haystack.indexOf(name)
    while (index !== -1) {
      const entry = found.get(name) ?? { count: 0, first: index }
      entry.count += 1
      found.set(name, entry)
      for (let position = index; position < index + name.length; position += 1) masked[position] = '\u0000'
      index = haystack.indexOf(name, index + name.length)
    }
  }
  const lineOf = (offset: number): number => text.slice(0, offset).split('\n').length
  return [...found.entries()]
    .sort((a, b) => a[1].first - b[1].first)
    .map(([name, entry]) => ({ name, count: entry.count, first_line: lineOf(entry.first) }))
}

function encodedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

/**
 * Assemble the writing context of one chapter from committed tracking.
 * @param project - the book directory.
 * @param options - the chapter and the text to scan for mentions.
 * @returns the bundle, trimmed to {@link CONTEXT_BUNDLE_MAX_BYTES} with omission counts.
 */
export function buildContext(project: string, options: ContextOptions = {}): ContextBundle {
  const state = loadState(project)
  const chapter = options.chapter ?? state.last_committed_chapter + 1
  const hotContext = readFileSync(join(trackingRoot(project), '上下文.md'), 'utf8')
  const names = Object.keys(state.characters)
  const mentions = options.text === undefined ? [] : scanMentions(options.text, names)
  const mentioned = new Set(mentions.map(mention => mention.name))
  const active = new Set(state.context.active_character_names)
  // Active characters first in the card's order, then the rest in order of first mention.
  const characters = [
    ...state.context.active_character_names.map(name => ({ name, selected_by: 'active' as const, snapshot: state.characters[name] as CharacterSnapshot })),
    ...mentions.filter(mention => !active.has(mention.name)).map(mention => ({ name: mention.name, selected_by: 'mention' as const, snapshot: state.characters[mention.name] as CharacterSnapshot })),
  ]
  const dueForeshadow = Object.values(state.foreshadow)
    .filter(row => matchesForeshadow(row, 'due', chapter))
    .sort((a, b) => (a.planned_resolution_chapter ?? Infinity) - (b.planned_resolution_chapter ?? Infinity) || (a.id < b.id ? -1 : 1))
  const timeline = Object.values(state.timeline)
    .filter(row => row.characters.some(name => active.has(name) || mentioned.has(name)))
    .sort((a, b) => a.first_recorded_chapter - b.first_recorded_chapter || (a.id < b.id ? -1 : 1))
  const bundle = {
    schema: CONTEXT_SCHEMA,
    book_title: state.book_title,
    state_revision: state.state_revision,
    through_chapter: state.last_committed_chapter,
    chapter,
    hot_context: hotContext,
    position: state.context.position,
    next_chapter_commitments: state.context.next_chapter_commitments,
    continuity_risks: state.context.continuity_risks,
    long_term_constraints: state.context.long_term_constraints,
    mentions,
    characters,
    due_foreshadow: dueForeshadow,
    timeline,
    omitted: { characters: 0, due_foreshadow: 0, timeline: 0 },
  }
  // Trim the least decision-relevant section first; due foreshadow is the writer's obligation list and goes last.
  const trimmed = { ...bundle, characters: [...characters], due_foreshadow: [...dueForeshadow], timeline: [...timeline], omitted: { ...bundle.omitted } }
  while (encodedBytes(trimmed) > CONTEXT_BUNDLE_MAX_BYTES) {
    if (trimmed.timeline.length > 0) { trimmed.timeline.pop(); trimmed.omitted.timeline += 1; continue }
    if (trimmed.characters.length > 0) { trimmed.characters.pop(); trimmed.omitted.characters += 1; continue }
    if (trimmed.due_foreshadow.length > 0) { trimmed.due_foreshadow.pop(); trimmed.omitted.due_foreshadow += 1; continue }
    break
  }
  return trimmed
}
