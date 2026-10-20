// Redaktionsbereich: Editor-Hilfen, Vorschau, Metadaten-Abruf
(function () {
  'use strict';

  const csrf = document.querySelector('meta[name="csrf-token"]')?.content;

  async function postJson(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify(data),
      credentials: 'same-origin',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Fehler ${res.status}`);
    return json;
  }

  // ---- Bestätigung vor dem Löschen ----
  document.addEventListener('submit', (e) => {
    const msg = e.target.dataset.confirm;
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // ---- Markdown-Editor ----
  document.querySelectorAll('[data-editor]').forEach((editor) => {
    const ta = editor.querySelector('textarea');
    const preview = editor.querySelector('.editor-preview');

    function wrap(before, after = before) {
      const { selectionStart: s, selectionEnd: en, value } = ta;
      const sel = value.slice(s, en) || 'Text';
      ta.setRangeText(before + sel + after, s, en, 'end');
      ta.focus();
    }
    function prefixLine(prefix) {
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      ta.setRangeText(prefix, lineStart, lineStart, 'end');
      ta.focus();
    }

    editor.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.md) wrap(b.dataset.md);
      else if (b.dataset.mdLine) prefixLine(b.dataset.mdLine);
      else if ('mdLink' in b.dataset) {
        const url = window.prompt('Link-Adresse (https://…)');
        if (url) wrap('[', `](${url})`);
      } else if ('previewToggle' in b.dataset) {
        const show = preview.hidden;
        if (show) {
          preview.innerHTML = '<p class="muted">Lädt…</p>';
          try {
            const { html } = await postJson('/admin/vorschau', { markdown: ta.value });
            preview.innerHTML = html || '<p class="muted">(leer)</p>';
          } catch (err) {
            preview.textContent = err.message;
          }
        }
        preview.hidden = !show;
        ta.hidden = show;
        b.textContent = show ? 'Bearbeiten' : 'Vorschau';
      }
    });
  });

  // ---- Beitragsart: passende Bereiche zeigen ----
  const kindInputs = document.querySelectorAll('input[name="kind"]');
  function updateKind() {
    const kind = document.querySelector('input[name="kind"]:checked')?.value;
    document.querySelectorAll('.only-kind').forEach((el) => {
      el.hidden = !el.dataset.kinds.split(' ').includes(kind);
    });
  }
  kindInputs.forEach((i) => i.addEventListener('change', updateKind));
  if (kindInputs.length) updateKind();

  // ---- Link-Vorschau ----
  const linkBtn = document.querySelector('[data-link-fetch]');
  if (linkBtn) {
    const $ = (sel) => document.querySelector(sel);
    linkBtn.addEventListener('click', async () => {
      const status = $('[data-link-status]');
      const url = $('[data-link-url]').value.trim();
      if (!url) return (status.textContent = 'Bitte zuerst eine URL eingeben.');
      status.textContent = 'Wird abgerufen…';
      linkBtn.disabled = true;
      try {
        const d = await postJson('/admin/beitraege/link-vorschau', { url });
        $('[data-link-url]').value = d.url || url;
        if (d.title) $('[data-link-title]').value = d.title;
        if (d.source) $('[data-link-source]').value = d.source;
        if (d.description) $('[data-link-desc]').value = d.description;
        const title = document.querySelector('input[name="title"]');
        if (!title.value && d.title) title.value = d.title;
        const thumb = $('[data-link-thumb]');
        thumb.textContent = '';
        if (d.image) {
          $('[data-link-image-id]').value = d.image.id;
          const img = document.createElement('img');
          img.src = d.image.url;
          img.alt = '';
          thumb.appendChild(img);
        }
        status.textContent = 'Übernommen – bitte prüfen und ggf. anpassen.';
      } catch (err) {
        status.textContent = err.message;
      } finally {
        linkBtn.disabled = false;
      }
    });
  }

  // ---- Podcast-Metadaten ----
  const podBtn = document.querySelector('[data-podcast-fetch]');
  if (podBtn) {
    const $ = (sel) => document.querySelector(sel);
    podBtn.addEventListener('click', async () => {
      const status = $('[data-podcast-status]');
      status.textContent = 'Wird abgerufen…';
      podBtn.disabled = true;
      try {
        const d = await postJson('/admin/podcasts/metadaten', {
          spotify_url: $('[data-spotify-url]').value.trim(),
          apple_url: $('[data-apple-url]').value.trim(),
        });
        if (d.podcastName) $('[data-podcast-name]').value = d.podcastName;
        if (d.episodeTitle) $('[data-podcast-episode]').value = d.episodeTitle;
        if (d.publisher) $('[data-podcast-publisher]').value = d.publisher;
        const desc = $('[data-podcast-desc]');
        if (!desc.value && d.description) desc.value = d.description.slice(0, 600);
        const title = document.querySelector('input[name="title"]');
        if (!title.value) title.value = d.episodeTitle || d.podcastName || '';
        if (d.artwork) {
          $('[data-artwork-id]').value = d.artwork.id;
          const box = $('[data-artwork-preview]');
          box.textContent = '';
          const img = document.createElement('img');
          img.src = d.artwork.url;
          img.alt = '';
          box.appendChild(img);
        }
        status.textContent = d.artwork ? 'Daten und Cover übernommen.' : 'Daten übernommen (kein Cover gefunden).';
      } catch (err) {
        status.textContent = err.message;
      } finally {
        podBtn.disabled = false;
      }
    });
  }

  // ---- Markdown-Code aus der Mediathek kopieren ----
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-copy]');
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.dataset.copy);
      el.classList.add('copied');
      el.textContent = 'Kopiert ✓';
      setTimeout(() => { el.classList.remove('copied'); el.textContent = 'Markdown kopieren'; }, 1500);
    } catch {
      window.prompt('Zum Kopieren:', el.dataset.copy);
    }
  });
})();
