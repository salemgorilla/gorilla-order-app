# Newsletter sign-ups in a Google Doc: setup

Gabe, 2026-10-20: "Store sign ups in a Google doc."

The code is built and switched off. It turns on when two environment
variables exist. Nothing changes until then, and nothing here has yet run
against Google, so the first real sign-up is the test.

The Doc already exists, private to gorillaprinting@gmail.com:
**Gorilla Salem newsletter sign-ups**, id
`1aQ74nssk3lhIs3JR-L4kclvjjuAnpMrdBCPYsZXXPTc`.

## What you do (about ten minutes)

The app signs in as a **service account**: a robot with its own email address.
You share the Doc with that address exactly as you would with a person, and the
robot can reach that Doc and nothing else in your Google account.

1. Open https://console.cloud.google.com signed in as gorillaprinting@gmail.com.
   Create a project (any name, for example "Gorilla Order App").
2. **Turn on the Docs API.** APIs & Services, then Library, search "Google Docs
   API", Enable.
3. **Create the robot.** IAM & Admin, then Service Accounts, Create service
   account. Name it anything ("newsletter-list"). Skip the optional steps, Done.
   Copy its email address (it ends in `.iam.gserviceaccount.com`).
4. **Make its key.** Open it, Keys tab, Add key, Create new key, JSON. A file
   downloads. Treat it like a password: do not email it or paste it in chat.
5. **Share the Doc** with the robot's email address as an **Editor**. If you
   send me the address I can do this step from here.
6. **Give the app the key.** Vercel, project, Settings, Environment Variables,
   Production:
   - `GOOGLE_SERVICE_ACCOUNT_JSON`: the whole contents of the downloaded file
   - `SUBSCRIBER_DOC_ID`: `1aQ74nssk3lhIs3JR-L4kclvjjuAnpMrdBCPYsZXXPTc`
7. **Redeploy.** Variables are baked in at build time; setting one without
   redeploying changes nothing.

`NEWSLETTER_SECRET` must also be set, or unsubscribe links cannot work. The
health page says if it is missing.

## How to tell it works

- `/api/health?secret=...` shows **Newsletter list: live**, and says "Google Doc".
- Place a test order with the newsletter box ticked. Within a few seconds a new
  line starting `SUBSCRIBED | ...` appears at the bottom of the Doc, and the shop
  email says a plain "Opted in" with no "NOT added" after it.
- `/api/subscribers?secret=...` shows the count.

## If it does not work

The reason is in the shop email's Newsletter row, in Google's own words.

| You see | It means |
|---|---|
| `403 ... The caller does not have permission` | The Doc was not shared with the robot's address (step 5). |
| `403 ... Google Docs API has not been used in project` | The Docs API is off (step 2). |
| `404 ... Requested entity was not found` | `SUBSCRIBER_DOC_ID` is wrong. |
| `400 ... invalid_grant: Invalid JWT Signature` | The key is wrong, or was deleted in Google. Make a new one (step 4). |
| `GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON` | Paste the whole file, braces included. |
| `SUBSCRIBER_DOC_ID is set but GOOGLE_SERVICE_ACCOUNT_JSON is not` (or the reverse) | One of the two variables is missing. |
| `The newsletter store did not answer in time` | Google took over 4 seconds. The order is unaffected. If it repeats, tell me. |

## How the Doc is read, and what you may do to it

- Each line is one person's current state. The **last line for an email
  address counts**. History stays visible.
- A repeat order from someone already on the list adds no line.
- **To take someone off the list by hand**, change the first word of their
  line from `SUBSCRIBED` to `UNSUBSCRIBED`. The app honours it, and a later
  pre-ticked order will not undo it.
- **To put someone back**, add a new line at the bottom with `SUBSCRIBED` and
  `-` in the "unsubscribed at" field. The newest line wins.
- Do not reorder or delete lines while the app is running.
- The Doc is read whole on every sign-up. A few thousand lines is fine. If it
  ever feels slow, start a new Doc and point `SUBSCRIBER_DOC_ID` at it.
- Keep it private. It holds customers' email addresses.

## Past sign-ups

Probably no sign-up has been kept since the old mailing hook was removed
(about 10 September): first there was nowhere to put one, then, from 14
October, the store rejected every write. The shop email on each opted-in order
says "Opted in" and, until 14 October, "NOT added to any list". From 14 to 20
October it said a plain "Opted in" while the add was failing, which is the
mistake the shop-email fix removes. Either way the consent is in those emails,
so the list can be rebuilt from them.

The first email that says "NOT added to any list" marks the start; the exact
date is worth checking rather than trusting this paragraph. Leave out the test
identity `scheduled-test@gorillasalem.com`, which is on a great many of them.
