/** Browser entry and game workbench views. */
import './plugin.css'
export { apply, name, inject } from './sidebar.tsx'
export { GameStudio } from './studio.tsx'
export { createGameStore, type GameMemory } from './state.ts'
export { MarkdownPreview, parseMarkdownBlocks, type MarkdownBlock } from './markdown-preview.tsx'
export { jsonStringPrefix, runningRootCalls, fileMutations, mutatingCallIds, latestSettledMutation, streamingAssistant, type FileMutationActivity, type MutationToolName } from './activity.ts'
