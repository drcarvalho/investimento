(function () {
  try {
    var saved = localStorage.getItem('investanalytics_theme');
    var theme =
      saved === 'dark' || saved === 'light'
        ? saved
        : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#121210' : '#f9f7f2');
  } catch (e) {}
})();
