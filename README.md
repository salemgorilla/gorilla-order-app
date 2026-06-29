# Gorilla Order - Printavo Ready Static Prototype

This version prepares Gorilla Order for the current Printavo-first workflow.

## What changed

- Customer info fields
- Due date
- Payment timing choice
- Shipping included in grand total
- Printavo handoff section
- Purchase button creates a Printavo-ready order package
- Copy JSON
- Download JSON
- Email order to shop

## Important

This does not directly connect to Printavo yet.

A real Printavo connection needs a secure server-side function so your Printavo API token is never exposed in the public website.

## Next milestone

Create a secure Vercel serverless function:

/api/create-printavo-order

The browser sends the order package there.
The serverless function sends it to Printavo using your private API token stored in Vercel environment variables.
