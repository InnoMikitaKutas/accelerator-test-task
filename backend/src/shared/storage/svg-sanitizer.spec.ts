/**
 * @jest-environment jsdom
 *
 * DOMPurify needs a DOM `window`. Running this suite in the jsdom environment provides one
 * globally, so the sanitizer never has to `require('jsdom')` (whose ESM dep tree ts-jest
 * cannot transform). The real Node server builds the window via jsdom at runtime.
 */
import { sanitizeSvg } from './svg-sanitizer';

describe('sanitizeSvg', () => {
  it('strips <script> elements', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert/);
  });

  it('strips on* event handlers', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)"/></svg>');
    expect(out).not.toMatch(/onload/i);
  });

  it('strips <foreignObject> and external/script hrefs', () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="javascript:alert(1)"/></body></foreignObject><a href="javascript:alert(1)">x</a></svg>',
    );
    expect(out).not.toMatch(/foreignObject/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/iframe/i);
  });

  it('keeps benign shapes', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>');
    expect(out).toMatch(/<circle/i);
    expect(out).toMatch(/<svg/i);
  });
});
