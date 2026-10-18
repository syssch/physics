import { fake } from "./core.mjs";
export const getAuth = () => ({ __auth: true });
export const connectAuthEmulator = () => {};
export class GoogleAuthProvider { setCustomParameters(p) { this.p = p; } }
export function onAuthStateChanged(auth, cb) { fake.listeners.push(cb); setTimeout(() => cb(fake.user ? toUser(fake.user) : null), 0); }
const toUser = (u) => ({ uid: u.uid, email: u.email, displayName: u.name });
export async function signInWithPopup() { if (!fake.nextUser) throw new Error("no popup in tests"); fake.setUser(fake.nextUser); }
export async function signOut() { fake.setUser(null); }
fake.setUser = (u) => { fake.user = u; fake.listeners.forEach((cb) => cb(u ? toUser(u) : null)); };
