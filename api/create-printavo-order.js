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
    query GorillaOrderAuthTest {
      account {
        id
        companyName
        companyEmail
        paymentProcessorPresent
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
        message: "Printavo authentication test failed.",
        status: response.status,
        printavoResponse: data
      });
    }

    return res.status(200).json({
      success: true,
      message: "Gorilla Order successfully connected to Printavo.",
      account: data.data.account
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not connect to Printavo.",
      error: String(error)
    });
  }
}
