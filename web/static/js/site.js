// Cookie-Einwilligung, Zwei-Klick-Einbettungen und Bildergalerie. Kein Tracking.
(function () {
  'use strict';

  const COOKIE = 'consent';

  let memoryConsent = null; // Fallback, falls Cookies blockiert sind

  function getConsent() {
    try {
      const m = document.cookie.match(/(?:^|;\s*)consent=(essential|external)/);
      if (m) return m[1];
    } catch { /* Cookies nicht verfügbar */ }
    return memoryConsent;
  }

  function setConsent(value) {
    memoryConsent = value;
    try {
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${COOKIE}=${value}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
    } catch { /* Cookies nicht verfügbar */ }
  }

  // ---- Banner ----
  const banner = document.getElementById('consent');

  function showBanner() {
    if (!banner) return;
    banner.hidden = false;
    banner.querySelector('[data-consent="external"]')?.focus({ preventScroll: true });
  }

  document.addEventListener('click', (e) => {
    const choice = e.target.closest('[data-consent]');
    if (choice) {
      setConsent(choice.dataset.consent);
      banner.hidden = true;
      if (choice.dataset.consent === 'external') loadAllEmbeds();
      else unloadAllEmbeds();
    }
    if (e.target.closest('[data-consent-open]')) showBanner();
  });

  if (!getConsent()) showBanner();

  // ---- Externe Player (erst nach Einwilligung laden) ----
  function loadEmbed(box) {
    if (box.querySelector('iframe')) return;
    const iframe = document.createElement('iframe');
    iframe.src = box.dataset.embedSrc;
    iframe.height = box.dataset.embedHeight || '232';
    iframe.title = box.dataset.embedTitle || 'Podcast-Player';
    iframe.loading = 'lazy';
    iframe.allow = 'autoplay *; encrypted-media *; clipboard-write; fullscreen';
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-storage-access-by-user-activation');
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    box.querySelector('.embed-gate').hidden = true;
    box.appendChild(iframe);
  }

  function loadAllEmbeds() {
    document.querySelectorAll('[data-embed-src]').forEach(loadEmbed);
  }

  function unloadAllEmbeds() {
    document.querySelectorAll('[data-embed-src]').forEach((box) => {
      box.querySelector('iframe')?.remove();
      box.querySelector('.embed-gate').hidden = false;
    });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-embed-load]');
    if (!btn) return;
    const box = btn.closest('[data-embed-src]');
    if (box.querySelector('[data-embed-remember]')?.checked) {
      setConsent('external');
      if (banner) banner.hidden = true;
      loadAllEmbeds();
    } else {
      loadEmbed(box);
    }
  });

  if (getConsent() === 'external') loadAllEmbeds();

  // ---- Lightbox ----
  const dialog = document.getElementById('lightbox');
  if (dialog && typeof dialog.showModal === 'function') {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-lightbox]');
      if (!link) return;
      e.preventDefault();
      dialog.querySelector('img').src = link.href;
      dialog.querySelector('img').alt = link.querySelector('img')?.alt || '';
      dialog.querySelector('.lightbox-caption').textContent = link.dataset.caption || '';
      dialog.showModal();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog || e.target.tagName === 'IMG') dialog.close();
    });
  }
})();
