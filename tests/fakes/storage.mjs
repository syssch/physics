import { fake } from "./core.mjs";
export const getStorage = () => ({});
export const connectStorageEmulator = () => {};
export const ref = (s, path) => ({ path });
export async function uploadBytes(r, file) { fake.files.set(r.path, file); }
export async function getDownloadURL(r) { if (!fake.files.has(r.path)) throw new Error("storage/object-not-found " + r.path); return `https://files.test/${r.path}`; }
