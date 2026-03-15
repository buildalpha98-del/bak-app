(function() {
  'use strict';

  var script = document.currentScript;
  var targetId = script && script.getAttribute('data-target') || 'bak-sports';
  var BASE = script && script.getAttribute('data-api') || '';
  var color = script && script.getAttribute('data-color') || '#E8712A';

  var SPORT_EMOJIS = {
    'Soccer': '\u26BD',
    'Basketball': '\uD83C\uDFC0',
    'Athletics': '\uD83C\uDFC3',
    'Yoga': '\uD83E\uDDD8',
    'Pilates': '\uD83E\uDD38',
    'Boot Camp': '\uD83D\uDCAA',
    'Swimming': '\uD83C\uDFCA',
    'Pickleball': '\uD83C\uDFD3',
    'Golf': '\u26F3',
    'Hockey': '\uD83C\uDFD1',
    'Lacrosse': '\uD83E\uDD4D',
    'Motor Skills': '\uD83C\uDFAF',
    'Multi-Sport': '\uD83C\uDFC5',
    'Cricket': '\uD83C\uDFCF',
    'Netball': '\uD83C\uDFD0',
    'Tennis': '\uD83C\uDFBE',
    'Volleyball': '\uD83C\uDFD0',
    'Dance': '\uD83D\uDC83',
    'Gymnastics': '\uD83E\uDD38'
  };

  function init() {
    var container = document.getElementById(targetId);
    if (!container) return;

    var shadow = container.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = [
      '@keyframes bak-pulse {',
      '  0%, 100% { opacity: 0.6; }',
      '  50% { opacity: 1; }',
      '}',
      '.bak-widget {',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
      '  box-sizing: border-box;',
      '}',
      '.bak-widget *, .bak-widget *::before, .bak-widget *::after {',
      '  box-sizing: border-box;',
      '}',
      '.bak-grid {',
      '  display: grid;',
      '  grid-template-columns: repeat(4, 1fr);',
      '  gap: 12px;',
      '}',
      '@media (max-width: 768px) {',
      '  .bak-grid { grid-template-columns: repeat(3, 1fr); }',
      '}',
      '@media (max-width: 480px) {',
      '  .bak-grid { grid-template-columns: repeat(2, 1fr); }',
      '}',
      '.bak-sport-card {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  gap: 8px;',
      '  padding: 16px 8px;',
      '  border-radius: 10px;',
      '  background: #FFFFFF;',
      '  border: 1px solid #E8E8E8;',
      '  transition: transform 0.2s ease, box-shadow 0.2s ease;',
      '  cursor: default;',
      '}',
      '.bak-sport-card:hover {',
      '  transform: translateY(-2px);',
      '  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);',
      '  border-color: ' + color + ';',
      '}',
      '.bak-sport-emoji {',
      '  font-size: 32px;',
      '  line-height: 1;',
      '}',
      '.bak-sport-name {',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  color: #1A1A1A;',
      '  text-align: center;',
      '}',
      '.bak-skeleton-card {',
      '  display: flex;',
      '  flex-direction: column;',
      '  align-items: center;',
      '  gap: 8px;',
      '  padding: 16px 8px;',
      '  border-radius: 10px;',
      '  background: #FFFFFF;',
      '  border: 1px solid #E8E8E8;',
      '}',
      '.bak-skeleton-circle {',
      '  width: 36px;',
      '  height: 36px;',
      '  border-radius: 50%;',
      '  background: #E0E0E0;',
      '  animation: bak-pulse 1.5s ease-in-out infinite;',
      '}',
      '.bak-skeleton-text {',
      '  width: 60px;',
      '  height: 14px;',
      '  border-radius: 4px;',
      '  background: #E0E0E0;',
      '  animation: bak-pulse 1.5s ease-in-out infinite;',
      '}'
    ].join('\n');
    shadow.appendChild(style);

    var wrapper = document.createElement('div');
    wrapper.className = 'bak-widget';
    shadow.appendChild(wrapper);

    // Skeleton
    var skeletonHtml = '<div class="bak-grid">';
    for (var i = 0; i < 8; i++) {
      skeletonHtml += [
        '<div class="bak-skeleton-card">',
        '  <div class="bak-skeleton-circle"></div>',
        '  <div class="bak-skeleton-text"></div>',
        '</div>'
      ].join('');
    }
    skeletonHtml += '</div>';
    wrapper.innerHTML = skeletonHtml;

    fetch(BASE + '/api/public/sports')
      .then(function(r) {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json();
      })
      .then(function(data) {
        var sports = Array.isArray(data) ? data : (data.sports || []);
        if (!sports.length) {
          wrapper.innerHTML = '';
          return;
        }

        var html = '<div class="bak-grid">';
        sports.forEach(function(sport) {
          var name = typeof sport === 'string' ? sport : sport.name;
          var emoji = SPORT_EMOJIS[name] || '\uD83C\uDFC5';
          html += [
            '<div class="bak-sport-card">',
            '  <span class="bak-sport-emoji">' + emoji + '</span>',
            '  <span class="bak-sport-name">' + escapeHtml(name) + '</span>',
            '</div>'
          ].join('');
        });
        html += '</div>';
        wrapper.innerHTML = html;
      })
      .catch(function() {
        wrapper.innerHTML = '';
      });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
