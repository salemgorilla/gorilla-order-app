# Printavo probe — can we list one contact's orders in one query?

**Status: NOT RUN. Blocked on credentials, not on effort.**

Everything in Phases 2 and 3 of the repeat-customer spec assumes the answer is
yes. Nobody has checked. This file is the probe, ready to paste, so whoever has
a Printavo login can answer it in about five minutes.

## Why it is not answered here

This coding environment has no `PRINTAVO_EMAIL` / `PRINTAVO_TOKEN`, and the app
exposes no endpoint that runs arbitrary GraphQL — `/api/printavo-test` runs one
fixed query and `/api/order-status` runs another. There is no route from here to
the live account, and adding one would mean shipping an arbitrary-GraphQL
endpoint to production to answer a research question. That trade is not worth
making.

**Do not let a later session "solve" this by adding storage instead.** The
handoff is explicit: if a contact's orders are not retrievable in one query,
that is a real finding and the decision goes back to Gabe.

## Before you run anything

**The rate limit is 10 requests per 5 seconds, account-wide, and one submitted
quote costs 3.** A loop here can take live checkout down. Run these one at a
time, by hand, and wait a couple of seconds between them. There are four.

Use Printavo's GraphQL explorer if the account has one; otherwise curl with the
same headers `printavoRequest` uses (`email` + `token`).

## Probe 1 — does a contact expose its orders?

```graphql
query ContactOrders($q: String!) {
  contacts(query: $q, first: 5) {
    nodes {
      id
      email
      fullName
      orders(first: 25) {
        nodes {
          ... on Quote   { id visualId nickname createdAt status { name } }
          ... on Invoice { id visualId nickname createdAt status { name } }
        }
      }
    }
  }
}
```

Variables: `{ "q": "<a real customer email with 2+ orders>" }`

**If this works, stop — that is the answer.** Report whether each node carried
`nickname`, `status { name }` and a date, and whether `orders` was paginated.

## Probe 2 — if `contacts` has no `orders` field

Printavo will name the missing field in the error. Ask the schema what a
contact actually has:

```graphql
query { __type(name: "Contact") { fields { name type { name kind } } } }
```

Report the field list. If there is an orders-shaped connection under another
name, re-run probe 1 with it.

## Probe 3 — can `orders(query:)` filter by contact rather than fuzzy text?

```graphql
query OrdersByContact($q: String!) {
  orders(query: $q, first: 25) {
    nodes {
      ... on Quote   { id visualId nickname createdAt contact { id email } }
      ... on Invoice { id visualId nickname createdAt contact { id email } }
    }
  }
}
```

Run it twice, a couple of seconds apart: once with the customer's **email**,
once with their **contact id** from probe 1.

The thing to watch for is not whether it returns rows — it is whether every row
belongs to that contact. `lookupOrderStatus` already treats this search as
fuzzy and re-checks the nickname afterwards for exactly that reason. If the
email search returns other people's orders, say so plainly; a `/my-orders` page
built on a fuzzy match would show one customer another customer's work.

## Probe 4 — what happens at volume

Ask for a page size larger than any real customer's history:

```graphql
query { orders(query: "<email>", first: 100) { nodes { ... on Quote { id } } } }
```

Report: does it accept `first: 100`? Is there a `pageInfo { hasNextPage }`? What
is the maximum page size it will take?

## What to write down

1. Which probe worked, if any.
2. For its nodes: `nickname` present? `status { name }` present? a date present?
3. Paginated — and what happens to a contact with 200 orders.
4. **Whether every returned order genuinely belongs to that contact**, or
   whether the search returns whatever it thinks is close.
5. Whether any of it needs more than ONE request. A query per order is not an
   option, so a shape that needs one is not viable and should be reported as a
   no.

## If the answer is no

Say so and stop. Phases 2 and 3 then need a database, and that is Gabe's call,
not a thing to route around.

## Worth knowing before you trust the docs

Printavo's published schema has already been wrong for this integration once:
`lineItems` is documented as a nested list and is flat live — see the note in
`createPrintavoQuote`. A contact-orders shape that reads correctly in the docs
is not evidence. Run it.
