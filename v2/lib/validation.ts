import { Order } from "../types/order";

export function getOrderValidationErrors(order: Order) {
  const errors: string[] = [];

  if (!order.artwork.file) {
    errors.push("Upload your artwork.");
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