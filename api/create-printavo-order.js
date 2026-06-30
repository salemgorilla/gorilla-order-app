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
        response: data
      };
    }

    return data.data;
  }

  try {
    const customerData = await printavoRequest({
      query: `
        query GorillaOrderGetCustomer($id: ID!) {
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
      variables: {
        id: testCustomerId
      }
    });

    const customer = customerData.customer;
    const contact = customer && customer.primaryContact;

    if (!customer || !contact || !contact.id) {
      return res.status(500).json({
        success: false,
        message: "Found the test customer ID, but could not find a primary contact on that customer.",
        customer
      });
    }

    const today = new Date();
    const fallbackDue = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    const requestedDate =
      (order.order && order.order.neededBy) ||
      fallbackDue.toISOString().slice(0, 10);

    const dueAt = requestedDate + "T17:00:00Z";

    const quoteData = await printavoRequest({
      query: `
        mutation GorillaOrderCreateTestQuote($input: QuoteCreateInput!) {
          quoteCreate(input: $input) {
            id
            visualId
            publicUrl
            workorderUrl
            customerNote
            productionNote
            customerDueAt
            dueAt
            subtotal
            total
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
          contact: { id: contact.id },
          customerDueAt: requestedDate,
          dueAt: dueAt,
          nickname: "GORILLA ORDER TEST - Sticker + Shipping",
          customerNote: "This is a Gorilla Order test quote. Please ignore for production.",
          productionNote: [
            "GORILLA ORDER TEST QUOTE",
            "",
            "Customer-entered name: " + ((order.customer && order.customer.name) || ""),
            "Customer-entered email: " + ((order.customer && order.customer.email) || ""),
            "Customer-entered phone: " + ((order.customer && order.customer.phone) || ""),
            "",
            "Notes: " + ((order.order && order.order.notes) || ""),
            "",
            "Artwork files: " + (
              Array.isArray(order.artworkFiles) && order.artworkFiles.length
                ? order.artworkFiles.map(function(file) { return file.name; }).join(", ")
                : "None uploaded in this test"
            )
          ].join("\n"),
          tags: ["#gorilla-order-test", "#website-order-test"]
        }
      }
    });

    const quote = quoteData.quoteCreate;

    const stickerDescription = [
      ((order.order && order.order.size) || "") + " " + ((order.order && order.order.shape) || "") + " Stickers",
      "Material: " + ((order.order && order.order.material) || "N/A"),
      "Finish: " + ((order.order && order.order.finish) || "N/A"),
      "Quantity: " + ((order.order && order.order.quantity) || "N/A")
    ].join("\n");

    const lineItemGroupData = await printavoRequest({
      query: `
        mutation GorillaOrderCreateLineItemGroup($parentId: ID!, $input: LineItemGroupCreateInput!) {
          lineItemGroupCreate(parentId: $parentId, input: $input) {
            id
            position
            lineItems {
              nodes {
                id
                description
                price
                taxed
                position
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
              position: 1,
              description: stickerDescription,
              price: Number((order.pricing && order.pricing.subtotal) || 0),
              taxed: true
            }
          ]
        }
      }
    });

    let shippingFee = null;
    let shippingFeeError = null;
    const shippingTotal = Number((order.pricing && order.pricing.shippingTotal) || 0);

    if (shippingTotal > 0) {
      try {
        const feeData = await printavoRequest({
          query: `
            mutation GorillaOrderCreateShippingFee($parentId: ID!, $input: FeeInput!) {
              feeCreate(parentId: $parentId, input: $input) {
                id
                description
                amount
                quantity
                unitPrice
                taxable
              }
            }
          `,
          variables: {
            parentId: quote.id,
            input: {
              description: (order.pricing && order.pricing.shippingMethod) || "Shipping",
              amount: shippingTotal,
              quantity: 1,
              unitPrice: shippingTotal,
              taxable: false,
              unitPriceAsPercentage: false
            }
          }
        });

        shippingFee = feeData.feeCreate;
      } catch (error) {
        shippingFeeError = error;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Created a Printavo test quote with sticker line item and shipping fee.",
      customer: {
        id: customer.id,
        companyName: customer.companyName,
        primaryContact: contact
      },
      quote: quote,
      lineItemGroup: lineItemGroupData.lineItemGroupCreate,
      shippingFee: shippingFee,
      shippingFeeError: shippingFeeError,
      nextStep: shippingFeeError
        ? "Sticker line item worked. Shipping fee still needs adjustment."
        : "Sticker line item and shipping fee both worked. Next we can replace JSON with a polished confirmation screen."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not create the Printavo quote with line item and shipping.",
      error: error
    });
  }
}
