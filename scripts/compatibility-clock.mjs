/** Test-only invocation clock; production entrypoints never import this file. */
import crypto from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
const NativeDate = globalThis.Date;
const epoch = NativeDate.parse("2026-10-01T12:00:00.000Z");
class InvocationDate extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [epoch])); }
  static now() { return epoch; }
}
let sequence = 0;
const nativeRandomUUID = crypto.randomUUID.bind(crypto);
const invocationUUID = () => {
  // SDK request/subscription IDs retain their normal randomness.
  if (!/\/dist\/(?:handoff|reports|summarization)\/|\/dist\/packet_builder\.js/.test(new Error().stack ?? "")) {
    return nativeRandomUUID();
  }
  const hex = crypto.createHash("sha256").update(`compatibility-${sequence++}`).digest("hex").slice(0, 32);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
};
crypto.randomUUID = invocationUUID;
globalThis.crypto.randomUUID = invocationUUID;
syncBuiltinESMExports();
globalThis.Date = InvocationDate;
