export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET or POST."
    });
  }

  const printavoEmail = process.env.PRINTAVO_EMAIL;
  const printavoToken = process.env.PRINTAVO_TOKEN;

  if (!printavoEmail || !printavoToken) {
    return res.status(500).json({
      success: false,
      error: "Missing PRINTAVO_EMAIL or PRINTAVO_TOKEN in Vercel Environment Variables."
    });
  }

  const query = `
    query GorillaOrderFindAnyCustomer {
      customers(first: 100) {
        totalNodes
        nodes {
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
    }
  `;

  try {
    const response = await fetch("https://www.printavo.com/api/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "email": printavoEmail,
        "token": printavoToken
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    if (!response.ok || data.errors) {
      return res.status(500).json({
        success: false,
        message: "Printavo customer lookup failed.",
        status: response.status,
        printavoResponse: data
      });
    }

    const customers = data?.data?.customers?.nodes || [];

    const anyCustomer = customers.find((customer) => {
      const companyName = (customer.companyName || "").toLowerCase().trim();
      const contactName = (customer.primaryContact?.fullName || "").toLowerCase().trim();

      return (
        companyName === "any customer" ||
        contactName === "any customer" ||
        companyName.includes("any customer") ||
        contactName.includes("any customer")
      );
    });

    if (!anyCustomer) {
      return res.status(404).json({
        success: false,
        message: "Connected to Printavo, but could not find a customer named Any Customer in the first 100 customers.",
        totalCustomersReturned: customers.length,
        sampleCustomers: customers.slice(0, 10).map((customer) => ({
          id: customer.id,
          companyName: customer.companyName,
          primaryContactName: customer.primaryContact?.fullName || null,
          primaryContactEmail: customer.primaryContact?.email || null
        }))
      });
    }

    return res.status(200).json({
      success: true,
      message: "Found Any Customer in Printavo.",
      anyCustomer: {
        id: anyCustomer.id,
        companyName: anyCustomer.companyName,
        publicUrl: anyCustomer.publicUrl,
        primaryContact: anyCustomer.primaryContact
      },
      nextStep: "Use this customer ID to create a safe test quote/order."
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not connect to Printavo.",
      error: String(error)
    });
  }
}
