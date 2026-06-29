# Gorilla Order — Deploy Ready Static Starter

This version is intentionally simple to deploy and preview.

It does **not** require Node, npm, TypeScript, or a build step.

## Preview on your computer

Open `index.html` in a browser.

## Deploy on Vercel

1. Create a GitHub repo named `gorilla-order`.
2. Upload the contents of this folder.
3. In Vercel, import the GitHub repo.
4. If Vercel asks for settings:
   - Framework Preset: Other
   - Build Command: leave blank
   - Output Directory: leave blank
5. Deploy.

## Editable data files

Sticker pricing:

```txt
data/sticker-pricing.js
```

Shipping pricing:

```txt
data/shipping-pricing.js
```

## Current features

- Custom sticker builder
- Live pricing
- Shipping/pickup options calculated before purchase
- Artwork file preview
- Customer info fields
- Structured order package from the Purchase button

## Next steps

- Replace placeholder pricing with real Gorilla Salem pricing
- Add true checkout/payment
- Add real artwork upload storage
- Add Printavo work order integration
- Add admin pricing editor
