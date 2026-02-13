import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  // @ts-expect-error - Node webcrypto polyfill for test runtime
  globalThis.crypto = webcrypto;
}
