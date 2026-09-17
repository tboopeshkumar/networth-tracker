// App-level access: who may use the app, and who sees Edit controls.
//
// NOT a security boundary: page code can be edited in the browser, and these
// addresses are readable in the published JavaScript. The real gates are
// Google's — the OAuth test-user list, drive.file, and the sheet's sharing
// (Viewer vs Editor). This only decides what the UI offers.

export interface Access { allowed: boolean; canEdit: boolean }

export interface Lists { allowed: string[]; editors: string[] }

const norm = (e: string) => e.trim().toLowerCase();

/** Empty lists mean "no restriction" at this level. */
export function accessFor(email: string, lists: Lists): Access {
  const who = norm(email);
  return {
    allowed: !lists.allowed.length || lists.allowed.includes(who),
    canEdit: !lists.editors.length || lists.editors.includes(who),
  };
}
