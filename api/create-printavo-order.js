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
      variables: {
        id: testCustomerId
      }
    });

    const customer = customerData.customer;

    if (!customer?.primaryContact?.id) {
      return res.status(500).json({
        success: false,
        message: "Found the test customer, but no primary contact ID was available.",
        customer
      });
    }

    const today = new Date();
    const customerDueAt = order?.order?.neededBy || new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dueAt = `${customerDueAt}T17:00:00Z`;

    const item = order.order || {};
    const pricing = order.pricing || {};

    const customerNote = [
      "GORILLA ORDER TEST QUOTE",
      "",
      "This quote was created automatically from Gorilla Order.",
      "",
      `Product: ${item.product || "Custom Stickers"}`,
      `Quantity: ${item.quantity || ""}`,
      `Shape: ${item.shape || ""}`,
      `Size: ${item.size || ""}`,
      `Material: ${item.material || ""}`,
      `Finish: ${item.finish || ""}`,
      `Shipping Method: ${pricing.shippingMethod || ""}`,
      `Shipping Total: ${pricing.shippingTotal ?? ""}`,
      `Grand Total From Website: ${pricing.grandTotal ?? ""}`,
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
      "No artwork files are uploaded to Printavo yet in this test version."
    ].join("\n");

    const quoteInput = {
      contact: { id: customer.primaryContact.id },
      nickname: `GORILLA ORDER TEST - ${item.quantity || ""} ${item.shape || ""} Stickers`,
      customerDueAt,
      dueAt,
      customerNote,
      productionNote,
      tags: ["#GorillaOrder", "#WebsiteTest", "#Stickers"]
    };

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
        input: quoteInput
      }
    });

    return res.status(200).json({
      success: true,
      message: "Created a safe Gorilla Order test quote in Printavo.",
      testCustomer: {
        id: customer.id,
        companyName: customer.companyName,
        primaryContact: customer.primaryContact
      },
      quote: quoteData.quoteCreate,
      note: "This creates a quote only. It does not create a payment request or production order."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Printavo quote creation failed.",
      error
    });
  }
}
