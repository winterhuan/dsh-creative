/** Copy owned by the per-project default-mode menu item and its dialog. */

/** Locale keys these surfaces render. */
export type ProjectDefaultModeKey =
  | 'menu'
  | 'title'
  | 'followGlobal'
  | 'globalDefault'
  | 'hint'
  | 'loading'
  | 'loadFailed'
  | 'saveFailed'
  | 'save'
  | 'saving'
  | 'cancel'
  | 'close'

/** English copy. */
export const en: Record<ProjectDefaultModeKey, string> = {
  menu: 'Set project default mode',
  title: 'Default mode for {project}',
  followGlobal: 'Follow the global default',
  globalDefault: 'Global default',
  hint: 'New sessions in this project start in the selected mode. Sessions already started keep their own mode, and picking a mode on the new-session screen still overrides this for that session.',
  loading: 'Loading…',
  loadFailed: 'Could not load the available modes.',
  saveFailed: 'Could not save the project default.',
  save: 'Save',
  saving: 'Saving…',
  cancel: 'Cancel',
  close: 'Close',
}

/** Chinese copy. */
export const zh: Record<ProjectDefaultModeKey, string> = {
  menu: '设为本项目默认模式',
  title: '「{project}」的默认模式',
  followGlobal: '跟随全局默认',
  globalDefault: '全局默认',
  hint: '本项目新建的会话将以所选模式开始。已经开始的会话保留各自模式；在新建会话界面手动选择的模式仍会对那一个会话覆盖此设置。',
  loading: '加载中…',
  loadFailed: '无法加载可用模式。',
  saveFailed: '无法保存项目默认模式。',
  save: '保存',
  saving: '保存中…',
  cancel: '取消',
  close: '关闭',
}
