import { EventEmitter } from "node:events";
import type { request, RequestOptions } from "node:https";
import { Readable } from "node:stream";

export interface Sent {
  url: URL;
  headers: Record<string, string>;
  body: string;
}

/** Stand-in for https.request: no network; answers statusFor(url) and "nope", logs requests. */
export function fakeRequest(statusFor: (url: URL) => number, sent: Sent[] = []) {
  return ((url: URL, opts: RequestOptions, onResponse: (res: unknown) => void) =>
    Object.assign(new EventEmitter(), {
      end(body: string) {
        sent.push({ url, headers: opts.headers as Record<string, string>, body });
        onResponse(Object.assign(Readable.from(["nope"]), { statusCode: statusFor(url) }));
      },
    })) as unknown as typeof request;
}
