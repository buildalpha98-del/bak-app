(function() {
  'use strict';

  var script = document.currentScript;
  var targetId = script && script.getAttribute('data-target') || 'bak-stats';
  var BASE = script && script.getAttribute('data-api') || '';
  var theme = script && script.getAttribute('data-theme') || 'light';
  var color = script && script.getAttribute('data-color') || '#E8712A';

  function init() {
    var container = document.getElementById(targetId);
    if (!container) return;

    var shadow = container.attachShadow({ mode: 'open' });

    var isDark = theme === 'dark';
    var bgColor = isDark ? '#1A1A1A' : '#FFFFFF';
    var textColor = isDark ? '#F5F5F5' : '#1A1A1A';
    var mutedColor = isDark ? '#999999' : '#666666';
    var skeletonBase = isDark ? '#333333' : '#E0E0E0';
    var skeletonShine = isDark ? '#444444' : '#F0F0F0';

    var style = document.createElement('style');
    style.textContent = [
      '@keyframes bak-pulse {',
      '  0%, 100% { opacity: 0.6; }',
      '  50% { opacity: 1; }',
      '}',
      '.bak-widget {',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
      '  background: ' + bgColor + ';',
      '  border-radius: 8px;',
      '  padding: 16px 24px;',
      '  box-sizing: border-box;',
      '}',
      '.bak-stats-bar {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 8px;',
      '  flex-wrap: wrap;',
      '}',
      '.bak-stat-item {',
      '  display: flex;',
      '  align-items: center;',
      '  gap: 6px;',
      '  font-size: 15px;',
      '  color: ' + textColor + ';',
      '  white-space: nowrap;',
      '}',
      '.bak-stat-value {',
      '  font-weight: 700;',
      '  color: ' + color + ';',
      '  font-size: 18px;',
      '}',
      '.bak-stat-separator {',
      '  color: ' + mutedColor + ';',
      '  margin: 0 8px;',
      '  font-size: 14px;',
      '}',
      '.bak-skeleton {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 16px;',
      '  flex-wrap: wrap;',
      '}',
      '.bak-skeleton-bar {',
      '  height: 20px;',
      '  border-radius: 4px;',
      '  background: linear-gradient(90deg, ' + skeletonBase + ' 25%, ' + skeletonShine + ' 50%, ' + skeletonBase + ' 75%);',
      '  background-size: 200% 100%;',
      '  animation: bak-pulse 1.5s ease-in-out infinite;',
      '}',
      '@container (max-width: 500px) {',
      '  .bak-stats-bar { flex-direction: column; gap: 8px; }',
      '  .bak-stat-separator { display: none; }',
      '}',
      '@media (max-width: 500px) {',
      '  .bak-stats-bar { flex-direction: column; gap: 8px; }',
      '  .bak-stat-separator { display: none; }',
      '}'
    ].join('\n');
    shadow.appendChild(style);

    var wrapper = document.createElement('div');
    wrapper.className = 'bak-widget';
    shadow.appendChild(wrapper);

    // Skeleton loading
    wrapper.innerHTML = [
      '<div class="bak-skeleton">',
      '  <div class="bak-skeleton-bar" style="width: 140px;"></div>',
      '  <div class="bak-skeleton-bar" style="width: 120px;"></div>',
      '  <div class="bak-skeleton-bar" style="width: 130px;"></div>',
      '</div>'
    ].join('');

    fetch(BASE + '/api/public/stats')
      .then(function(r) {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json();
      })
      .then(function(data) {
        var sessions = data.sessions || 0;
        var centres = data.centres || 0;
        var rating = data.rating != null ? Number(data.rating).toFixed(1) : '0.0';

        wrapper.innerHTML = [
          '<div class="bak-stats-bar">',
          '  <div class="bak-stat-item">',
          '    <span class="bak-stat-value">' + sessions.toLocaleString() + '</span>',
          '    <span>sessions delivered</span>',
          '  </div>',
          '  <span class="bak-stat-separator">&middot;</span>',
          '  <div class="bak-stat-item">',
          '    <span class="bak-stat-value">' + centres + '</span>',
          '    <span>partner centres</span>',
          '  </div>',
          '  <span class="bak-stat-separator">&middot;</span>',
          '  <div class="bak-stat-item">',
          '    <span class="bak-stat-value">' + rating + '/5</span>',
          '    <span>average rating</span>',
          '  </div>',
          '</div>'
        ].join('');
      })
      .catch(function() {
        wrapper.innerHTML = '';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
