// Paste the web-app config from Firebase console → Project settings → Your apps → SDK setup (Config).
// These values are not secret; access is controlled by the security rules.
export const firebaseConfig = {
  apiKey: "AIzaSyDpoxz70c34CG8Dj5TDy5zdk0z_y9JTFHE",
  authDomain: "singyin-physics.firebaseapp.com",
  projectId: "singyin-physics",
  storageBucket: "singyin-physics.firebasestorage.app",
  messagingSenderId: "420832609643",
  appId: "1:420832609643:web:281c050cf87aff90bcb82e",
};

// Students use syss.edu.hk, staff use singyin.edu.hk. Only these accounts can sign in.
export const SCHOOL_DOMAINS = ["syss.edu.hk", "singyin.edu.hk"];
export const isSchoolEmail = (e) => SCHOOL_DOMAINS.some((d) => String(e).toLowerCase().endsWith("@" + d));
export const FUNCTIONS_REGION = "asia-east2";

// When the site is opened from localhost, talk to the local Firebase emulators instead of the real project.
export const USE_EMULATORS = ["localhost", "127.0.0.1"].includes(location.hostname);
