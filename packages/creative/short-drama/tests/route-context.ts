import type { Context } from '@deepseek-ai/cordis'

/** Handler type the workspace route registers on the Web server. */
export type RouteHandler = Parameters<Context['webServer']['register']>[0]['handler']

type LookupProvider = NonNullable<ReturnType<Context['typert']['lookups']['get']>>

/** The Context members `registerWorkspaceRoute` reads, typed as supertypes of the real members. */
export interface RouteContextFake {
  effect(execute: () => () => void): unknown
  webServer: { register(route: { handler: RouteHandler }): () => void }
  typert: { lookups: { get(key: string): Pick<LookupProvider, 'resolve'> | undefined } }
  logger(name: string): { error(...args: unknown[]): void }
}

/**
 * Presents a route fake as the plugin Context `registerWorkspaceRoute` accepts.
 * @param fake - the Context members the route reads.
 * @returns the fake viewed as a Context.
 */
export function routeContext(fake: RouteContextFake): Context {
  return fake as Context
}
