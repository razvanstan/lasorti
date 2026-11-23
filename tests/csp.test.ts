import { expect, it } from 'vitest';
import { inlineScriptHashes } from '../integrations/csp.mjs';

it('hashes only inline scripts that run', () => {
  const html =
    '<script src="/a.js"></script><script type="application/ld+json">{}</script><script type="module">alert(1)</script>';
  expect(inlineScriptHashes(html)).toEqual(["'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"]);
});
