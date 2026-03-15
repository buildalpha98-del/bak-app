(function() {
  'use strict';

  var script = document.currentScript;
  var targetId = script && script.getAttribute('data-target') || 'bak-enquiry';
  var BASE = script && script.getAttribute('data-api') || '';
  var color = script && script.getAttribute('data-color') || '#E8712A';

  function init() {
    var container = document.getElementById(targetId);
    if (!container) return;

    var shadow = container.attachShadow({ mode: 'open' });

    var style = document.createElement('style');
    style.textContent = [
      '.bak-widget {',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
      '  box-sizing: border-box;',
      '  max-width: 560px;',
      '}',
      '.bak-widget *, .bak-widget *::before, .bak-widget *::after {',
      '  box-sizing: border-box;',
      '}',
      '.bak-form {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 16px;',
      '}',
      '.bak-field {',
      '  display: flex;',
      '  flex-direction: column;',
      '  gap: 4px;',
      '}',
      '.bak-label {',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  color: #1A1A1A;',
      '}',
      '.bak-required {',
      '  color: #DC2626;',
      '  margin-left: 2px;',
      '}',
      '.bak-input, .bak-select, .bak-textarea {',
      '  width: 100%;',
      '  padding: 10px 12px;',
      '  border: 1px solid #D0D0D0;',
      '  border-radius: 6px;',
      '  font-size: 14px;',
      '  font-family: inherit;',
      '  color: #1A1A1A;',
      '  background: #FFFFFF;',
      '  transition: border-color 0.2s ease, box-shadow 0.2s ease;',
      '  outline: none;',
      '}',
      '.bak-input:focus, .bak-select:focus, .bak-textarea:focus {',
      '  border-color: ' + color + ';',
      '  box-shadow: 0 0 0 3px ' + color + '20;',
      '}',
      '.bak-input.bak-error, .bak-select.bak-error, .bak-textarea.bak-error {',
      '  border-color: #DC2626;',
      '}',
      '.bak-textarea {',
      '  min-height: 100px;',
      '  resize: vertical;',
      '}',
      '.bak-error-text {',
      '  font-size: 12px;',
      '  color: #DC2626;',
      '  margin-top: 2px;',
      '}',
      '.bak-row {',
      '  display: grid;',
      '  grid-template-columns: 1fr 1fr;',
      '  gap: 16px;',
      '}',
      '@media (max-width: 480px) {',
      '  .bak-row { grid-template-columns: 1fr; }',
      '}',
      '.bak-submit {',
      '  padding: 12px 24px;',
      '  background: ' + color + ';',
      '  color: #FFFFFF;',
      '  border: none;',
      '  border-radius: 6px;',
      '  font-size: 15px;',
      '  font-weight: 600;',
      '  font-family: inherit;',
      '  cursor: pointer;',
      '  transition: opacity 0.2s ease;',
      '  width: 100%;',
      '}',
      '.bak-submit:hover { opacity: 0.9; }',
      '.bak-submit:disabled {',
      '  opacity: 0.6;',
      '  cursor: not-allowed;',
      '}',
      '.bak-success {',
      '  text-align: center;',
      '  padding: 32px 16px;',
      '}',
      '.bak-success-icon {',
      '  font-size: 48px;',
      '  margin-bottom: 12px;',
      '}',
      '.bak-success-title {',
      '  font-size: 20px;',
      '  font-weight: 700;',
      '  color: #1A1A1A;',
      '  margin-bottom: 8px;',
      '}',
      '.bak-success-text {',
      '  font-size: 14px;',
      '  color: #666666;',
      '  line-height: 1.5;',
      '}',
      '.bak-form-error {',
      '  padding: 10px 14px;',
      '  background: #FEF2F2;',
      '  border: 1px solid #FECACA;',
      '  border-radius: 6px;',
      '  color: #DC2626;',
      '  font-size: 13px;',
      '}'
    ].join('\n');
    shadow.appendChild(style);

    var wrapper = document.createElement('div');
    wrapper.className = 'bak-widget';
    shadow.appendChild(wrapper);

    renderForm();

    function renderForm() {
      wrapper.innerHTML = [
        '<form class="bak-form" novalidate>',
        '  <div class="bak-field">',
        '    <label class="bak-label">Centre / Organisation Name<span class="bak-required">*</span></label>',
        '    <input type="text" name="centre_name" class="bak-input" placeholder="e.g. Sunshine Early Learning" required>',
        '  </div>',
        '  <div class="bak-row">',
        '    <div class="bak-field">',
        '      <label class="bak-label">Contact Name</label>',
        '      <input type="text" name="contact_name" class="bak-input" placeholder="Your full name">',
        '    </div>',
        '    <div class="bak-field">',
        '      <label class="bak-label">Type</label>',
        '      <select name="type" class="bak-select">',
        '        <option value="childcare_centre">Childcare Centre</option>',
        '        <option value="school">School</option>',
        '        <option value="other">Other</option>',
        '      </select>',
        '    </div>',
        '  </div>',
        '  <div class="bak-row">',
        '    <div class="bak-field">',
        '      <label class="bak-label">Email<span class="bak-required">*</span></label>',
        '      <input type="email" name="email" class="bak-input" placeholder="you@example.com" required>',
        '    </div>',
        '    <div class="bak-field">',
        '      <label class="bak-label">Phone</label>',
        '      <input type="tel" name="phone" class="bak-input" placeholder="04XX XXX XXX">',
        '    </div>',
        '  </div>',
        '  <div class="bak-field">',
        '    <label class="bak-label">Message</label>',
        '    <textarea name="message" class="bak-textarea" placeholder="Tell us about your needs..."></textarea>',
        '  </div>',
        '  <div class="bak-form-error" style="display: none;"></div>',
        '  <button type="submit" class="bak-submit">Send Enquiry</button>',
        '</form>'
      ].join('');

      var form = shadow.querySelector('.bak-form');
      form.addEventListener('submit', handleSubmit);
    }

    function handleSubmit(e) {
      e.preventDefault();

      var form = shadow.querySelector('.bak-form');
      var errorBox = shadow.querySelector('.bak-form-error');
      var submitBtn = shadow.querySelector('.bak-submit');

      // Clear previous errors
      var errorTexts = shadow.querySelectorAll('.bak-error-text');
      for (var i = 0; i < errorTexts.length; i++) errorTexts[i].remove();
      var errorInputs = shadow.querySelectorAll('.bak-error');
      for (var j = 0; j < errorInputs.length; j++) errorInputs[j].classList.remove('bak-error');
      errorBox.style.display = 'none';

      var centreName = form.querySelector('[name="centre_name"]');
      var email = form.querySelector('[name="email"]');
      var valid = true;

      if (!centreName.value.trim()) {
        showFieldError(centreName, 'Centre name is required');
        valid = false;
      }

      if (!email.value.trim()) {
        showFieldError(email, 'Email is required');
        valid = false;
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
        showFieldError(email, 'Please enter a valid email address');
        valid = false;
      }

      if (!valid) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      var payload = {
        centre_name: centreName.value.trim(),
        contact_name: form.querySelector('[name="contact_name"]').value.trim(),
        email: email.value.trim(),
        phone: form.querySelector('[name="phone"]').value.trim(),
        message: form.querySelector('[name="message"]').value.trim(),
        type: form.querySelector('[name="type"]').value
      };

      fetch(BASE + '/api/crm/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function(r) {
          if (!r.ok) throw new Error('Submission failed');
          return r.json();
        })
        .then(function() {
          wrapper.innerHTML = [
            '<div class="bak-success">',
            '  <div class="bak-success-icon">\u2705</div>',
            '  <div class="bak-success-title">Enquiry Sent!</div>',
            '  <div class="bak-success-text">Thank you for your interest in Build Alpha Kids.<br>We\'ll be in touch within 1\u20132 business days.</div>',
            '</div>'
          ].join('');
        })
        .catch(function() {
          errorBox.textContent = 'Something went wrong. Please try again or contact us directly.';
          errorBox.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Enquiry';
        });
    }

    function showFieldError(input, message) {
      input.classList.add('bak-error');
      var err = document.createElement('div');
      err.className = 'bak-error-text';
      err.textContent = message;
      input.parentNode.appendChild(err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
