/** Transcript card for production tool calls. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { NS } from './locales/index.ts'

function argsOf(block: ToolCallViewProps['block']): Record<string, unknown> {
  // A preparing call has no dispatched arguments; a result pairs them under call.
  const raw = 'kind' in block ? block.call?.argsRaw : block.phase === 'start' ? block.argsRaw : undefined
  try {
    const value: unknown = JSON.parse(raw ?? '{}')
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
  } catch { return {} }
}

function resultOf(block: ToolCallViewProps['block']): string | undefined {
  if (!('kind' in block)) return undefined
  return block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2)).join('\n')
}

type ProductionToolViewProps = ToolCallViewProps & PropsLocale<typeof NS>

/**
 * Render one production tool call with its episode, action, and state.
 * @param props - the tool block, optional inspect action, and translator.
 * @returns the production card.
 */
export function ProductionToolView({ block, inspect, t }: ProductionToolViewProps) {
  const args = argsOf(block)
  const action = typeof args.action === 'string' ? args.action : 'production'
  const episode = typeof args.episode === 'string' ? args.episode : t('production.fallbackEpisode')
  const state = !('kind' in block) ? 'running' : block.isError ? 'error' : 'done'
  return <details className="creative-role" data-state={state}>
    <summary><span>▦ {t('production.view.title')}</span><strong>{episode} · {action}</strong><em>{state === 'running' ? t('production.state.running') : state === 'error' ? t('production.state.error') : t('production.state.applied')}</em></summary>
    {resultOf(block) !== undefined && <pre>{resultOf(block)}</pre>}
    {inspect !== undefined && <button type="button" onClick={inspect}>{t('role.inspect')}</button>}
  </details>
}
