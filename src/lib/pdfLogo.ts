// The cooperative's logo on every PDF the system makes (paper forms, the
// PhilMech report, transaction receipts). A small print copy of public/logo.png
// is loaded once; a PDF is still made without it if it cannot be loaded.
import type { jsPDF } from 'jspdf';

export const PDF_LOGO_PATH = '/logo-print.jpg';
export const COOPERATIVE_NAME = 'AMNAY-CABAGAN IRRIGATORS AND FARMERS AGRICULTURE COOPERATIVE';

let logo: Promise<Uint8Array | null> | null = null;

export function loadPdfLogo() {
  logo ??= fetch(PDF_LOGO_PATH)
    .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
    .then((buffer) => new Uint8Array(buffer))
    .catch(() => { logo = null; return null; });
  return logo;
}

/** Draws the logo, size mm square, with its top-left corner at x, y. */
export function drawPdfLogo(doc: jsPDF, image: Uint8Array | null, x: number, y: number, size: number) {
  if (!image) return false;
  try {
    doc.addImage(image, 'JPEG', x, y, size, size, 'acifac-logo', 'FAST');
    return true;
  } catch {
    return false;
  }
}
