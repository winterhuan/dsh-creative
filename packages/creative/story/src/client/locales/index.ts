/** Locale dictionary owned by the fiction editor. */
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'

/** Dictionary namespace owned by this plugin. */
export const NS = 'story'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'workbench.title': '小说工作台',
  'workbench.description': '浏览和编辑小说正文、大纲与追踪文件。',
  'workbench.reloadFiles': '刷新项目文件',
  'tree.story.files': '小说项目文件',
  'editor.mode.preview': '预览',
  'editor.mode.source': '源码',
  'editor.save': '保存',
  'editor.conflict.diskDraft': '{path} 已在磁盘上更新；你的本地草稿没有被覆盖。',
  'editor.conflict.keepDraft': '保留本地草稿',
  'editor.removedNotice': '文件已从 workspace 移除。本地草稿仍保留，可复制后放弃草稿。',
  'editor.empty.story.command': '/story',
  'editor.empty.story.prefix': '当前 workspace 还没有小说文件。可在对话中运行',
  'editor.empty.story.suffix': '。',
  'markdown.empty': '这个 Markdown 文件还是空的。',
  'markdown.preview': '渲染预览',
  'markdown.task.done': '已完成',
  'markdown.task.pending': '未完成',
} as const

/** English dictionary, key-identical to the Chinese source of truth. */
export const en: Record<CreativeLocaleKey, string> = {
  'workbench.title': 'story workbench',
  'workbench.description': 'Browse and edit fiction, outlines, and tracking files.',
  'workbench.reloadFiles': 'Reload project files',
  'tree.story.files': 'Fiction project files',
  'editor.mode.preview': 'Preview',
  'editor.mode.source': 'Source',
  'editor.save': 'Save',
  'editor.conflict.diskDraft': '{path} was updated on disk; your local draft was not overwritten.',
  'editor.conflict.keepDraft': 'Keep local draft',
  'editor.removedNotice': 'The file was removed from the workspace. The local draft is kept; copy what you need, then discard the draft.',
  'editor.empty.story.command': '/story',
  'editor.empty.story.prefix': 'This workspace has no fiction files yet. Run',
  'editor.empty.story.suffix': 'in Chat.',
  'markdown.empty': 'This Markdown file is still empty.',
  'markdown.preview': 'rendered preview',
  'markdown.task.done': 'completed',
  'markdown.task.pending': 'not completed',
}

/** Key domain of the story namespace. */
export type CreativeLocaleKey = keyof typeof zh

/** Translate function for tests and non-slot callers. */
export type CreativeTranslate = Translate<CreativeLocaleKey>

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'story': CreativeLocaleKey } }
