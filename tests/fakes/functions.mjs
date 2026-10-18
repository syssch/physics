import { fake } from "./core.mjs";
export const getFunctions = () => ({});
export const connectFunctionsEmulator = () => {};
export function httpsCallable(_f, name) {
  return async (data) => {
    const u = fake.user;
    const req = { data: JSON.parse(JSON.stringify(data ?? {})),
      auth: u ? { uid: u.uid, token: { email: u.email, email_verified: u.emailVerified !== false, name: u.name } } : null };
    const result = await fake.handlers[name].run(req);
    return { data: JSON.parse(JSON.stringify(result)) };
  };
}
