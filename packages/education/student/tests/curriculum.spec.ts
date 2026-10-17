import { describe, expect, it } from 'vitest'
import { builtinConcepts, builtinObjective, builtinObjectives, curriculumFiles, curriculumFor, subjectIdeas } from '../src/curriculum.ts'
import { errorTypesBySubject } from '../src/vocabulary.ts'

const grades = [1, 2] as const
const terms = ['first', 'second'] as const
const subjects = ['chinese', 'math', 'english'] as const

describe('shipped knowledge maps', () => {
  it('loads all twelve subject, grade and term maps with validated content', () => {
    const ids = new Set<string>()
    for (const grade of grades) for (const term of terms) {
      const files = curriculumFiles({ grade, term })
      expect(files.map(file => file.id)).toEqual(subjects.map(subject => `${subject}-grade${grade}-${term}`))
      for (const file of files) {
        expect(file.title.length).toBeGreaterThan(3)
        expect(file.basis.length).toBeGreaterThan(30)
        expect(file.concepts.length).toBeGreaterThanOrEqual(10)
        expect(file.objectives.length).toBeGreaterThanOrEqual(5)
        expect(file.relations.length).toBeGreaterThanOrEqual(6)
        for (const item of [...file.units, ...file.concepts, ...file.objectives, ...file.relations]) {
          expect(ids.has(item.id)).toBe(false)
          ids.add(item.id)
        }
        for (const concept of file.concepts) {
          expect(concept.definition.length).toBeGreaterThan(8)
          expect(concept.example.length).toBeGreaterThan(4)
          expect(concept.source.length).toBeGreaterThan(8)
        }
        for (const relation of file.relations) {
          expect(relation.explanation.length).toBeGreaterThan(8)
          expect(relation.source.length).toBeGreaterThan(8)
        }
      }
    }
    expect(ids.size).toBeGreaterThan(150)
  })

  it('resolves shipped objectives and concepts for a profile scope', () => {
    const scope = { grade: 2, term: 'first' } as const
    const objectives = builtinObjectives(scope)
    expect(objectives.length).toBeGreaterThan(10)
    for (const objective of objectives) {
      expect(subjects).toContain(objective.subject)
      expect(objective.unitName.length).toBeGreaterThan(0)
      expect(builtinObjective(scope, objective.id)).toMatchObject({ id: objective.id, subject: objective.subject })
    }
    expect(builtinObjective(scope, 'missing-objective')).toBeUndefined()
    expect(builtinConcepts(scope, 'math').length).toBeGreaterThan(5)
    expect(builtinConcepts({ grade: 3, term: 'first' }, 'math')).toEqual([])
    expect(curriculumFor(scope, 'english')?.subject).toBe('english')
    expect(curriculumFor({ grade: 4, term: 'second' }, 'chinese')).toBeUndefined()
    expect(curriculumFiles({ grade: 5, term: 'first' })).toEqual([])
  })

  it('keeps each objective reachable from its first knowledge point unit', () => {
    for (const grade of grades) for (const term of terms) {
      for (const file of curriculumFiles({ grade, term })) {
        const units = new Map(file.units.map(unit => [unit.id, unit.name]))
        const concepts = new Map(file.concepts.map(concept => [concept.id, concept]))
        for (const objective of file.objectives) {
          const first = concepts.get(objective.conceptIds[0] ?? '')
          expect(first).toBeDefined()
          expect(units.has(first?.unit ?? '')).toBe(true)
        }
      }
    }
  })

  it('ships question elements and daily focuses with every map', () => {
    for (const grade of grades) for (const term of terms) {
      for (const file of curriculumFiles({ grade, term })) {
        expect(file.units.every(unit => unit.focus !== undefined)).toBe(true)
        for (const objective of file.objectives) {
          expect(objective.errorTypes?.length ?? 0).toBeGreaterThanOrEqual(1)
          expect(objective.questionPoints?.length ?? 0).toBeGreaterThanOrEqual(2)
          for (const type of objective.errorTypes ?? []) expect(errorTypesBySubject[file.subject]).toContain(type)
        }
        const withMisconceptions = file.concepts.filter(concept => (concept.misconceptions?.length ?? 0) >= 1).length
        expect(withMisconceptions / file.concepts.length).toBeGreaterThanOrEqual(0.8)
        for (const concept of file.concepts) {
          expect(concept.facts?.length ?? 0).toBeGreaterThanOrEqual(2)
          expect(concept.facts?.length ?? 0).toBeLessThanOrEqual(8)
          expect(concept.facts?.every(fact => fact.length <= 240 && fact.length > 0)).toBe(true)
        }
        if (file.id === 'chinese-grade2-first') {
          const scene = file.concepts.find(concept => concept.id === 'c2a-u2-1')
          expect(scene?.facts?.join('')).not.toContain('沙滩')
          expect(scene?.facts?.join('')).toContain('一条帆船')
          expect(file.concepts.find(concept => concept.id === 'c2a-u1-3')?.facts?.join('')).toContain('石榴')
          expect(file.concepts.find(concept => concept.id === 'c2a-u4-4')?.facts?.join('')).toContain('晾房')
        }
        if (file.id === 'chinese-grade1-first') {
          expect(file.concepts.find(concept => concept.id === 'c1a-u7-3')?.facts?.join('')).toContain('双手和大脑')
          expect(file.concepts.find(concept => concept.id === 'c1a-u8-2')?.facts?.join('')).toContain('石子')
        }
        expect(file.concepts.some(concept => (concept.ideaIds?.length ?? 0) > 0)).toBe(true)
        if (file.id === 'math-grade1-first' || file.id === 'math-grade1-second' || file.id === 'math-grade2-first') {
          const checked = file.concepts.filter(concept => concept.source.includes('已读'))
          expect(checked.length).toBeGreaterThan(0)
          for (const concept of checked) {
            const copied = (concept.facts ?? []).every(fact => fact === concept.definition || fact === concept.example)
            expect(copied).toBe(false)
          }
          const joined = (id: string) => file.concepts.find(concept => concept.id === id)?.facts?.join('') ?? ''
          if (file.id === 'math-grade1-first') {
            expect(joined('m1a-carry')).toContain('9+4')
            expect(joined('m1a-carry')).toContain('凑十')
            expect(joined('m1a-compare')).not.toContain('开口对着大数')
          }
          if (file.id === 'math-grade1-second') {
            expect(joined('m1b-clock')).toContain('10:00')
            expect(joined('m1b-half')).toContain('11:30')
            expect(joined('m1b-wall')).toContain('品')
            expect(joined('m1b-measure')).not.toContain('1米')
          }
          if (file.id === 'math-grade2-first') {
            expect(file.concepts.every(concept => !(concept.facts ?? []).some(fact => fact.includes('除法')))).toBe(true)
            expect(joined('m2a-sub-borrow')).toContain('退')
            expect(joined('m2a-sub-borrow')).toContain('43')
            expect(joined('m2a-rmb')).toContain('1元=10角')
            expect(joined('m2a-table248')).not.toContain('两倍')
          }
        }
        if (file.id === 'english-grade1-first') {
          const joined = (id: string) => file.concepts.find(concept => concept.id === id)?.facts?.join('') ?? ''
          expect(joined('e1a-u1-2')).toContain('Good morning')
          expect(joined('e1a-u3-2')).toContain('Pack my schoolbag')
          expect(joined('e1a-u2-2')).toContain('Welcome to China')
          expect(joined('e1a-u4-4')).toContain('Who\'s on duty today?')
          expect(joined('e1a-u5-3')).toContain('Draw two eyes')
          expect(joined('e1a-u6-1')).toContain('This is my family')
          expect(joined('e1a-u7-3')).toContain('Horses give us rides')
          expect(joined('e1a-u7-1')).not.toContain('The horse is warm')
          expect(joined('e1a-u7-2')).not.toContain('The horse is warm')
          expect(joined('e1a-u8-4')).toContain('Have a go!')
          expect(joined('e1a-u9-2')).toContain('wash your lunch box')
          expect(joined('e1a-u10-4')).toContain('hula hoop')
        }
        if (file.id === 'english-grade2-first') {
          const joined = (id) => file.concepts.find(concept => concept.id === id)?.facts?.join('') ?? ''
          expect(joined('e2a-u1-2')).toContain('up and down')
          expect(joined('e2a-u1-2')).toContain('eat breakfast')
          expect(joined('e2a-u2-2')).toContain('on the shelf')
          expect(joined('e2a-u3-2')).toContain('metro')
          expect(joined('e2a-u4-2')).toContain('warm-up')
          expect(joined('e2a-u4-2')).not.toContain('ping-pang')
          expect(joined('e2a-u5-2')).toContain('Where\'s Mr Sun?')
          expect(joined('e2a-u5-2')).toContain('behind the clouds')
          expect(joined('e2a-u6-4')).toContain('Papa Seahorse')
          expect(joined('e2a-u8-2')).toContain('fruit plate')
          expect(joined('e2a-u10-2')).toContain('I can draw a picture')
        }
        if (file.id === 'english-grade1-second') {
          const joined = (id: string) => file.concepts.find(concept => concept.id === id)?.facts?.join('') ?? ''
          expect(joined('e1b-u1-4')).toContain('Xiaojiang')
          expect(joined('e1b-u2-2')).toContain('meatballs')
          expect(joined('e1b-u3-2')).toContain('The butterfly is yellow')
          expect(joined('e1b-u4-2')).toContain('Hold on tight')
          expect(joined('e1b-u5-4')).toContain('I like sunny days')
          expect(joined('e1b-u6-3')).toContain('Put on my shirt')
          expect(joined('e1b-u7-3')).toContain('Hide-and-seek')
          expect(joined('e1b-u8-4')).toContain('zebra crossing')
          expect(joined('e1b-u9-3')).toContain('looking at me')
          expect(joined('e1b-u10-3')).toContain('I like them all')
          expect(file.concepts.every(concept => !(concept.facts ?? []).some(fact => fact.includes('The horse is warm')))).toBe(true)
        }
      }
    }
  })

  it('shares one concept list per subject across grades and units', () => {
    const cited = new Map(subjects.map(subject => [subject, new Set()]))
    const links = new Map()
    for (const grade of grades) for (const term of terms) {
      for (const file of curriculumFiles({ grade, term })) {
        for (const concept of file.concepts) {
          links.set(concept.id, concept.ideaIds ?? [])
          for (const id of concept.ideaIds ?? []) cited.get(file.subject)?.add(id)
        }
      }
    }
    for (const subject of subjects) {
      const ideas = subjectIdeas(subject)
      expect(new Set(ideas.map(idea => idea.id)).size).toBe(ideas.length)
      expect(new Set(ideas.map(idea => idea.name)).size).toBe(ideas.length)
      for (const idea of ideas) {
        expect(idea.definition.length).toBeGreaterThan(8)
        expect(cited.get(subject)?.has(idea.id)).toBe(true)
      }
    }
    const chinese = subjectIdeas('chinese')
    const math = subjectIdeas('math')
    const english = subjectIdeas('english')
    expect(chinese.some(idea => idea.name === '乌鸦喝水')).toBe(false)
    expect(chinese.filter(idea => idea.name === '反义词')).toHaveLength(1)
    expect(chinese.find(idea => idea.id === 'zh-tone')?.definition).toContain('一声')
    expect(chinese.find(idea => idea.id === 'zh-recognize-list')?.definition).toContain('会认')
    expect(chinese.some(idea => /园地[一二三四五六七八]/.test(idea.name))).toBe(false)
    expect(english.find(idea => idea.name === '问候')?.definition).toContain('Good morning')
    expect(english.some(idea => idea.definition.includes('ping-pang'))).toBe(false)
    expect(math.find(idea => idea.id === 'm1b-i-body')?.definition).toContain('中指尖')
    expect(math.find(idea => idea.id === 'm1b-i-body')?.definition).toContain('前面那只脚')
    expect(math.find(idea => idea.id === 'm1b-i-body')?.definition).toContain('右手指尖')
    expect(math.find(idea => idea.id === 'm1b-i-wall')?.definition).toContain('正上方')
    expect(math.find(idea => idea.id === 'm2a-i-magic')?.definition).toContain('斜对角')
    expect(math.some(idea => idea.id === 'm1b-i-span')).toBe(false)
    expect(links.get('c1a-ua-1')).toEqual(['zh-recognize-list'])
    expect(links.get('c2a-ua-1')).toEqual(['zh-recognize-list'])
    expect(links.get('m1b-pattern')).toEqual(['math-pattern'])
    expect(links.get('m2a-pattern')).toEqual(['math-pattern'])
    expect(links.get('c1a-u1-5')).toEqual(['zh-unit-review'])
    expect(links.get('c1b-u1-5')).toEqual(['zh-unit-review'])
    expect(links.get('c2a-u2-5')).toContain('zh-antonym')
    expect(links.get('c2a-u2-5')).not.toContain('zh-unit-review')
  })
})
