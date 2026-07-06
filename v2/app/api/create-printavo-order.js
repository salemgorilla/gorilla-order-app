export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST from the Gorilla Order website."
    });
  }

  const printavoEmail = process.env.PRINTAVO_EMAIL;
  const printavoToken = process.env.PRINTAVO_TOKEN;
  const testCustomerId = process.env.PRINTAVO_TEST_CUSTOMER_ID;

  if (!printavoEmail || !printavoToken) {
    return res.status(500).json({
      success: false,
      error: "Missing PRINTAVO_EMAIL or PRINTAVO_TOKEN in Vercel Environment Variables."
    });
  }

  if (!testCustomerId) {
    return res.status(500).json({
      success: false,
      error: "Missing PRINTAVO_TEST_CUSTOMER_ID in Vercel Environment Variables."
    });
  }

  const order = req.body || {};

  async function printavoRequest({ query, variables }) {
    const response = await fetch("https://www.printavo.com/api/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "email": printavoEmail,
        "token": printavoToken
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();

    if (!response.ok || data.errors) {
      throw {
        status: response.status,
        data
      };
    }

    return data.data;
  }

  try {
    const customerData = await printavoRequest({
      query: `
        query GorillaOrderCustomer($id: ID!) {
          customer(id: $id) {
            id
            companyName
            publicUrl
            primaryContact {
              id
              fullName
              email
              phone
            }
          }
        }
      `,
      variables: { id: testCustomerId }
    });

    const customer = customerData.customer;

    if (!customer?.primaryContact?.id) {
      return res.status(500).json({
        success: false,
        message: "Found the test customer, but no primary contact ID was available.",
        customer
      });
    }

    const item = order.order || {};
    const pricing = order.pricing || {};

    const quantity = Number(item.quantity || 1);
    const subtotal = Number(pricing.subtotal || 0);
    const shippingTotal = Number(pricing.shippingTotal || 0);
    const grandTotal = Number(pricing.grandTotal || subtotal + shippingTotal);
    const stickerUnitPrice = quantity > 0 ? Number((subtotal / quantity).toFixed(4)) : subtotal;

    const today = new Date();
    const customerDueAt = item.neededBy || new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dueAt = `${customerDueAt}T17:00:00Z`;

    const customerNote = [
      "GORILLA ORDER TEST QUOTE",
      "",
      "This quote was created automatically from Gorilla Order.",
      "",
      `Product: ${item.product || "Custom Stickers"}`,
      `Quantity: ${quantity}`,
      `Shape: ${item.shape || ""}`,
      `Size: ${item.size || ""}`,
      `Material: ${item.material || ""}`,
      `Finish: ${item.finish || ""}`,
      `Shipping Method: ${pricing.shippingMethod || ""}`,
      `Shipping Total: ${shippingTotal}`,
      `Grand Total From Website: ${grandTotal}`,
      "",
      `Customer-entered name: ${order?.customer?.name || ""}`,
      `Customer-entered email: ${order?.customer?.email || ""}`,
      `Customer-entered phone: ${order?.customer?.phone || ""}`,
      "",
      `Order Notes: ${item.notes || ""}`
    ].join("\n");

    const productionNote = [
      "Created by Gorilla Order test integration.",
      "Review pricing, shipping, and artwork before sending payment request.",
      "Artwork upload to Printavo is not connected yet."
    ].join("\n");

    const quoteData = await printavoRequest({
      query: `
        mutation GorillaOrderQuoteCreate($input: QuoteCreateInput!) {
          quoteCreate(input: $input) {
            id
            nickname
            publicUrl
            publicPdf
            subtotal
            total
            customerDueAt
            dueAt
            contact {
              id
              fullName
              email
            }
          }
        }
      `,
      variables: {
        input: {
          contact: { id: customer.primaryContact.id },
          nickname: `GORILLA ORDER TEST - ${quantity} ${item.shape || ""} Stickers`,
          customerDueAt,
          dueAt,
          customerNote,
          productionNote,
          tags: ["#GorillaOrder", "#WebsiteTest", "#Stickers"]
        }
      }
    });

    const quote = quoteData.quoteCreate;

    const lineItemDescription = [
      `${quantity} ${item.shape || ""} Stickers`,
      `${item.size || ""} / ${item.material || ""} / ${item.finish || ""}`
    ].join("\n");

    const groupData = await printavoRequest({
      query: `
        mutation GorillaOrderLineItemGroupCreate($parentId: ID!, $input: LineItemGroupCreateInput!) {
          lineItemGroupCreate(parentId: $parentId, input: $input) {
            id
            position
            order {
              ... on Quote {
                id
                subtotal
                total
                publicUrl
                publicPdf
              }
            }
          }
        }
      `,
      variables: {
        parentId: quote.id,
        input: {
          position: 1,
          lineItems: [
            {
              description: lineItemDescription,
              itemNumber: "GORILLA-STICKER",
              position: 1,
              price: stickerUnitPrice,
              sizes: [
                { size: "size_other", count: quantity }
              ],
              taxed: true
            },
            {
              description: `${pricing.shippingMethod || "Shipping"} - Shipping / Pickup`,
              itemNumber: "GORILLA-SHIPPING",
              position: 2,
              price: shippingTotal,
              sizes: [
                { size: "size_other", count: 1 }
              ],
              taxed: false
            }
          ]
        }
      }
    });

    const refreshedQuoteData = await printavoRequest({
      query: `
        query GorillaOrderQuote($id: ID!) {
          quote(id: $id) {
            id
            nickname
            publicUrl
            publicPdf
            subtotal
            total
            customerDueAt
            dueAt
            lineItemGroups(first: 10) {
              nodes {
                id
                lineItems(first: 10) {
                  nodes {
                    id
                    description
                    itemNumber
                    items
                    price
                    taxed
                  }
                }
              }
            }
          }
        }
      `,
      variables: { id: quote.id }
    });

    return res.status(200).json({
      success: true,
      message: "Created a Gorilla Order test quote with priced line items in Printavo.",
      testCustomer: {
        id: customer.id,
        companyName: customer.companyName,
        primaryContact: customer.primaryContact
      },
      quote: refreshedQuoteData.quote,
      createdLineItemGroup: groupData.lineItemGroupCreate,
      websiteTotals: {
        subtotal,
        shippingTotal,
        grandTotal,
        stickerUnitPrice
      },
      note: "This creates a quote with line items. It does not request payment or create a production order."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Printavo priced quote creation failed.",
      error
    });
  }
}
