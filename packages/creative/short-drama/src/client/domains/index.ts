/** Short-drama domain registration. */
import { dramaDomain } from './drama.tsx'
import type { WorkbenchDomain, StudioDomain } from './types.ts'
export type { EditorDomain, StudioDomain, StudioProps, WorkbenchDomain } from './types.ts'
export { useDramaProduction } from './drama.tsx'
export const WORKBENCH_DOMAINS: Record<'drama', WorkbenchDomain> = { drama: dramaDomain }
export const WORKBENCH_MODES = ['drama'] as const
export const STUDIO_DOMAINS: readonly StudioDomain[] = []
