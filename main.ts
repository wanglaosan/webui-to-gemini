const UPSTREAM = "https://generativelanguage.googleapis.com";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const target = new URL(url.pathname + url.search, UPSTREAM);

  const headers = new Headers(req.headers);
  headers.delete("host");

  return await fetch(target, {
    method: req.method,
    headers: headers,
    body: req.body,
  });
});
