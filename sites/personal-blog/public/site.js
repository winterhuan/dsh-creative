/* Optional enhancements; article text and navigation work without JavaScript. */
const scriptUrl = document.currentScript.src
const themeButton = document.querySelector('.theme-toggle')
if (themeButton) {
  const isDark = () => document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches
  const label = () => themeButton.setAttribute('aria-label', isDark() ? '切换浅色模式' : '切换深色模式')
  themeButton.hidden = false
  label()
  themeButton.addEventListener('click', () => {
    const theme = isDark() ? 'light' : 'dark'
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem('winter-blog-theme', theme) } catch (error) {
      // Theme switching remains available when browser storage is disabled.
    }
    label()
  })
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', label)
}

const search = document.querySelector('input[type="search"]')
if (search) {
  const result = document.querySelector('.result-count')
  const cards = [...document.querySelectorAll('[data-post]')]
  const buttons = [...document.querySelectorAll('[data-tag]')]
  const empty = document.querySelector('.empty-state')
  const reset = document.querySelector('.reset-search')
  let activeTag = new URL(location.href).searchParams.get('tag') ?? ''
  search.parentElement.hidden = false
  search.disabled = true
  fetch(new URL('search.json', scriptUrl))
    .then(response => {
      if (!response.ok) throw new Error(`Search unavailable: ${response.status}`)
      return response.json()
    })
    .then(posts => {
      document.querySelector('.collection-tools').hidden = false
      search.disabled = false
      const filter = () => {
        const words = search.value.trim().normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean)
        const matches = new Set(posts.filter(post => (!activeTag || post.tags.includes(activeTag))
          && words.every(word => post.text.normalize('NFKC').toLocaleLowerCase().includes(word))).map(post => post.slug))
        for (const card of cards) card.hidden = !matches.has(card.dataset.post)
        for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.tag === activeTag))
        result.textContent = `${matches.size} 篇文章`
        empty.hidden = matches.size !== 0
        empty.querySelector('p').textContent = posts.length ? '没有找到相关文章' : '这里还没有文章'
        empty.querySelector('span').textContent = posts.length ? '换个关键词，或看看其他主题。' : '新的思考，正在路上。'
        reset.hidden = posts.length === 0
      }
      for (const button of buttons) button.addEventListener('click', () => {
        activeTag = button.dataset.tag
        const url = new URL(location.href)
        if (activeTag) url.searchParams.set('tag', activeTag)
        else url.searchParams.delete('tag')
        history.replaceState(null, '', url)
        filter()
      })
      reset.addEventListener('click', () => {
        search.value = ''
        activeTag = ''
        const url = new URL(location.href)
        url.searchParams.delete('tag')
        history.replaceState(null, '', url)
        filter()
      })
      search.addEventListener('input', filter)
      filter()
    }).catch(error => {
      search.placeholder = '搜索暂不可用，请浏览下方文章'
      console.error(error)
    })
}
