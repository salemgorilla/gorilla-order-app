# Gorilla Order - Endpoint Test

This version connects the Purchase button to a secure Vercel API endpoint.

## Upload these to GitHub

- index.html
- api/create-printavo-order.js

The `api` folder must be at the root of the repository.

## What it does

When you click the Purchase button, the website sends the order package to:

/api/create-printavo-order

For now, the endpoint sends back a success message.

## Next

After this test works, the endpoint will be upgraded to call Printavo using Vercel Environment Variables:

PRINTAVO_EMAIL
PRINTAVO_TOKEN

Never put the Printavo token inside index.html.    
