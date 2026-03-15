(function() {
  'use strict';

  var script = document.currentScript;
  var targetId = script && script.getAttribute('data-target') || 'bak-testimonials';
  var BASE = script && script.getAttribute('data-api') || '';
  var color = script && script.getAttribute('data-color') || '#E8712A';

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
      '  position: relative;',
      '  overflow: hidden;',
      '}',
      '.bak-widget *, .bak-widget *::before, .bak-widget *::after {',
      '  box-sizing: border-box;',
      '}',
      '.bak-carousel-viewport {',
      '  overflow: hidden;',
      '  border-radius: 12px;',
      '}',
      '.bak-carousel-track {',
      '  display: flex;',
      '  transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);',
      '}',
      '.bak-testimonial-card {',
      '  flex: 0 0 100%;',
      '  min-width: 100%;',
      '  padding: 32px 24px;',
      '  background: #FFFFFF;',
      '  border: 1px solid #E8E8E8;',
      '  border-radius: 12px;',
      '}',
      '.bak-stars {',
      '  font-size: 18px;',
      '  margin-bottom: 12px;',
      '  letter-spacing: 2px;',
      '}',
      '.bak-star-filled { color: #F5A623; }',
      '.bak-star-empty { color: #D0D0D0; }',
      '.bak-comment {',
      '  font-size: 15px;',
      '  line-height: 1.6;',
      '  color: #1A1A1A;',
      '  margin-bottom: 16px;',
      '  font-style: italic;',
      '}',
      '.bak-author {',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  color: ' + color + ';',
      '}',
      '.bak-controls {',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  gap: 12px;',
      '  margin-top: 16px;',
      '}',
      '.bak-arrow {',
      '  width: 36px;',
      '  height: 36px;',
      '  border-radius: 50%;',
      '  border: 1px solid #D0D0D0;',
      '  background: #FFFFFF;',
      '  cursor: pointer;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  font-size: 16px;',
      '  color: #666666;',
      '  transition: border-color 0.2s ease, color 0.2s ease;',
      '  padding: 0;',
      '  line-height: 1;',
      '}',
      '.bak-arrow:hover {',
      '  border-color: ' + color + ';',
      '  color: ' + color + ';',
      '}',
      '.bak-dots {',
      '  display: flex;',
      '  gap: 6px;',
      '}',
      '.bak-dot {',
      '  width: 8px;',
      '  height: 8px;',
      '  border-radius: 50%;',
      '  background: #D0D0D0;',
      '  transition: background 0.3s ease;',
      '  cursor: pointer;',
      '  border: none;',
      '  padding: 0;',
      '}',
      '.bak-dot.active {',
      '  background: ' + color + ';',
      '}',
      '.bak-skeleton-card {',
      '  padding: 32px 24px;',
      '  background: #FFFFFF;',
      '  border: 1px solid #E8E8E8;',
      '  border-radius: 12px;',
      '}',
      '.bak-skeleton-line {',
      '  height: 14px;',
      '  border-radius: 4px;',
      '  background: #E0E0E0;',
      '  animation: bak-pulse 1.5s ease-in-out infinite;',
      '  margin-bottom: 10px;',
      '}'
    ].join('\n');
    shadow.appendChild(style);

    var wrapper = document.createElement('div');
    wrapper.className = 'bak-widget';
    shadow.appendChild(wrapper);

    // Skeleton
    wrapper.innerHTML = [
      '<div class="bak-skeleton-card">',
      '  <div class="bak-skeleton-line" style="width: 100px;"></div>',
      '  <div class="bak-skeleton-line" style="width: 90%;"></div>',
      '  <div class="bak-skeleton-line" style="width: 75%;"></div>',
      '  <div class="bak-skeleton-line" style="width: 120px; margin-top: 16px;"></div>',
      '</div>'
    ].join('');

    fetch(BASE + '/api/public/testimonials')
      .then(function(r) {
        if (!r.ok) throw new Error('Failed to fetch');
        return r.json();
      })
      .then(function(data) {
        var testimonials = Array.isArray(data) ? data : (data.testimonials || []);
        if (!testimonials.length) {
          wrapper.innerHTML = '';
          return;
        }

        var currentIndex = 0;
        var autoplayTimer = null;
        var isPaused = false;

        function renderStars(rating) {
          var html = '';
          var r = Math.round(rating || 0);
          for (var i = 1; i <= 5; i++) {
            html += '<span class="' + (i <= r ? 'bak-star-filled' : 'bak-star-empty') + '">\u2605</span>';
          }
          return html;
        }

        // Build carousel HTML
        var html = '<div class="bak-carousel-viewport"><div class="bak-carousel-track">';
        testimonials.forEach(function(t) {
          html += [
            '<div class="bak-testimonial-card">',
            '  <div class="bak-stars">' + renderStars(t.rating) + '</div>',
            '  <div class="bak-comment">\u201C' + escapeHtml(t.comment || t.text || '') + '\u201D</div>',
            '  <div class="bak-author">\u2014 ' + escapeHtml(t.name || t.author || 'Anonymous') + '</div>',
            '</div>'
          ].join('');
        });
        html += '</div></div>';

        // Controls
        if (testimonials.length > 1) {
          html += '<div class="bak-controls">';
          html += '<button class="bak-arrow bak-prev" aria-label="Previous">\u2039</button>';
          html += '<div class="bak-dots">';
          testimonials.forEach(function(_, i) {
            html += '<button class="bak-dot' + (i === 0 ? ' active' : '') + '" data-index="' + i + '" aria-label="Go to slide ' + (i + 1) + '"></button>';
          });
          html += '</div>';
          html += '<button class="bak-arrow bak-next" aria-label="Next">\u203A</button>';
          html += '</div>';
        }

        wrapper.innerHTML = html;

        var track = shadow.querySelector('.bak-carousel-track');
        var dots = shadow.querySelectorAll('.bak-dot');

        function goTo(index) {
          if (index < 0) index = testimonials.length - 1;
          if (index >= testimonials.length) index = 0;
          currentIndex = index;
          track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';
          for (var i = 0; i < dots.length; i++) {
            dots[i].classList.toggle('active', i === currentIndex);
          }
        }

        function startAutoplay() {
          stopAutoplay();
          autoplayTimer = setInterval(function() {
            if (!isPaused) goTo(currentIndex + 1);
          }, 5000);
        }

        function stopAutoplay() {
          if (autoplayTimer) {
            clearInterval(autoplayTimer);
            autoplayTimer = null;
          }
        }

        // Event listeners
        var viewport = shadow.querySelector('.bak-carousel-viewport');
        viewport.addEventListener('mouseenter', function() { isPaused = true; });
        viewport.addEventListener('mouseleave', function() { isPaused = false; });

        var prevBtn = shadow.querySelector('.bak-prev');
        var nextBtn = shadow.querySelector('.bak-next');
        if (prevBtn) prevBtn.addEventListener('click', function() { goTo(currentIndex - 1); });
        if (nextBtn) nextBtn.addEventListener('click', function() { goTo(currentIndex + 1); });

        for (var i = 0; i < dots.length; i++) {
          dots[i].addEventListener('click', function() {
            goTo(parseInt(this.getAttribute('data-index'), 10));
          });
        }

        if (testimonials.length > 1) startAutoplay();
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
