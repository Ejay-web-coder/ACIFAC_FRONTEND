/**
 * Copies text to the clipboard. Returns whether it worked.
 *
 * navigator.clipboard only exists on https or localhost: opened at a LAN address
 * such as http://192.168.1.7:5173 it is undefined. There the text is copied the
 * older way, by selecting it in a hidden text box and running the copy command.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused or the page lost focus: try the older way below.
    }
  }
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  // Off screen but still selectable; 16px stops iOS zooming in on it.
  box.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0;font-size:16px;';
  const focused = document.activeElement as HTMLElement | null;
  document.body.appendChild(box);
  box.focus();
  box.select();
  box.setSelectionRange(0, text.length);
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  box.remove();
  focused?.focus?.();
  return copied;
}
