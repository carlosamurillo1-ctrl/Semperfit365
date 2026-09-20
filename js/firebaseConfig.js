// Paste your Firebase project's web config here (Firebase console -> Project
// settings -> Your apps -> the web app -> SDK setup and configuration).
// This is safe to be public in a client app; real access control is
// enforced by the Firestore security rules (see firestore.rules), not by
// keeping this object secret.
//
// Coach/client cloud sync is simply disabled (the app falls back to
// local-only storage) until apiKey below is filled in.
export const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",
};
