// QR codes drawn from their squares ("modules"), so the same code is sharp on a
// screen (SVG) and in a PDF (filled rectangles) at any size, with no picture.
import { create } from 'qrcode';
import type { jsPDF } from 'jspdf';

/**
 * The QR's squares, row by row (true = dark). Error correction Q (about 25% of
 * the code can be lost), for laminated cards with scratches or glare.
 */
export function qrModules(text: string): boolean[][] {
  const { modules } = create(text, { errorCorrectionLevel: 'Q' });
  return Array.from({ length: modules.size }, (_, row) => Array.from({ length: modules.size }, (_, col) => Boolean(modules.get(row, col))));
}

/**
 * Draws the QR with its top-left corner at x, y (mm), size mm square, on white
 * already there. Dark squares next to each other in a row are one rectangle,
 * a hair taller than a square so no light line shows between rows.
 */
export function drawQrOnPdf(doc: jsPDF, modules: boolean[][], x: number, y: number, size: number) {
  const count = modules.length;
  const cell = size / count;
  doc.setFillColor(0, 0, 0);
  modules.forEach((row, r) => {
    let c = 0;
    while (c < count) {
      if (!row[c]) { c += 1; continue; }
      let end = c;
      while (end + 1 < count && row[end + 1]) end += 1;
      doc.rect(x + c * cell, y + r * cell, (end - c + 1) * cell, cell + (r < count - 1 ? 0.02 : 0), 'F');
      c = end + 1;
    }
  });
}

/** The SVG path of the dark squares, `margin` squares in from the edge (QR readers want a light border). */
export function qrSvgPath(modules: boolean[][], margin: number) {
  const parts: string[] = [];
  modules.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (!row[c]) { c += 1; continue; }
      let end = c;
      while (end + 1 < row.length && row[end + 1]) end += 1;
      parts.push(`M${c + margin} ${r + margin}h${end - c + 1}v1h-${end - c + 1}z`);
      c = end + 1;
    }
  });
  return parts.join('');
}
