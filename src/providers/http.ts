import type { HttpGetBytes } from './types';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpError';
  }
}

export const defaultHttpGetBytes: HttpGetBytes = async (url, init) => {
  const response = await fetch(url, {
    headers: init?.headers,
    signal: init?.signal,
    redirect: 'follow',
  });
  if (!response.ok) {
    throw new HttpError(response.status, url);
  }
  return new Uint8Array(await response.arrayBuffer());
};

/** Tencent and Sina both answer with GBK encoded payloads. */
export function decodeGbk(bytes: Uint8Array): string {
  try {
    return new TextDecoder('gbk').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
