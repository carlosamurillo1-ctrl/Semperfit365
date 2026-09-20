// Optional cloud sync layer on top of the local Store, built on Firebase
// Firestore. Everything here is a no-op (isSyncConfigured() === false) until
// js/firebaseConfig.js has a real project config, so the app works exactly
// as before if you never set this up.
//
// Data model:
//   clients/{clientId}            { displayName, program, updatedAt }
//   coaches/{coachId}/roster/{clientId}  { label, addedAt }
//
// There's no login. A clientId/coachId is a long random string generated on
// first use and kept in localStorage; possessing it is what grants access
// (the same "anyone with the link" model as a shared Google Doc). Firestore
// rules (see firestore.rules) allow fetching a *known* document id but deny
// listing either top-level collection, so a client/coach id can't be
// brute-forced or enumerated even though the API key itself is public.

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

export function newId() {
  return crypto.randomUUID();
}

// ---------- client side: push this device's program up ----------

let pushTimer = null;

/** Debounced push of a client's program to Firestore (harmless no-op if sync isn't configured). */
export function pushClientProgram(clientId, displayName, program) {
  if (!isSyncConfigured() || !clientId) return;
  clearTimeout(pushTimer);
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
    } catch (e) {
      // offline / blocked / misconfigured project — fail silently, local data is unaffected
      console.warn("sync push failed", e);
    }
  }, 800);
}

// ---------- coach side ----------

export async function addClientToRoster(coachId, clientId, label) {
  const database = ensureDb();
  await database.collection("coaches").doc(coachId).collection("roster").doc(clientId).set({
    label: label || "Unnamed client",
    addedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
  });
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
