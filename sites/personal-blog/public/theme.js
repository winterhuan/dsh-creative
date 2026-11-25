/* Set a saved preference before paint; the system theme remains the default. */
try {
  const theme = localStorage.getItem('winter-blog-theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
} catch (error) {
  // Storage may be disabled; CSS still follows the system preference.
}
