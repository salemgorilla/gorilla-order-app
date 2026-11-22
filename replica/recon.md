# Recon map: Squeej (web)

Scope (proposed, not yet confirmed): the core loop only — one shared order page where shop and customer edit the mockup, sizes and price, talk in a synced email thread, then approve and pay. Plus the minimum shop side needed to run it (sign-in, dashboard, price chart, statuses).
For (assumed, not yet confirmed): Gorilla's own shop.
Date: 2026-11-22

Read from public pages only. No account was used, so every logged-in screen below is inferred from the help center, not seen. No screenshots yet: `screens/` is empty.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | help center | https://squeej.app/help | 12 sections; the fullest feature list |
| 2 | marketing home | https://squeej.app | pitch, live stats, sign-up buttons |
| 3 | about | https://squeej.app/why | founder note, fee model |
| 4 | terms | https://squeej.app/terms | effective 2026-10-02; no clause on building a competing product; bans accessing other shops' data, interfering with the platform, reselling access |
| 5 | privacy | https://squeej.app/privacy | not read yet |
| 6 | live shop | https://landslideprinting.com/orders | linked as "See a live shop"; not read (host not allowed in this session) |
| — | pricing page, changelog, API docs, app store listing, videos | none found | pricing is covered in the help center |

## Core loop

A shop builds a quote on a page the customer can also edit, the conversation runs in the shop's real email thread, and the customer approves and pays on that same page.

Their own numbers (home page, self-reported, "updated hourly"): 1,563 orders, $329,706 recorded, 257 approved orders, 46% approved same day, median quote-to-approval 1.2 days, 34% of customers reorder.

## Screens

All routes are unknown except S01–S04. "inferred" = described in help, not seen.

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Marketing home | `/` | pitch and sign-up | Google / Microsoft buttons, stats bars, weekly chart | filled |
| S02 | About | `/why` | founder note | text, sign-up buttons | filled |
| S03 | Help center | `/help` | FAQ in 12 sections | section nav, Q&A list | filled |
| S04 | Sign in | `/signin` | returning shop | not read | — |
| S05 | Shop dashboard | inferred | order list / production queue | order rows, status, due date | none seen |
| S06 | Order page, shop view | inferred | build and price the order | mockup canvas, garment picker, color picker, size grid, line items, price + cost line, thread, send button, ⋯ menu | none seen |
| S07 | Order page, customer view | emailed link, inferred | review, edit, approve, pay, track | same page with limited edit, approve / "request a new quote" button, pay, status | none seen |
| S08 | Customer device check | inferred | one-time code on a new device | code input | none seen |
| S09 | Pay link / invoice | inferred | payer who is not the approver | total, Stripe payment form, invoice download | none seen |
| S10 | Calendar | inferred | what is due when | calendar | none seen |
| S11 | Customers | inferred | search, history, reorder | list, search, order history | none seen |
| S12 | Metrics | inferred | booked, collected, outstanding, volume | charts | none seen |
| S13 | Settings | inferred | mailbox, price chart, live-pricing toggle, supplier accounts, Stripe, team + PIN, turnaround, branding, CSV import, domain | forms | none seen |
| S14 | Public shop front door | `yourshop.squeej.app`, inferred | walk-in starts an order | name + email + first message, product and search pages | none seen |
| S15 | Team store, buyer | store link, inferred | group members buy their own piece | item list, sizes, "who is it for", card checkout, optional address | none seen |
| S16 | Team store, shop | from order ⋯ menu, inferred | set retail and cost, open store, roster | price inputs, roster, pull sheet, CSV export, payouts owed | none seen |
| S17 | Team sign-in | "team address", inferred | staff: email, one-time code, PIN | code input, PIN input | none seen |

## Flows

