// Optional cloud sync layer on top of the local Store, built on Firebase
// Firestore (+ Firebase Auth for paywalled clients only). Everything here is
// a no-op (isSyncConfigured() === false) until js/firebaseConfig.js has a
// real project config, so the app works exactly as before if you never set
// this up.
//
// Data model:
//   clients/{clientId}            { displayName, program, updatedAt, priceCents, paid }
//   coaches/{coachId}/roster/{clientId}  { label, addedAt, priceCents, paid }
//
// There's no login for *free* clients or coaches. A clientId/coachId is a
// long random string generated on first use and kept in localStorage;
// possessing it is what grants access (the same "anyone with the link"
// model as a shared Google Doc). Firestore rules (see firestore.rules)
// allow fetching a *known* document id but deny listing either top-level
// collection, so a client/coach id can't be brute-forced or enumerated even
// though the API key itself is public.
//
// A *paywalled* client (priceCents > 0) is the one case that does use real
// sign-in: Firebase Auth's passwordless "email link" flow. This doesn't
// replace the clientId/link model -- it's an extra gate in front of it, so
// existing free clients and the coach's own flows are completely unaffected.

import { firebaseConfig } from "./firebaseConfig.js";

let db = null;

export function isSyncConfigured() {
  return !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "REPLACE_ME");
}

function ensureDb() {
  if (db) return db;
  if (!window.firebase) throw new Error("Firebase SDK didn't load");
  if (!window.firebase.apps.length) window.firebase.initializeApp(firebaseConfig);
  db = window.firebase.firestore();
  return db;
}

function ensureAuth() {
  ensureDb();
  if (!window.firebase.auth) throw new Error("Firebase Auth SDK didn't load");
  return window.firebase.auth();
}

export function newId() {
  return crypto.randomUUID();
}

// ---------- client auth (passwordless email-link sign-in, paywalled clients only) ----------

const PENDING_EMAIL_KEY = "sf365.pendingSignInEmail";

/** True if the current URL is a Firebase email sign-in link (i.e. the client just clicked the link in their inbox). */
export function isSignInLink() {
  try {
    return ensureAuth().isSignInWithEmailLink(window.location.href);
  } catch {
    return false;
  }
}

/** Emails the client a passwordless sign-in link back to this same app. */
export async function sendClientSignInLink(email) {
  const auth = ensureAuth();
  const actionCodeSettings = {
    url: `${window.location.origin}${window.location.pathname}`,
    handleCodeInApp: true,
  };
  await auth.sendSignInLinkToEmail(email, actionCodeSettings);
  localStorage.setItem(PENDING_EMAIL_KEY, email);
}

/** If the current URL is a sign-in link, completes it. Returns the signed-in email, or null. */
export async function completeClientSignIn() {
  const auth = ensureAuth();
  if (!auth.isSignInWithEmailLink(window.location.href)) return null;
  let email = localStorage.getItem(PENDING_EMAIL_KEY);
  if (!email) email = window.prompt("Confirm the email you used to sign in:");
  if (!email) return null;
  const result = await auth.signInWithEmailLink(email, window.location.href);
  localStorage.removeItem(PENDING_EMAIL_KEY);
  return result.user?.email || email;
}

export function getCurrentClientEmail() {
  try {
    return ensureAuth().currentUser?.email || null;
  } catch {
    return null;
  }
}

/** Records the signed-in client's email on their doc, so the coach can see who paid and the receipt-email Cloud Function knows where to send it. */
export async function recordClientEmail(clientId, email) {
  const database = ensureDb();
  await database.collection("clients").doc(clientId).set({ clientEmail: email }, { merge: true });
}

// ---------- client side: push this device's program up ----------

let pushTimer = null;

// Tiny status pub-sub so the UI can show "saving.../synced/offline" without
// pushClientProgram's caller (a Store change listener firing on every
// keystroke) needing to await anything itself.
let syncStatus = "idle"; // idle | pending | synced | error
const syncStatusListeners = new Set();
function setSyncStatus(next) {
  syncStatus = next;
  syncStatusListeners.forEach((fn) => fn(next));
}
export function getSyncStatus() {
  return syncStatus;
}
export function onSyncStatusChange(fn) {
  syncStatusListeners.add(fn);
  return () => syncStatusListeners.delete(fn);
}

