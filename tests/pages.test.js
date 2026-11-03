const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('Terms, Privacy, Contact, About pages and Pro Footer Integrity', () => {
  const publicHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const rootHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  // 1. Root index.html must be identical to public/index.html
  assert.equal(rootHtml.length, publicHtml.length, 'Root index.html and public/index.html length must match');
  assert.equal(rootHtml, publicHtml, 'Root index.html must be strictly identical to public/index.html');

  // 2. All 4 views must exist
  assert.ok(publicHtml.includes('id="v-about"'), 'v-about view must exist');
  assert.ok(publicHtml.includes('id="v-contact"'), 'v-contact view must exist');
  assert.ok(publicHtml.includes('id="v-terms"'), 'v-terms view must exist');
  assert.ok(publicHtml.includes('id="v-privacy"'), 'v-privacy view must exist');

  // 3. Professional footer must exist
  assert.ok(publicHtml.includes('class="dh-pro-footer"'), 'dh-pro-footer must exist');
  assert.ok(publicHtml.includes('All Systems Operational'), 'Status indicator must exist');
  assert.ok(publicHtml.includes('data-go="about"'), 'About link in footer must exist');
  assert.ok(publicHtml.includes('data-go="contact"'), 'Contact link in footer must exist');
  assert.ok(publicHtml.includes('data-go="terms"'), 'Terms link in footer must exist');
  assert.ok(publicHtml.includes('data-go="privacy"'), 'Privacy link in footer must exist');

  // 4. Contact form must exist
  assert.ok(publicHtml.includes('id="dh-contact-form"'), 'dh-contact-form must exist');
  assert.ok(publicHtml.includes('submitContactForm'), 'submitContactForm handler must exist');

  // 5. URL and Routing handlers must exist
  assert.ok(publicHtml.includes('initAppRouting'), 'initAppRouting route handler must exist');

  // 6. Passcode patterns must remain completely eradicated
  assert.ok(!publicHtml.includes('dh-cert-lock-modal'), 'No passcode modal allowed');
  assert.ok(!publicHtml.includes('verifyCertPasscode'), 'No passcode verify function allowed');
  assert.ok(!publicHtml.includes('dh_cert_unlocked'), 'No passcode storage allowed');
});
