import { fake } from "./core.mjs";
export const getFunctions = () => ({});
export const connectFunctionsEmulator = () => {};
export function httpsCallable(_f, name) {
  return async (data) => {
    const u = fake.user;
    const req = { data: JSON.parse(JSON.stringify(data ?? {})),
      auth: u ? { uid: u.uid, token: { email: u.email, email_verified: u.emailVerified !== false, name: u.name } } : null };
    // rate-limit counters are cleared before each call unless a test is checking the limits
    if (!fake.keepRateLimits) for (const k of [...fake.store.keys()]) if (k.startsWith("rateLimits/")) fake.store.delete(k);
    const result = await fake.handlers[name].run(req);
    return { data: JSON.parse(JSON.stringify(result)) };
  };
}
