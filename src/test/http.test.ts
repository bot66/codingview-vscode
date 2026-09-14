import { afterEach, describe, expect, test, vi } from 'vitest';

import { decodeGbk, defaultHttpGetBytes, HttpError } from '../providers/http';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decodeGbk', () => {
  test('decodes GBK-encoded Chinese text', () => {
    const bytes = Uint8Array.from([0xc9, 0xcf, 0xd6, 0xa4, 0xd6, 0xb8, 0xca, 0xfd]);

    expect(decodeGbk(bytes)).toBe('上证指数');
  });

  test('decodes ASCII payloads unchanged', () => {
    expect(decodeGbk(new TextEncoder().encode('v_usAAPL="200~'))).toBe('v_usAAPL="200~');
  });
});

describe('defaultHttpGetBytes', () => {
  test('returns the response body as bytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))));

    await expect(defaultHttpGetBytes('https://example.com/data')).resolves.toEqual(new Uint8Array([1, 2, 3]));
  });

  test('forwards custom headers and the abort signal', async () => {
    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await defaultHttpGetBytes('https://example.com/data', {
      headers: { Referer: 'https://finance.sina.com.cn/' },
      signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/data', {
      headers: { Referer: 'https://finance.sina.com.cn/' },
      signal: controller.signal,
      redirect: 'follow',
    });
  });

  test('throws HttpError for a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));

    await expect(defaultHttpGetBytes('https://example.com/data')).rejects.toThrowError(HttpError);
  });
});
