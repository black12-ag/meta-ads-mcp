/**
 * Firebase Auth in the browser: email/password and Google sign-in. Safe to import from
 * client code; every value here is the public web config baked in at build time.
 */
import { getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  getRedirectResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";

function app() {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
}

let persistenceSet = false;

export function auth() {
  const a = getAuth(app());
  if (!persistenceSet && typeof window !== "undefined") {
    persistenceSet = true;
    void setPersistence(a, browserLocalPersistence);
  }
  return a;
}

/** Resolves once Firebase has restored (or ruled out) the persisted session. */
export function currentUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth(), (u) => {
      unsub();
      resolve(u);
    });
  });
}

export async function getIdToken(): Promise<string | null> {
  const u = auth().currentUser ?? (await currentUser());
  return u ? u.getIdToken() : null;
}

export const signInEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth(), email, password);
/** New accounts get a verification email; alerts only go to a verified address. */
export async function signUpEmail(email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(auth(), email, password);
  const url = `${window.location.origin}/dashboard`;
  await sendEmailVerification(cred.user, { url }).catch(() => {});
  return cred;
}
/** Popup failures that mean "try the full-page flow instead", not "the user gave up". */
const POPUP_UNAVAILABLE = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

/**
 * Google sign-in. The popup is tried first because it keeps the person on the page; when the
 * browser blocks it or it closes before finishing, fall back to a full-page redirect, which
 * survives popup blockers. The redirect result is picked up by completeGoogleRedirect() on load.
 */
export async function signInGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return await signInWithPopup(auth(), provider);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    if (!POPUP_UNAVAILABLE.has(code)) throw err;
    await signInWithRedirect(auth(), provider);
    // The browser navigates away here; this promise never resolves.
    return new Promise<never>(() => {});
  }
}

/** Call once on the sign-in page: finishes a redirect sign-in if we are coming back from one. */
export async function completeGoogleRedirect() {
  try {
    return await getRedirectResult(auth());
  } catch {
    return null;
  }
}
export const signOutUser = () => signOut(auth());

/** Emails a reset link back to this sign-in page. */
export async function sendPasswordReset(email: string) {
  const url = typeof window === "undefined" ? undefined : `${window.location.origin}/auth`;
  return sendPasswordResetEmail(auth(), email, url ? { url, handleCodeInApp: false } : undefined);
}
export { onAuthStateChanged };

/** Friendly copy for the Firebase error codes a login form can hit. */
export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return "That email already has an account. Sign in instead.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is wrong.";
    case "auth/weak-password":
      return "Use a password with at least 6 characters.";
    case "auth/invalid-email":
      return "That email address does not look right.";
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled in Firebase yet.";
    case "auth/unauthorized-domain":
      return "This domain is not authorised in Firebase yet.";
    case "auth/popup-closed-by-user":
    case "auth/popup-blocked":
      return "The Google window did not finish. Trying the full-page sign-in instead…";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    case "auth/network-request-failed":
      return "No connection to the sign-in service. Check your internet and try again.";
    default:
      return (err as Error)?.message ?? "Sign-in failed";
  }
}
