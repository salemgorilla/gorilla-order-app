import { Order } from "../types/order";

export function getOrderValidationErrors(order: Order) {
  const errors: string[] = [];

  if (!order.artwork.file) {
    errors.push("Upload your artwork.");
  }

  // A blank width or height is not harmless. getAreaSqIn falls back to parsing
  // the legacy preset label when dimensions are 0, and that label defaults to
  // 3" — so clearing a box silently repriced the order as a 3" square and, for
  // stickers, auto-generated a payment link at that price. Blocking submit is
  // the fix; the fallback itself stays for old quotes that still carry presets.
  if (!(order.product.widthInches > 0) || !(order.product.heightInches > 0)) {
    errors.push("Enter the width and height of your sticker.");
  }

  if (!(order.product.quantity > 0)) {
    errors.push("Enter how many you need.");
  }

  if (!order.production.needBy) {
    errors.push("Enter the date you need this order in hand.");
  }

  if (!order.customer.customerName.trim()) {
    errors.push("Enter your name.");
  }

  if (!order.customer.email.trim()) {
    errors.push("Enter your email.");
  }

  // Phone is optional (matches the apparel flow) — collected but not required.

  return errors;
}

export function isOrderReady(order: Order) {
  return getOrderValidationErrors(order).length === 0;
}