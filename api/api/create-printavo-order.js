export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405 }
      );
    }

    const order = await request.json();

    // For now, this only proves the secure endpoint works.
    // Next, we will send this order to Printavo using your Vercel environment variables.
    return Response.json({
      success: true,
      message: "Secure endpoint received the order.",
      receivedOrder: order
    });
  }
};
