import { next } from "@vercel/functions";

export default function proxy(request) {
  const username = process.env.ISHIN_TEST_USER;
  const password = process.env.ISHIN_TEST_PASS;

  if (!username || !password) {
    return new Response("Access protection is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  const supplied = request.headers.get("authorization");

  if (supplied !== expected) {
    return new Response("Authentication required.", {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Basic realm="Ishin Test", charset="UTF-8"',
      },
    });
  }

  return next();
}
