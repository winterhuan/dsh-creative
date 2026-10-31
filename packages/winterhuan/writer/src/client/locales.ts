/** Copy owned by the writing sidebar. */
import type {} from '@deepseek-ai/dsh-client-ui-slots'

export const NS = 'writerDesk'

export const zh = {
  title: '写作',
  description: '设定、大纲和章节',
  setting: '设定',
  outline: '大纲',
  chapters: '章节',
  save: '保存',
  reload: '重新读取',
  saved: '已保存',
  empty: '这里还没有设定、大纲或章节',
  emptyHelp: '在对话里打开 story-long-write 或 story-short-write 开始写',
  conflict: '磁盘上的文件已经更新',
  reloadDisk: '载入磁盘版本',
  book: '作品',
  workspaceBook: '当前目录',
  noWorkspace: '这个会话还没有工作区',
  loadError: '文件暂时读不了',
  saveError: '没有保存',
  truncated: '这一层没有列全',
  editor: '正文',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { writerDesk: keyof typeof zh }
}

export const en: { [Key in keyof typeof zh]: string } = {
  title: 'Writing',
  description: 'Setting, outline, and chapters',
  setting: 'Setting',
  outline: 'Outline',
  chapters: 'Chapters',
  save: 'Save',
  reload: 'Reload',
  saved: 'Saved',
  empty: 'No setting, outline, or chapters yet',
  emptyHelp: 'Start from story-long-write or story-short-write in the chat',
  conflict: 'The file changed on disk',
  reloadDisk: 'Load the disk copy',
  book: 'Book',
  workspaceBook: 'This folder',
  noWorkspace: 'This session has no workspace yet',
  loadError: 'The file could not be read',
  saveError: 'Not saved',
  truncated: 'This folder is only partly listed',
  editor: 'Prose',
}