/** Debounced push of a client's program to Firestore (harmless no-op if sync isn't configured). */
export function pushClientProgram(clientId, displayName, program) {
  if (!isSyncConfigured() || !clientId) return;
  clearTimeout(pushTimer);
  setSyncStatus("pending");
  pushTimer = setTimeout(async () => {
    try {
      const database = ensureDb();
      await database.collection("clients").doc(clientId).set(
        {
          displayName: displayName || "",
          program,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      setSyncStatus("synced");
    } catch (e) {
      // offline / blocked / misconfigured project — fail silently, local data is unaffected
      console.warn("sync push failed", e);
      setSyncStatus("error");
    }
  }, 800);
}

// ---------- coach side ----------

/** priceCents: 0/undefined means free -- the client's link works exactly as
 * it always has, no sign-in or payment gate. Any positive amount creates
 * the client's doc up front as unpaid, so the paywall gate has something
 * to check against the moment they open the link. */
export async function addClientToRoster(coachId, clientId, label, priceCents) {
  const database = ensureDb();
  await Promise.all([
    database.collection("coaches").doc(coachId).collection("roster").doc(clientId).set({
      label: label || "Unnamed client",
      addedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      priceCents: priceCents || 0,
      paid: !priceCents,
    }),
    database.collection("clients").doc(clientId).set(
      {
        label: label || "",
        priceCents: priceCents || 0,
        paid: !priceCents,
      },
      { merge: true }
    ),
  ]);
}

/** One-off read of the name the coach gave this client (for a personalized
 * paywall welcome, before the client has signed in or set their own name). */
export async function getClientLabel(clientId) {
  try {
    const database = ensureDb();
    const doc = await database.collection("clients").doc(clientId).get();
    return doc.exists ? (doc.data().label || "") : "";
  } catch {
    return "";
  }
}

/** Coach confirms a Zelle (or other) payment landed; flips the client's
 * doc so their already-open app unlocks in real time via listenClient,
 * and mirrors it onto the roster entry so the dashboard list reflects it. */
export async function markClientPaid(coachId, clientId) {
  const database = ensureDb();
  await Promise.all([
    database.collection("clients").doc(clientId).set(
      { paid: true, paidAt: window.firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    ),
    database.collection("coaches").doc(coachId).collection("roster").doc(clientId).set(
      { paid: true },
      { merge: true }
    ),
  ]);
}

/** Un-list a client AND revoke their sync privileges: their own device stops
 * pushing to you the next time it checks in, though its local workout data
 * is never touched. This is a soft revoke, not a security boundary — their
 * device still holds the clientId and Firestore's rules still allow it to
 * write there; enforcement happens client-side (see bootstrapClientSync in
 * app.js), which is the right bar for a coach ending a training
 * relationship, not for keeping out someone actively trying to bypass it. */
export async function removeClientFromRoster(coachId, clientId) {
  const database = ensureDb();
  await Promise.all([
    database.collection("coaches").doc(coachId).collection("roster").doc(clientId).delete(),
    database.collection("clients").doc(clientId).set(
      { revoked: true, revokedAt: window.firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    ),
  ]);
}

/** Live-subscribe to a coach's client roster. Returns an unsubscribe function. */
export function listenRoster(coachId, callback) {
  const database = ensureDb();
  return database
    .collection("coaches")
    .doc(coachId)
    .collection("roster")
    .orderBy("addedAt", "desc")
    .onSnapshot(
      (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn("roster listen failed", err)
    );
}

/** Live-subscribe to one client's synced data. Returns an unsubscribe function. */
export function listenClient(clientId, callback) {
  const database = ensureDb();
  return database
    .collection("clients")
    .doc(clientId)
    .onSnapshot(
      (doc) => callback(doc.exists ? doc.data() : null),
      (err) => console.warn("client listen failed", err)
    );
}