```
F01 Shop sends a quote
    S05 -> S06 (new order: garment, color, artwork, sizes) -> send
    happy path clicks: not countable without an account; they claim "a quote in 2 minutes"
    edge: live pricing off (shop types each price), no supplier account (list price used),
          attach an existing email thread, custom catalog item

F02 Customer edits, approves and pays
    email link -> S07 (move design, change sizes) -> approve -> pay
    edge: new device (S08), edit changes price with live pricing off ("request a new quote"),
          editing not allowed, no Stripe connected (approve only), different payer (S09)

F03 Conversation stays in one thread
    customer replies by email or on S07 -> message shows on S06 and in the shop's mailbox
    edge: attachments from the thread attach to the order, shop switches mailbox

F04 Order moves through production
    S06/S05: quote -> approved -> in production -> complete (or cancelled); customer sees status on S07
    edge: change after approval is shown to both sides, rush option, due date from turnaround

F05 Walk-in starts an order
    S14 (name, email, first message) -> becomes an email thread -> S06

F06 Reorder
    S11 or old order -> reorder -> S06 with garments, art and placement carried over, current costs

F07 Team store
    S06 ⋯ menu -> S16 (retail + cost, open) -> share link -> S15 buyers pay -> S16 roster / pull sheet
    edge: ship to buyer with flat charge, refund in Stripe, organizer payout owed

F08 Staff signs in
    S17: email -> one-time code -> PIN
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Mockup canvas | garment photo + draggable, resizable artwork | editable, locked | S06, S07, S15 |
| Garment picker | catalog search, custom item | empty, results | S06, S07 |
| Size grid | per line item, extended sizes | editable, locked | S06, S07, S15 |
| Line item | garment, color, method, locations, price, discount, locked price | live-priced, awaiting price | S06, S07 |
| Thread | messages, attachments, author | empty, filled | S06, S07 |
| Approve button | approve, request a new quote | enabled, locked after approval | S07 |
| Payment form | card, wallet, bank transfer | unpaid, part-paid, paid | S07, S09, S15 |
| Status badge | quote, approved, in production, complete, cancelled | — | S05, S06, S07 |
| OAuth button | Google, Microsoft | default | S01–S04 |
| Code / PIN input | one-time code, PIN | default, error | S08, S17 |
| Stat bar / weekly chart | — | filled | S01, S12 |

Visual detail (colors, spacing, real states) is unknown until screenshots exist.

## Inferred data model

```
Shop        id, name, subdomain, logo, brand_color, mailbox_provider, mailbox_tokens, stripe_account_id,
            plan, live_pricing (bool), turnaround_days, custom_domain, device_pin
            evidence: help "Getting started", "Your website and domain", "Team access"   confidence: medium
TeamMember  id, shop_id, email, name, pin                                                confidence: medium
Customer    id, shop_id, name, email                                                     confidence: high
Order       id, shop_id, customer_id, number, status, editable_by_customer, due_date, est_delivery, rush,
            approved_by, approved_at, total, balance, email_thread_id, reorder_of
            evidence: help "The order page", "Approvals and payments", "Order tracking"  confidence: high
LineItem    id, order_id, catalog_item_id, color, decoration_method, sizes (json), print_colors, locations,
            blank_cost, cost_source (contract | list | manual), unit_price, price_locked, discount
            evidence: help "The order page", "Pricing"                                   confidence: medium
Artwork     id, order_id, file, type, placement (x, y, scale, location), color_count     confidence: medium
Message     id, order_id, email_message_id, author, direction, body, attachments, sent_at confidence: medium
Payment     id, order_id, method (card | bank | check | cash | other), amount, stripe_id, platform_fee
                                                                                         confidence: medium
PriceChart  shop_id, markups by garment, print grid (qty x colors) per method, location discount,
            dark surcharge, extended-size upcharge                                       confidence: medium
CatalogItem id, shop_id (null = shared), supplier, style, colors, sizes, list_cost, custom confidence: medium
AuditEvent  id, order_id, actor, action, at                                              confidence: guess
TeamStore   id, order_id, open, ships, flat_shipping; items with retail and cost         confidence: medium
StorePurchase id, store_id, buyer_email, recipient_name, sizes, address, paid, refunded  confidence: medium
OrganizerPayout id, store_id, amount, paid_at                                            confidence: guess
```

Relationships: Shop 1-n TeamMember, Customer, Order, CatalogItem. Order 1-n LineItem, Artwork, Message, Payment. Order 1-1 TeamStore 1-n StorePurchase.

## Feature matrix

See `features.csv`. Must: 24, should: 19, could: 12, skip: 2.

## Out of scope (cannot or should not be cloned)

- The 9,000+ blank catalog and its product photos: wholesaler data, licensed. Use your own S&S / SanMar account feeds.
- Squeej's name, logo, wording, its shops and its recorded order data.
- Their home-page statistics: a clone may only show its own real numbers.

## Size

Screens 17 (13 inferred), flows 8, entities 14.
Hard parts: two-way Gmail / Outlook thread sync (and Google's OAuth security review for mail scopes); the shared live-editing mockup canvas; Stripe Connect with platform fees; the pricing engine with supplier costs.
Size: core loop M (a few weeks). Everything in the matrix: L (a quarter).
