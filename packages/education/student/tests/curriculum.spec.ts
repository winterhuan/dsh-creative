import { describe, expect, it } from 'vitest'
import { builtinConcepts, builtinObjective, builtinObjectives, curriculumFiles, curriculumFor } from '../src/curriculum.ts'

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
})
