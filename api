export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST."
    });
  }

  const order = req.body;

  return res.status(200).json({
    success: true,
    message: "Secure endpoint received the Gorilla Order package.",
    nextStep: "Connect this endpoint to Printavo using PRINTAVO_EMAIL and PRINTAVO_TOKEN environment variables.",
    receivedOrder: order
  });
}
