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
    query GorillaOrderSchemaInspector {
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
                ofType {
                  kind
                  name
                }
              }
            }
          }
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

      lineItemCreateInput: __type(name: "LineItemCreateInput") {
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

      lineItemGroupCreateInput: __type(name: "LineItemGroupCreateInput") {
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

      lineItemPricingInput: __type(name: "LineItemPricingInput") {
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

      lineItemSizeCountInput: __type(name: "LineItemSizeCountInput") {
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

      lineItem: __type(name: "LineItem") {
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

      lineItemGroup: __type(name: "LineItemGroup") {
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
    }
  `;

  try {
    const data = await printavoRequest(query);

    const mutationFields = data?.mutationType?.fields || [];
    const relevantMutations = mutationFields
      .filter((field) =>
        [
          "lineItemCreate",
          "lineItemCreates",
          "lineItemGroupCreate",
          "lineItemGroupCreates",
          "quoteUpdate",
          "feeCreate",
          "feeCreates"
        ].includes(field.name)
      )
      .map((field) => ({
        name: field.name,
        args: field.args,
        returnType: field.type
      }));

    return res.status(200).json({
      success: true,
      message: "Schema details retrieved. Send this response back to ChatGPT.",
      relevantMutations,
      inputTypes: {
        lineItemCreateInput: data.lineItemCreateInput,
        lineItemGroupCreateInput: data.lineItemGroupCreateInput,
        lineItemPricingInput: data.lineItemPricingInput,
        lineItemSizeCountInput: data.lineItemSizeCountInput
      },
      objectTypes: {
        lineItem: data.lineItem,
        lineItemGroup: data.lineItemGroup
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Could not inspect Printavo schema.",
      error
    });
  }
}
