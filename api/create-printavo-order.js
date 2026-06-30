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

  async function printavoRequest(query) {
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
      throw {
        status: response.status,
        response: data
      };
    }

    return data.data;
  }

  const query = `
    query GorillaOrderFeeSchema {
      feeInput: __type(name: "FeeInput") {
        inputFields {
          name
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
          defaultValue
        }
      }

      fee: __type(name: "Fee") {
        fields {
          name
          type {
            kind
            name
            ofType {
              kind
              name
            }
          }
        }
      }

      mutationType: __type(name: "Mutation") {
        fields {
          name
          args {
            name
            type {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  `;

  try {
    const data = await printavoRequest(query);

    const feeMutations = (data.mutationType?.fields || [])
      .filter((field) => field.name === "feeCreate" || field.name === "feeCreates");

    return res.status(200).json({
      success: true,
      message: "Fee schema retrieved. Send this response back to ChatGPT.",
      feeInput: data.feeInput,
      fee: data.fee,
      feeMutations
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not inspect Printavo fee schema.",
      error
    });
  }
}
