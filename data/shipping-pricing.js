export const shippingPricing = {
  methods: [
    { id: "pickup", label: "Pickup in Salem", description: "Customer picks up at Gorilla Salem.", type: "flat", price: 0 },
    { id: "local-delivery", label: "Local Delivery", description: "Local delivery within the service area.", type: "flat", price: 15 },
    {
      id: "standard-shipping",
      label: "Standard Shipping",
      description: "Standard shipping for most sticker orders.",
      type: "tiered",
      tiers: [
        { maxSubtotal: 75, price: 8 },
        { maxSubtotal: 200, price: 12 },
        { maxSubtotal: 500, price: 18 },
        { maxSubtotal: null, price: 25 }
      ]
    },
    {
      id: "rush-shipping",
      label: "Rush Shipping",
      description: "Faster shipping option when available.",
      type: "tiered",
      tiers: [
        { maxSubtotal: 75, price: 18 },
        { maxSubtotal: 200, price: 25 },
        { maxSubtotal: 500, price: 35 },
        { maxSubtotal: null, price: 50 }
      ]
    }
  ]
};
