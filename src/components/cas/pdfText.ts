// A PDF's text with positions, page by page, read in the browser with pdf.js.
// Loaded only when importing a statement: pdf.js is large.

import type { TextItem } from '../../lib/cas';

export class PasswordNeeded extends Error {
  constructor(readonly wrong: boolean) { super(wrong ? 'That password is not right.' : 'This PDF is password protected.'); }
}

export async function pdfText(file: File, password?: string): Promise<TextItem[][]> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // No font loading: only the text is needed. (pdf.js 6 uses no eval, so the site's security policy is fine.)
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password, disableFontFace: true });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    if ((e as { name?: string }).name === 'PasswordException') throw new PasswordNeeded(!!password);
    throw e;
  }
  const pages: TextItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    pages.push(content.items.flatMap((it) => ('str' in it && it.str.trim() ? [{ x: it.transform[4], y: it.transform[5], str: it.str }] : [])));
  }
  await task.destroy();
  return pages;
}
