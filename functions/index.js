// Cloud Function: sends a receipt email the moment a coach marks a client
// as paid in the app (clients/{clientId}.paid flips false -> true).
//
// This only runs when you deploy it yourself (see README.md's "Automatic
// receipt emails" section for the full setup). Until then, marking a
// client paid still works exactly the same in the app -- it just won't
// also send an email.

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const sgMail = require("@sendgrid/mail");

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
