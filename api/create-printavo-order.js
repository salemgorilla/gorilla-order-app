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
    const contact = customer?.primaryContact;

    if (!customer || !contact?.id) {
      return res.status(500).json({
        success: false,
        message: "Found the test customer ID, but could not find a primary contact on that customer.",
        customer
      });
    }

    const today = new Date();
    const fallbackDue = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

    const requestedDate =
      order?.order?.neededBy ||
      fallbackDue.toISOString().slice(0, 10);

    const dueAt = `${requestedDate}T17:00:00Z`;

    const itemDescription = [
      "GORILLA ORDER TEST QUOTE",
      "",
      `Product: ${order?.order?.product || "Custom Stickers"}`,
      `Quantity: ${order?.order?.quantity || "N/A"}`,
      `Shape: ${order?.order?.shape || "N/A"}`,
      `Size: ${order?.order?.size || "N/A"}`,
      `Material: ${order?.order?.material || "N/A"}`,
      `Finish: ${order?.order?.finish || "N/A"}`,
      `Shipping: ${order?.pricing?.shippingMethod || "N/A"} - $${order?.pricing?.shippingTotal ?? "N/A"}`,
      `Subtotal: $${order?.pricing?.subtotal ?? "N/A"}`,
      `Grand Total: $${order?.pricing?.grandTotal ?? "N/A"}`,
      "",
      "Customer Entered Info:",
      `Name: ${order?.customer?.name || ""}`,
      `Email: ${order?.customer?.email || ""}`,
      `Phone: ${order?.customer?.phone || ""}`,
      `Company: ${order?.customer?.company || ""}`,
      "",
      `Artwork Files: ${
        Array.isArray(order?.artworkFiles) && order.artworkFiles.length
          ? order.artworkFiles.map((file) => file.name).join(", ")
          : "None uploaded in this test"
      }`,
      "",
      `Notes: ${order?.order?.notes || ""}`
    ].join("\n");

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
          dueAt,
          nickname: `GORILLA ORDER TEST - ${order?.order?.quantity || ""} ${order?.order?.shape || ""} Stickers`,
          customerNote: "This is a Gorilla Order test quote. Please ignore for production.",
          productionNote: itemDescription,
          tags: ["#gorilla-order-test", "#website-order-test"]
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: "Created a test quote in Printavo.",
      customer: {
        id: customer.id,
        companyName: customer.companyName,
        primaryContact: contact
      },
      quote: quoteData.quoteCreate,
      nextStep: "Next we will add a line item to the quote."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not create the Printavo test quote.",
      error
    });
  }
}
