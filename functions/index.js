// Cloud Function: sends a receipt email the moment a coach marks a client
// as paid in the app (clients/{clientId}.paid flips false -> true).
//
// This only runs when you deploy it yourself (see README.md's "Automatic
// receipt emails" section for the full setup). Until then, marking a
// client paid still works exactly the same in the app -- it just won't
// also send an email.

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");
const { decideReminder, renderReminderEmail } = require("./reminders");

admin.initializeApp();

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

// Must be a sender address verified in SendGrid (Settings > Sender
// Authentication) or the email will be rejected. Change this if you verify
// a different address there.
const FROM_EMAIL = "semperfit365@gmail.com";
const FROM_NAME = "SemperFit365";

exports.sendPaymentReceipt = onDocumentUpdated(
  { document: "clients/{clientId}", secrets: [SENDGRID_API_KEY] },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();

    // Only fire on the false/unset -> true transition, never on every write to the doc.
    if (before?.paid === true || after?.paid !== true) return;

    const toEmail = after.clientEmail;
    if (!toEmail) return; // paid before ever signing in -- nothing to email

    sgMail.setApiKey(SENDGRID_API_KEY.value());

    const amount = ((after.priceCents || 0) / 100).toFixed(2);
    const clientName = after.displayName || after.label || "there";

    await sgMail.send({
      to: toEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: "Payment received -- you're all set!",
      text: `Hi ${clientName},\n\nWe've confirmed your payment of $${amount}. Your workout program is now unlocked -- open your SemperFit365 link to get started.\n\nThanks!\n${FROM_NAME}`,
      html: `<p>Hi ${clientName},</p><p>We've confirmed your payment of <strong>$${amount}</strong>. Your workout program is now unlocked -- open your SemperFit365 link to get started.</p><p>Thanks!<br>${FROM_NAME}</p>`,
    });
  }
);


// ---------------------------------------------------------------------------
// Check-in reminders
// ---------------------------------------------------------------------------
// Runs once a day and emails clients whose check-in is overdue. Who gets one
// is decided by decideReminder() in reminders.js, which is a pure function and
// is where the rules (and their tests) live -- this part only fetches, sends
// and records.
//
// Deliberately quiet: at most one email per client every six days, never to a
// client whose coach switched reminders off, never to one who hasn't paid, and
// never at all until this function is deployed. Nothing in the app depends on
// it being there.

const APP_URL = "https://trainsemperfit365.com/app/";

exports.sendCheckInReminders = onSchedule(
  {
    // 9am New York. Cloud Scheduler handles the daylight-saving shift itself.
    schedule: "0 9 * * *",
    timeZone: "America/New_York",
    secrets: [SENDGRID_API_KEY],
  },
  async () => {
    const db = admin.firestore();
    // Only clients the coach has actually set reminders up for. Clients who
    // were never given an email address are never queried at all.
    const snapshot = await db.collection("clients").where("reminders.enabled", "==", true).get();

    const nowIso = new Date().toISOString();
    let sent = 0;
    let skipped = 0;

    for (const doc of snapshot.docs) {
      const client = doc.data();
      const decision = decideReminder(client, nowIso);
      if (!decision.send) {
        skipped++;
        continue;
      }

      const { text, html } = renderReminderEmail(decision, APP_URL);
      try {
        sgMail.setApiKey(SENDGRID_API_KEY.value());
        await sgMail.send({
          to: decision.to,
          from: { email: FROM_EMAIL, name: FROM_NAME },
          replyTo: FROM_EMAIL,
          subject: decision.subject,
          text,
          html,
        });
        // Written only after a successful send, so a failed email is retried
        // tomorrow rather than silently counting as delivered. A dotted-path
        // update touches this one field and cannot clobber the coach's
        // enabled/email/phone sitting beside it.
        await doc.ref.update({ "reminders.lastReminderAt": nowIso });
        sent++;
      } catch (err) {
        console.error(`reminder to ${doc.id} failed`, err?.message || err);
      }
    }

    console.log(`check-in reminders: ${sent} sent, ${skipped} skipped, ${snapshot.size} considered`);
  }
);
