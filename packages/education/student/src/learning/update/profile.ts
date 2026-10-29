import { canonical, requireValue, sameScope } from '../shared.ts'
import { duplicate } from './context.ts'
import { rawApply, type UpdateContext } from './index.ts'
import { curriculumFor } from '../../curriculum.ts'
import { DEFAULT_INTEREST_TAGS } from '../../interests.ts'
import { normalizeOpenmaicBase } from '../../openmaic.ts'
import { stateSchema, type Command, type StudyState } from '../../schema.ts'

/** Create the first learner profile for a workspace. */
export function applySetup(command: Extract<Command, { action: 'setup' }>, now: number): StudyState {
  requireValue(command.profile.limits.blockMinutes <= command.profile.limits.dailyMinutes, '单段时长不能超过每日上限。')
  return stateSchema.parse({
    format: 1, revision: 1, updatedAt: now, profile: command.profile,
    interests: { tags: [...DEFAULT_INTEREST_TAGS], parentConfirmation: command.profile.parentConfirmation },
    materials: [], courses: [], sessions: [], attempts: [], mistakes: [], rewards: [], breakUntil: 0,
  })
}

/** Save a material and its course atomically under one revision. */
export function applyConfigureCourse(ctx: UpdateContext<'configure-course'>): StudyState {
  const { command, previous, now } = ctx
  requireValue(command.material.id === command.course.materialId && command.material.subject === command.course.subject, '教材与学校进度必须引用同一份资料和科目。')
  const withMaterial = rawApply(previous, { action: 'material', material: command.material }, now)
  const withCourse = rawApply(withMaterial, { action: 'course', course: command.course }, now)
  return stateSchema.parse({ ...withCourse, revision: previous.revision + 1 })
}

/** Replace the parent-confirmed time limits. */
export function applyLimits(ctx: UpdateContext<'limits'>): StudyState {
  const { command, state, active } = ctx
  requireValue(!active, '先结束当前学习，再由家长调整时长。')
  requireValue(command.limits.blockMinutes <= command.limits.dailyMinutes, '单段时长不能超过每日上限。')
  state.profile.limits = command.limits
  state.profile.parentConfirmation = command.parentConfirmation
  return state
}

/** Register one course material; an identical retry is a no-op. */
export function applyMaterial(ctx: UpdateContext<'material'>): StudyState {
  const { command, previous, state } = ctx
  if (duplicate(state.materials, item => item.id === command.material.id, item => canonical(item) === canonical(command.material))) return previous
  state.materials.push(command.material)
  return state
}

/** Confirm a material as the subject course, keeping confirmed school progress. */
export function applyCourse(ctx: UpdateContext<'course'>): StudyState {
  const { command, state, active } = ctx
  requireValue(!active, '先结束当前学习，再修改校内进度。')
  const material = state.materials.find(item => item.id === command.course.materialId)
  requireValue(material && material.subject === command.course.subject && sameScope(state.profile, material.scope), '教材的科目、地区、年级、学期、学年和学制必须与档案一致。')
  requireValue(material.kind === 'official-textbook' || material.kind === 'school-material', '参考资料和 AI 自编练习不能标为校内同步教材。')
  requireValue(material.editionStatus === 'identified', '该资料的版次尚未核实，请先核对实物或官方信息并登记已识别的版本。')
  const prior = state.courses.find(course => course.subject === command.course.subject)
  const progress = prior?.progress
  state.courses = state.courses.filter(course => course.subject !== command.course.subject)
  state.courses.push(progress ? { ...command.course, progress } : command.course)
  return state
}

/** Record the parent-confirmed school frontier unit. */
export function applySchoolProgress(ctx: UpdateContext<'school-progress'>): StudyState {
  const { command, state, active, now } = ctx
  requireValue(!active, '先结束当前学习，再修改学校进度。')
  const course = state.courses.find(item => item.subject === command.subject)
  requireValue(course, '先确认该科教材，再标学校教到哪一单元。')
  const file = curriculumFor(state.profile, command.subject)
  requireValue(file?.units.some(unit => unit.id === command.unitId), '这个单元不在当前年级学期的知识地图里。')
  course.progress = { unitId: command.unitId, confirmedAt: now, posture: command.posture, preview: command.preview === 'on', pace: command.pace }
  return state
}


/**
 * Save or clear the parent OpenMAIC origin.
 * An empty base removes the override. An active learning block does not block this; the address is not learning evidence.
 */
export function applyOpenmaicSettings(ctx: UpdateContext<'openmaic-settings'>): StudyState {
  const { command, previous, state } = ctx
  const normalized = normalizeOpenmaicBase(command.baseUrl)
  requireValue(normalized !== undefined, 'OpenMAIC 地址需要是 http 或 https 原点，例如 http://localhost:3000。不要在地址里写账号或密码。')
  const current = state.openmaic?.baseUrl ?? ''
  if (current === normalized) return previous
  if (normalized === '') delete state.openmaic
  else state.openmaic = { baseUrl: normalized, parentConfirmation: command.parentConfirmation }
  return state
}

/**
 * Save the parent's theme tags. Duplicates collapse; fewer than three distinct tags is rejected.
 * An active block blocks the change, matching the other parent settings.
 */
export function applyInterests(ctx: UpdateContext<'interests'>): StudyState {
  const { command, previous, state, active } = ctx
  requireValue(!active, '先结束当前学习，再由家长调整兴趣标签。')
  const tags = [...new Set(command.tags)]
  requireValue(tags.length >= 3 && tags.length <= 8, '兴趣标签需要 3 到 8 个，去掉重复后仍要落在这个范围。')
  const current = state.interests?.tags ?? []
  if (current.length === tags.length && current.every((tag, index) => tag === tags[index])) return previous
  state.interests = { tags, parentConfirmation: command.parentConfirmation }
  return state
}

/** Archive the finished term: keep the profile for reference, drop all evidence (exported beforehand by the store) and mark the file archived. */
export function applyArchiveTerm(ctx: UpdateContext<'archive-term'>): StudyState {
  const { command, state, active, now } = ctx
  requireValue(!active, '先结束当前学习，再归档学期。')
  requireValue(command.parentConfirmation.trim().length > 0, '归档学期需要家长的确认。')
  return stateSchema.parse({ format: 1, revision: 1, updatedAt: now, archivedAt: now, profile: state.profile, materials: [], courses: [], sessions: [], attempts: [], mistakes: [], rewards: [], breakUntil: 0 })
}
