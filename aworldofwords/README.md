# A World of Words — landing page

Bilingual (EN/ES) landing page for Evelyn Marin, M.S., CCC-SLP, TSSLD-BE.
One static file (`index.html`) plus `img/`. No build step.

## Turn on the questionnaire emails (one-time, ~2 minutes)

1. Go to https://web3forms.com, enter **awowspeech@gmail.com**, and click "Create Access Key".
2. The key arrives in that inbox. Paste it into `index.html` in place of
   `REPLACE_WITH_WEB3FORMS_KEY`.

Until then the form still works end-to-end, but on "Send" it shows a
"call or email me" screen whose Email button opens a message with every answer
already filled in, so no enquiry is lost.

## Language

The EN/ES toggle remembers the visitor's choice and defaults to Spanish for
Spanish-language browsers. Link straight to Spanish with `?lang=es`.

## Moving it to its own domain

Copy this folder to the root of a new repo/site, then make `og:image` an
absolute URL so link previews in DMs show the logo.
