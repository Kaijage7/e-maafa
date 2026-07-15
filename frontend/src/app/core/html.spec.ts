import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes every character that can break out of an HTML text or attribute context', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')"> &`))
      .toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt; &amp;');
  });

  it('returns an empty string for absent values', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-string values before escaping', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml({ toString: () => '<unsafe>' })).toBe('&lt;unsafe&gt;');
  });
});
