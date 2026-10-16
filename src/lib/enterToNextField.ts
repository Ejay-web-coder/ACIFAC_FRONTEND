// Enter moves to the next field of a form, as when filling in a paper form,
// instead of saving the form half filled in. Everywhere in the app:
//   * Enter goes to the next field of the same form (or window), Shift+Enter
//     to the one before; the cursor lands in it with its text selected, as Tab does.
//   * Enter on the last field saves the form, as before (its save button is
//     pressed, so a disabled save button stays disabled).
//   * Left alone: text areas (Enter starts a new line), buttons and links, Enter
//     while typing with an input method, Ctrl/Alt+Enter, fields whose component
//     already uses Enter (it calls preventDefault, e.g. the Kadiwa sheets), and
//     any element inside data-enter="default".
const FIELD = [
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]):not([type="file"])',
  'select',
  'textarea',
].join(', ');

type Field = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

// Fields a person can type in or choose from: shown, enabled, not read-only, reachable by Tab.
function usable(element: Element): element is Field {
  const field = element as Field;
  return !field.disabled && !(field instanceof HTMLInputElement && field.readOnly) && !(field instanceof HTMLTextAreaElement && field.readOnly)
    && field.tabIndex >= 0 && field.getClientRects().length > 0 && !field.closest('[inert], [aria-hidden="true"]');
}

function scopeOf(field: Field): HTMLFormElement | HTMLElement | null {
  return field.form ?? field.closest<HTMLElement>('[role="dialog"]');
}

function fieldsIn(scope: HTMLFormElement | HTMLElement): Field[] {
  // A form's own fields include those placed outside it with form="id".
  const candidates = scope instanceof HTMLFormElement ? Array.from(scope.elements) : Array.from(scope.querySelectorAll(FIELD));
  return candidates.filter((element) => element.matches(FIELD) && usable(element)) as Field[];
}

// The form's save button: its first submit button, including one outside it with form="id".
function saveButton(form: HTMLFormElement) {
  return Array.from(form.elements).find((element): element is HTMLButtonElement | HTMLInputElement =>
    (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) && element.type === 'submit');
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const target = event.target;
  if (!(target instanceof Element) || !target.matches(FIELD) || target instanceof HTMLTextAreaElement) return;
  if (target.closest('[data-enter="default"]')) return;
  const field = target as Field;
  const scope = scopeOf(field);
  if (!scope) return;

  // Options of one radio group count as one field.
  const fields = fieldsIn(scope).filter((other) => other === field || !(field instanceof HTMLInputElement && field.type === 'radio'
    && other instanceof HTMLInputElement && other.type === 'radio' && other.name === field.name && field.name !== ''));
  const index = fields.indexOf(field);
  if (index === -1) return;
  const step = event.shiftKey ? -1 : 1;
  const next = fields[index + step];

  if (next) {
    event.preventDefault();
    next.focus();
    if (next instanceof HTMLInputElement && ['text', 'search', 'tel', 'url', 'email', 'password', 'number', ''].includes(next.type)) {
      try { next.select(); } catch { /* some input types cannot select their text */ }
    } else if (next instanceof HTMLTextAreaElement) {
      next.select();
    }
    return;
  }
  // Shift+Enter on the first field, or Enter on the last field outside a form: nothing to do.
  if (event.shiftKey || !(scope instanceof HTMLFormElement)) return;
  // Enter on the last field saves the form through its save button.
  const button = saveButton(scope);
  if (!button) return; // no save button: the browser's usual Enter (a lone search box submits)
  event.preventDefault();
  if (!button.disabled) button.click();
}

let installed = false;

/** Called once at start-up. Listens on the document, after the components' own key handlers. */
export function installEnterToNextField() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', onKeyDown);
}
