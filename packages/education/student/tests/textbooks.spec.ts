import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createStudySkillProvider } from '../src/skill-provider.ts'

const manifestSchema = z.object({
  grade: z.literal(2), term: z.literal('first'), pageCount: z.number().int(),
  pages: z.array(z.object({ pdfPage: z.number().int(), printedPage: z.number().int().nullable(), image: z.string(), text: z.string() })),
})

describe('default textbook resources', () => {
  it('resolves both complete books through the installed Skill resource directory', async () => {
    const provider = createStudySkillProvider()
    const candidates = await provider.list({})
    if (!Array.isArray(candidates) || !candidates[0]) throw new Error('Expected a study Skill')
    const skill = await provider.get(candidates[0], {})
    if (skill?.resourceBase?.kind !== 'directory') throw new Error('Expected a Skill resource directory')
    const root = skill.resourceBase.path
    for (const [book, count] of [['chinese-grade2-first', 126], ['math-grade2-first', 118]] as const) {
      const directory = join(root, 'textbooks', book)
      const manifest = manifestSchema.parse(JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')))
      expect(manifest.pageCount).toBe(count)
      expect(manifest.pages.map(page => page.pdfPage)).toEqual(Array.from({ length: count }, (_, index) => index + 1))
      for (const page of manifest.pages) {
        const image = await readFile(join(directory, page.image))
        expect([...image.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
        expect([...image.subarray(-2)]).toEqual([0xff, 0xd9])
        expect(await readFile(join(directory, page.text), 'utf8')).toContain(`PDF 第 ${page.pdfPage} 页；`)
      }
      expect(manifest.pages[0]?.printedPage).toBeNull()
      expect(manifest.pages[count - 1]?.printedPage).toBeNull()
      const index = await readFile(join(directory, 'index.md'), 'utf8')
      const entries = [...index.matchAll(/\| ([^|]+) \| (\d+) \| (\d+) \| \[课页\]\(([^)]+)\)/gu)]
      expect(entries.length).toBeGreaterThan(10)
      for (const [, , printed, pdf, image] of entries) {
        expect(manifest.pages[Number(pdf) - 1]).toMatchObject({ printedPage: Number(printed), image })
      }
      if (book === 'math-grade2-first') {
        expect(manifest.pages[6]).toMatchObject({ pdfPage: 7, printedPage: 2 })
        for (const pdf of [109, 111, 113, 115]) expect(manifest.pages[pdf - 1]?.printedPage).toBeNull()
      } else {
        expect(manifest.pages[5]).toMatchObject({ pdfPage: 6, printedPage: 1 })
      }
    }
  })
})
