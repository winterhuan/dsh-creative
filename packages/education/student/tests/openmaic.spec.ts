import { describe, expect, it } from 'vitest'
import { updateStudy } from '../src/learning/update/index.ts'
import { studyStatus } from '../src/learning/status.ts'
import { effectiveOpenmaicBase, normalizeOpenmaicBase, parseInteractiveLessons, readInteractiveLessons, lessonHttpUrl } from '../src/openmaic.ts'
import { NOW, setup, start } from './fixtures.ts'

const stamp = '2026-10-28T06:00:00.000Z'
const ready = {
  id: 'om-1', status: 'ready', createdAt: stamp, updatedAt: '2026-10-28T06:05:00.000Z',
  title: '凑十', requirement: '用凑十讲 8+7', base: 'http://localhost:3000',
  classroomId: 'room-1', url: 'http://localhost:3000/classroom/room-1',
}

describe('OpenMAIC base and lesson log', () => {
  it('keeps an http origin and rejects credentials, other schemes and queries', () => {
    expect(normalizeOpenmaicBase(' http://localhost:3000/ ')).toBe('http://localhost:3000')
    expect(normalizeOpenmaicBase('http://127.0.0.1:3000/openmaic/')).toBe('http://127.0.0.1:3000/openmaic')
    expect(normalizeOpenmaicBase('')).toBe('')
    expect(normalizeOpenmaicBase('javascript:alert(1)')).toBeUndefined()
    expect(normalizeOpenmaicBase('http://user:secret@localhost:3000')).toBeUndefined()
    expect(normalizeOpenmaicBase('http://localhost:3000/?token=secret')).toBeUndefined()
    expect(lessonHttpUrl('http://localhost:3000/classroom/room-1')).toBe('http://localhost:3000/classroom/room-1')
    expect(lessonHttpUrl('javascript:alert(1)')).toBeUndefined()
  })

  it('prefers a saved base, then the environment, then localhost', () => {
    expect(effectiveOpenmaicBase(undefined, undefined)).toBe('http://localhost:3000')
    expect(effectiveOpenmaicBase('', 'http://10.0.0.8:3000')).toBe('http://10.0.0.8:3000')
    expect(effectiveOpenmaicBase('http://127.0.0.1:3000', 'http://10.0.0.8:3000')).toBe('http://127.0.0.1:3000')
    expect(effectiveOpenmaicBase('not a url', 'also bad')).toBe('http://localhost:3000')
  })

  it('saves and clears the parent base without blocking an active block', () => {
    let state = updateStudy(undefined, setup, NOW)
    state = updateStudy(state, start, NOW + 1)
    state = updateStudy(state, { action: 'openmaic-settings', baseUrl: 'http://127.0.0.1:3000/', parentConfirmation: '家长确认 OpenMAIC 地址。' }, NOW + 2)
    expect(state.openmaic).toEqual({ baseUrl: 'http://127.0.0.1:3000', parentConfirmation: '家长确认 OpenMAIC 地址。' })
    expect(studyStatus(state, NOW + 2).openmaic).toMatchObject({ baseUrl: 'http://127.0.0.1:3000', savedBaseUrl: 'http://127.0.0.1:3000', lessonsPath: '.study/openmaic-lessons.json' })
    const revision = state.revision
    const same = updateStudy(state, { action: 'openmaic-settings', baseUrl: 'http://127.0.0.1:3000', parentConfirmation: '再次确认。' }, NOW + 3)
    expect(same.revision).toBe(revision)
    const cleared = updateStudy(state, { action: 'openmaic-settings', baseUrl: '', parentConfirmation: '改回默认。' }, NOW + 4)
    expect(cleared.openmaic).toBeUndefined()
    expect(() => updateStudy(state, { action: 'openmaic-settings', baseUrl: 'http://user:pw@localhost:3000', parentConfirmation: '不要保存密码。' }, NOW + 5)).toThrow('不要在地址里写账号或密码')
  })

  it('shows valid lessons and drops a row whose URL is not http(s)', () => {
    const parsed = parseInteractiveLessons(JSON.stringify({
      format: 1,
      lessons: [ready, { ...ready, id: 'om-bad', url: 'javascript:alert(1)', updatedAt: '2026-10-28T06:06:00.000Z' }],
    }))
    expect(parsed.lessons.map(item => item.id)).toEqual(['om-1'])
    expect(parsed.error).toContain('无法读取')
    expect(parseInteractiveLessons('{')).toMatchObject({ lessons: [], error: '互动课记录不是有效的 JSON' })
    expect(parseInteractiveLessons(JSON.stringify({ format: 2, lessons: [] })).lessons).toEqual([])
  })

  it('reads a lesson file inside the workspace and ignores one outside it', async () => {
    const signal = new AbortController().signal
    const text = JSON.stringify({ format: 1, lessons: [ready] })
    const fs = {
      resolve: async (path: string) => path,
      contains: (_root: string, target: string) => target === '.study/openmaic-lessons.json',
      stat: async () => ({ type: 'file' }),
      readBytes: async () => new TextEncoder().encode(text),
    }
    const agent = { ctx: { get: (name: string) => name === 'fs' ? fs : undefined }, session: { header: { cwd: '/learning' } } }
    const found = await readInteractiveLessons(agent, signal, undefined)
    expect(found.lessons[0]).toMatchObject({ id: 'om-1', url: ready.url })
    expect(found.error).toBeUndefined()
    const missing = await readInteractiveLessons({ ...agent, ctx: { get: () => ({ ...fs, stat: async () => undefined }) } }, signal, undefined)
    expect(missing.lessons).toEqual([])
    const outside = await readInteractiveLessons({ ...agent, ctx: { get: () => ({ ...fs, contains: () => false }) } }, signal, undefined)
    expect(outside.error).toContain('工作区内')
    expect(await readInteractiveLessons({ session: { header: { cwd: '/learning' } } }, signal, undefined)).toMatchObject({ lessons: [] })
  })
})
