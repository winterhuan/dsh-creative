/**
 * Per-project default agent preset, browser half. Two registrations over one
 * shared controller: a row in each session's "..." menu that opens the project
 * default dialog, and the dialog itself in the frame-wide overlay layer so it
 * outlives the row menu. Both appear only while the Host serves this plugin's
 * settings namespace, so a deployment without the Host half shows no trace.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the ctx.remote merge (agentPresets, settings) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the ctx.workspaces service merge.
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
// Type-only: pulls the ctx.locale service merge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ctx.slots service merge.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the session-menu SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: pulls the shell.overlay SlotMap merge.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the ctx.configForms service merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ProjectDefaultController, PROJECT_DEFAULT_MODE_NS } from './controller.ts'
import { ProjectDefaultDialog, ProjectDefaultMenuItem } from './ProjectDefault.tsx'
import { en, zh, type ProjectDefaultModeKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Per-project default-mode copy. */
    'projectDefaultMode': ProjectDefaultModeKey
  }
}

export type { ProjectDefaultMenuInjected, ProjectDefaultMenuProps, ProjectDefaultDialogInjected, ProjectDefaultDialogProps } from './ProjectDefault.tsx'
export type { ProjectDefaultOption, ProjectDefaultState } from './controller.ts'
export { PROJECT_DEFAULT_MODE_NS, ProjectDefaultController, ruleForWorkspace, withRule } from './controller.ts'
export type { ProjectDefaultModeKey } from './locales.ts'

/** Required services (cordis fiber inject). */
export const inject = [
  'slots', 'locale', 'workspaces', 'remote', 'remote.agentPresets', 'configForms',
]

/**
 * Mount the menu row and dialog while the Host serves the rules namespace.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('projectDefaultMode', { zh, en }), 'project-default-mode: dictionaries')
  const controller = new ProjectDefaultController(ctx)
  ctx.effect(() => ctx.configForms.whileServed([PROJECT_DEFAULT_MODE_NS], () => {
    const menu = ctx.slots.inject('sidebar.workspaces.session.menu.item', () => ctx.slots.register({
      name: 'sidebar.workspaces.session.menu.item',
      id: 'project-default-mode',
      // After the shipped pin/rename/fork/archive rows (100–400).
      order: 500,
      locale: 'projectDefaultMode',
      inject: () => ({ open: (sessionId: SessionId) => { void controller.open(sessionId) } }),
    }, ProjectDefaultMenuItem))
    const dialog = ctx.slots.inject('shell.overlay', () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'project-default-mode',
      locale: 'projectDefaultMode',
      inject: () => ({
        hooks: { projectDefault: controller.store },
        select: (preset: string | undefined) => { controller.select(preset) },
        save: () => controller.save(),
        close: () => { controller.close() },
      }),
    }, ProjectDefaultDialog))
    return () => {
      controller.close()
      menu()
      dialog()
    }
  }), 'project-default-mode: surfaces')
}
