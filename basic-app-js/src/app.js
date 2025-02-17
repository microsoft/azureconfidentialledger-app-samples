export function echo_handler(request) {
  const body = request.body.json();

  if (typeof body.value != "string") {
    return {
      statusCode: 400,
      body: {
        error: "Invalid body type",
      },
    };
  }

  return {
    body: {
      echoed_value: body.value,
    },
  };
}
