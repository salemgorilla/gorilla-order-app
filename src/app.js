import { stickerPricing } from "../data/sticker-pricing.js";
import { shippingPricing } from "../data/shipping-pricing.js";

const state = {
  shape: "die-cut",
  size: "3x3",
  material: "white-vinyl",
  finish: "matte",
  quantity: 500,
  shipping: "pickup",
  files: []
};

const $ = (id) => document.getElementById(id);
const money = (amount) => `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const find = (list, id) => list.find((item) => item.id === id);

function stickerSubtotal() {
  const shape = find(stickerPricing.shapes, state.shape);
  const size = find(stickerPricing.sizes, state.size);
  const material = find(stickerPricing.materials, state.material);
  const finish = find(stickerPricing.finishes, state.finish);
  const base = size.base[state.quantity];
  return Math.round(base * shape.multiplier * material.multiplier * finish.multiplier);
}

function shippingTotal(subtotal) {
  const method = find(shippingPricing.methods, state.shipping);
  if (method.type === "flat") return method.price;
  const tier = method.tiers.find((item) => item.maxSubtotal === null || subtotal <= item.maxSubtotal);
  return tier ? tier.price : 0;
}

function renderOptionGrid(containerId, items, stateKey) {
  const container = $(containerId);
  container.innerHTML = "";

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = state[stateKey] === item.id ? "option selected" : "option";
    button.innerHTML = `<strong>${item.label}</strong>${item.sub || item.description ? `<span>${item.sub || item.description}</span>` : ""}`;
    button.addEventListener("click", () => {
      state[stateKey] = item.id;
      render();
    });
    container.appendChild(button);
  });
}

function renderQuantities() {
  const container = $("quantityOptions");
  container.innerHTML = "";
  stickerPricing.quantities.forEach((qty) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = state.quantity === qty ? "qty selected" : "qty";
    button.textContent = qty.toLocaleString();
    button.addEventListener("click", () => {
      state.quantity = qty;
      render();
    });
    container.appendChild(button);
  });
}

function renderFiles() {
  const grid = $("fileGrid");
  grid.innerHTML = "";
  state.files.forEach((file) => {
    const card = document.createElement("div");
    card.className = "file-card";

    if (file.type && file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      card.appendChild(img);
    } else {
      const icon = document.createElement("div");
      icon.className = "file-icon";
      icon.textContent = file.name.split(".").pop().toUpperCase();
      card.appendChild(icon);
    }

    const label = document.createElement("small");
    label.textContent = `${file.name} • ${Math.round(file.size / 1024)} KB`;
    card.appendChild(label);
    grid.appendChild(card);
  });
}

function orderMath() {
  const subtotal = stickerSubtotal();
  const shipping = shippingTotal(subtotal);
  const grandTotal = subtotal + shipping;
  return { subtotal, shipping, grandTotal, each: grandTotal / state.quantity };
}

function renderSummary() {
  const shape = find(stickerPricing.shapes, state.shape);
  const size = find(stickerPricing.sizes, state.size);
  const material = find(stickerPricing.materials, state.material);
  const finish = find(stickerPricing.finishes, state.finish);
  const shippingMethod = find(shippingPricing.methods, state.shipping);
  const totals = orderMath();

  const title = `${state.quantity.toLocaleString()} ${shape.label} Stickers`;
  $("summaryTitle").textContent = title;
  $("heroOrderTitle").textContent = title;
  $("grandTotal").textContent = money(totals.grandTotal);
  $("heroOrderPrice").textContent = money(totals.grandTotal);
  $("eachPrice").textContent = `${money(totals.each)} each including shipping`;

  const visualSticker = $("visualSticker");
  visualSticker.className = `visual-sticker ${shape.id}`;

  $("summaryDetails").innerHTML = `
    <div><dt>Subtotal</dt><dd>${money(totals.subtotal)}</dd></div>
    <div><dt>Shipping</dt><dd>${money(totals.shipping)}</dd></div>
    <div><dt>Delivery</dt><dd>${shippingMethod.label}</dd></div>
    <div><dt>Size</dt><dd>${size.label}</dd></div>
    <div><dt>Material</dt><dd>${material.label}</dd></div>
    <div><dt>Finish</dt><dd>${finish.label}</dd></div>
    <div><dt>Artwork</dt><dd>${state.files.length ? `${state.files.length} file(s)` : "None yet"}</dd></div>
  `;
}

function render() {
  renderOptionGrid("shapeOptions", stickerPricing.shapes, "shape");
  renderOptionGrid("sizeOptions", stickerPricing.sizes, "size");
  renderOptionGrid("materialOptions", stickerPricing.materials, "material");
  renderOptionGrid("finishOptions", stickerPricing.finishes, "finish");
  renderOptionGrid("shippingOptions", shippingPricing.methods, "shipping");
  renderQuantities();
  renderFiles();
  renderSummary();
}

function createOrderPayload() {
  const totals = orderMath();
  return {
    project: "Gorilla Order",
    version: "deploy-ready static starter",
    product: "Custom Stickers",
    customer: {
      name: $("customerName").value || "[missing]",
      email: $("customerEmail").value || "[missing]"
    },
    selections: {
      shape: find(stickerPricing.shapes, state.shape).label,
      size: find(stickerPricing.sizes, state.size).label,
      material: find(stickerPricing.materials, state.material).label,
      finish: find(stickerPricing.finishes, state.finish).label,
      quantity: state.quantity,
      shipping: find(shippingPricing.methods, state.shipping).label
    },
    artworkFiles: state.files.map((file) => ({ name: file.name, type: file.type || "unknown", sizeKb: Math.round(file.size / 1024) })),
    notes: $("orderNotes").value || "",
    totals: {
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      grandTotal: totals.grandTotal,
      eachIncludingShipping: Number(totals.each.toFixed(2))
    },
    nextStep: "Send to Printavo and payment provider."
  };
}

$("artworkInput").addEventListener("change", (event) => {
  state.files = Array.from(event.target.files || []);
  render();
});

$("purchaseButton").addEventListener("click", () => {
  $("orderPayload").textContent = JSON.stringify(createOrderPayload(), null, 2);
  $("orderDialog").showModal();
});

$("closeDialog").addEventListener("click", () => $("orderDialog").close());

render();
