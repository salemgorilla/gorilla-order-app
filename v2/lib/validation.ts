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

  if (!order.customer.phone.trim()) {
    errors.push("Enter your phone number.");
  }

  return errors;
}

export function isOrderReady(order: Order) {
  return getOrderValidationErrors(order).length === 0;
}