import fixture from '../../creative/tests/fixtures/creator-episode.json'
import { describe, expect, it } from 'vitest'
import {
  creatorDocumentPaths,
  episodeDirectoryForPath,
  parseEpisodeProduction,
  parseImagePrompts,
  parseStoryboard,
  parseVideoPrompts,
  productionCompleteness,
} from '../src/client/drama-production.js'

const episode = '剧集/EP001'
const storyboard = `# EP001 分镜

## SHOT-EP001-001 · 门外停步
- 来源：EP001-SC001
- 时长：4s
- 目的：先停住，再揭示门内声音。
- 景别/机位：中近景，轻微低机位。
- 起点：右手悬在门把上方。
- 终点：手收回。
- 图片提示词项：IMG-JIANGCHEN-SHEET《江辰角色板》；IMG-OLD-DOOR《旧门场景板》。

### 冻结关键帧提示词
> 江辰站在旧门外，右手悬停。

## 说明
不是镜头。
`

const imagePrompts = `# 图片提示词

## IMG-JIANGCHEN-SHEET · 江辰角色板
- 用途：锁定人物造型。
- 参考：无。

### 可复制提示词
> 窄长眼，左眉尾旧疤。

## IMG-OLD-DOOR · 旧门场景板
- 用途：锁定门外空间。

### 可复制提示词
> 旧木门，黄铜门把。
`

const videoPrompts = `# 视频提示词

## MOTION-EP001-001 · 门外停步
- 分镜：SHOT-EP001-001
- 时长：4 秒
- 起始帧：冻结关键帧。
- 终点：右手收回。

### 可复制提示词
> 从悬停开始，人物缓慢收回右手。
`

describe('short-drama production projection', () => {
  it('recognizes episode creator documents and keeps their canonical order', () => {
    expect(episodeDirectoryForPath('剧集/EP001/分镜.md')).toBe(episode)
    expect(episodeDirectoryForPath('交付/EP001/a.mp4')).toBe(episode)
    expect(creatorDocumentPaths([
      { path: `${episode}/视频提示词.md` },
      { path: `${episode}/notes.txt` },
      { path: `${episode}/剧本.md` },
      { path: `${episode}/分镜.md` },
      { path: '剧集/EP002/剧本.md' },
      { path: '剧集/EP002/分镜.md' },
    ], episode)).toEqual([`${episode}/剧本.md`, `${episode}/分镜.md`, `${episode}/视频提示词.md`])
  })

  it('parses stable shots, prompts and cross-document references', () => {
    const shot = parseStoryboard(`${episode}/分镜.md`, storyboard)[0]
    expect(shot).toMatchObject({
      id: 'SHOT-EP001-001',
      title: '门外停步',
      source: 'EP001-SC001',
      durationSeconds: 4,
      start: '右手悬在门把上方。',
      end: '手收回。',
      references: ['IMG-JIANGCHEN-SHEET', 'IMG-OLD-DOOR'],
      keyframePrompt: '江辰站在旧门外，右手悬停。',
    })
    expect(parseImagePrompts(`${episode}/图片提示词.md`, imagePrompts)[0]).toMatchObject({
      id: 'IMG-JIANGCHEN-SHEET',
      kind: 'character',
      prompt: '窄长眼，左眉尾旧疤。',
    })
    expect(parseVideoPrompts(`${episode}/视频提示词.md`, videoPrompts)[0]).toMatchObject({
      id: 'MOTION-EP001-001',
      shotId: 'SHOT-EP001-001',
      durationSeconds: 4,
      prompt: '从悬停开始，人物缓慢收回右手。',
    })
  })

  it('projects all documents without turning the projection into a second source of truth', () => {
    const production = parseEpisodeProduction({
      [`${episode}/剧本.md`]: '## EP001-SC001 内 · 门外 · 夜\n江辰：我回来了。',
      [`${episode}/分镜.md`]: storyboard,
      [`${episode}/图片提示词.md`]: imagePrompts,
      [`${episode}/视频提示词.md`]: videoPrompts,
      [`${episode}/视觉设定.md`]: '## 人物 · 江辰\n- ID：VISUAL-CHAR-JIANGCHEN\n- 识别锚点：左眉尾旧疤。',
    }, episode)
    expect(production.shots).toHaveLength(1)
    expect(production.shots[0]?.motion?.id).toBe('MOTION-EP001-001')
    expect(production.targets.get('EP001-SC001')?.path).toBe(`${episode}/剧本.md`)
    expect(production.targets.get('IMG-JIANGCHEN-SHEET')?.path).toBe(`${episode}/图片提示词.md`)
    expect(production.visualAssets[0]).toMatchObject({ title: '江辰', kind: 'character' })
    expect(production.protocolVersion).toBe('short-drama/v1')
    expect(production.diagnostics).toEqual([])
    expect(productionCompleteness(production.shots[0]!)).toEqual({ keyframe: true, motion: true, references: true, complete: true })
  })

  it('projects the shared creator fixture and preserves host diagnostics', () => {
    const diagnostics = [{ severity: 'error' as const, code: 'creator_protocol', path: `${episode}/分镜.md`, offset: 0, line: 1, messageKey: 'diagnostic.creator_protocol' as const, params: { message: 'REF missing subject' } }]
    const documents = Object.fromEntries(Object.entries(fixture.documents).map(([name, text]) => [`${episode}/${name}`, text]))
    const production = parseEpisodeProduction(documents, episode, diagnostics)
    expect(production.shots.map(shot => shot.id)).toEqual(['SHOT-EP001-001'])
    expect(production.visualAssets.map(asset => asset.id)).toEqual(['VISUAL-JIANGCHEN', 'VISUAL-DOOR'])
    expect(production.diagnostics).toEqual(diagnostics)
  })

})

describe('shared structural cases', () => {
  it.each(fixture.cases)('projects $name with only declared visual targets', (fixtureCase) => {
    const documents = Object.fromEntries(Object.entries(fixture.documents).map(([name, text]) => [`${episode}/${name}`, name === fixtureCase.document ? text.replace(fixtureCase.from, fixtureCase.to) : text]))
    expect(parseEpisodeProduction(documents, episode).visualAssets.map(asset => asset.id)).toEqual(fixtureCase.visualTargets)
  })
})

describe('storyboard contract regressions', () => {
  it('reads shot references from the contract field 图片提示词项', () => {
    const shots = parseStoryboard(`${episode}/分镜.md`, storyboard)
    expect(shots[0]?.references).toEqual(['IMG-JIANGCHEN-SHEET', 'IMG-OLD-DOOR'])
    expect(productionCompleteness(shots[0]!).references).toBe(true)
  })

  it('does not raise malformed_heading for a separator the parser accepts', () => {
    const production = parseEpisodeProduction({
      [`${episode}/分镜.md`]: '## SHOT-EP001-001·门外停步\n- 时长：4s\n',
    }, episode)
    expect(production.shots.map(shot => shot.id)).toEqual(['SHOT-EP001-001'])
    expect(production.diagnostics.filter(item => item.code === 'malformed_heading')).toEqual([])
  })

  it('never invents production targets for missing or invalid visual IDs', () => {
    for (const id of ['', '- ID：VISUAL_CHAR_JIANGCHEN']) {
      const production = parseEpisodeProduction({ [`${episode}/视觉设定.md`]: `## 人物 · 江辰\n${id}\n- 识别锚点：左眉尾旧疤。` }, episode)
      expect(production.visualAssets).toEqual([])
      expect([...production.targets.keys()]).toEqual([])
    }
  })
})
