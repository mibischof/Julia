// Kleine UI-Bausteine: Escaping, Bottom-Sheets, Rückfragen, Hinweise, Dateien.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let sheetCounter = 0;

/**
 * Öffnet ein Formular als Bottom-Sheet.
 * onSubmit(form) → false, um offen zu bleiben (z. B. bei Fehlern).
 * actions: zusätzliche Knöpfe [{ id, label, kind: 'danger' | 'ghost' }], onAction(id, form, close)
 */
export function openSheet({ title, body, submitLabel = 'Speichern', onSubmit, actions = [], onAction, onMount, wide = false }) {
  const id = `sheet-${++sheetCounter}`;
  const dialog = document.createElement('dialog');
  dialog.className = `sheet${wide ? ' sheet--wide' : ''}`;
  dialog.setAttribute('aria-labelledby', `${id}-title`);
  dialog.innerHTML = `
    <form class="sheet__form" novalidate>
      <header class="sheet__head">
        <h2 id="${id}-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-sheet-close aria-label="Schließen">${ICONS.close}</button>
      </header>
      <div class="sheet__body">${body}</div>
      <footer class="sheet__foot">
        ${actions.map((a) => `<button type="button" class="btn btn--${a.kind || 'ghost'}" data-sheet-action="${esc(a.id)}">${esc(a.label)}</button>`).join('')}
        <span class="sheet__spacer"></span>
        ${onSubmit ? `<button type="submit" class="btn btn--primary">${esc(submitLabel)}</button>` : ''}
      </footer>
    </form>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector('form');

  const close = () => {
    dialog.close();
  };
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close(); // Klick auf den Hintergrund
    const closeBtn = e.target.closest('[data-sheet-close]');
    if (closeBtn) close();
    const actionBtn = e.target.closest('[data-sheet-action]');
    if (actionBtn && onAction) onAction(actionBtn.dataset.sheetAction, form, close);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const firstInvalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.reportValidity?.();
      return;
    }
    const result = await onSubmit(form, close);
    if (result !== false) close();
  });
  onMount?.(form, close);
  dialog.showModal();
  const autofocus = form.querySelector('[autofocus]');
  if (autofocus) autofocus.focus();
  return { dialog, form, close };
}

/** Rückfrage mit mehreren Antworten. Liefert die id der Antwort oder null. */
export function choose({ title, message = '', options }) {
  return new Promise((resolve) => {
    let answered = null;
    const { dialog } = openSheet({
      title,
      body: `${message ? `<p class="sheet__message">${esc(message)}</p>` : ''}
        <div class="choice-list">${options
          .map((o) => `<button type="button" class="btn btn--${o.kind || 'ghost'} btn--block" data-choice="${esc(o.id)}">${esc(o.label)}</button>`)
          .join('')}</div>`,
      onMount(form, close) {
        form.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-choice]');
          if (!btn) return;
          answered = btn.dataset.choice;
          close();
        });
      },
    });
    dialog.addEventListener('close', () => resolve(answered));
  });
}

export async function confirmAction({ title, message, confirmLabel = 'Löschen', kind = 'danger' }) {
  const answer = await choose({
    title,
    message,
    options: [
      { id: 'yes', label: confirmLabel, kind },
      { id: 'no', label: 'Abbrechen', kind: 'ghost' },
    ],
  });
  return answer === 'yes';
}

export function toast(message, { actionLabel, onAction, timeout = 4000 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(message)}</span>${actionLabel ? `<button type="button" class="toast__action">${esc(actionLabel)}</button>` : ''}`;
  host.appendChild(el);
  const remove = () => el.remove();
  el.querySelector('.toast__action')?.addEventListener('click', () => {
    onAction?.();
    remove();
  });
  if (timeout) setTimeout(remove, timeout);
  return remove;
}

/** Datei über das Teilen-Menü (Handy) oder als Download anbieten. */
export async function shareOrDownload(filename, text, mime) {
  const file = typeof File !== 'undefined' ? new File([text], filename, { type: mime }) : null;
  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'aborted';
    }
  }
  download(filename, text, mime);
  return 'downloaded';
}

export function download(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// Strich-Icons (24er Raster), einheitlich 1.8px
const svg = (paths) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  today: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  calendar: svg('<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
  timetable: svg('<rect x="3" y="3.5" width="18" height="17" rx="2.5"/><path d="M3 9h18M3 14.5h18M9 3.5v17M15 3.5v17"/>'),
  pickup: svg('<path d="M5 17h14M6.5 17l1.6-5.2A2 2 0 0 1 10 10.4h4a2 2 0 0 1 1.9 1.4L17.5 17"/><circle cx="8" cy="18.5" r="1.6"/><circle cx="16" cy="18.5" r="1.6"/><path d="M12 3.5v4M9.5 6 12 3.5 14.5 6"/>'),
  more: svg('<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  chevronLeft: svg('<path d="M15 5l-7 7 7 7"/>'),
  chevronRight: svg('<path d="M9 5l7 7-7 7"/>'),
  bell: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  swap: svg('<path d="M7 7h11l-3-3M17 17H6l3 3"/>'),
  pin: svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>'),
  repeat: svg('<path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3"/>'),
  sun: svg('<path d="M3 20h18M6 20a6 6 0 0 1 12 0M12 8v2M5.6 11.6l1.4 1.4M18.4 11.6 17 13"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
};
