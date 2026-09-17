Deno.serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.toLowerCase();

  const corsHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-goog-api-key, x-requested-with",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const bearerKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  const apiKey = req.headers.get("x-goog-api-key") || bearerKey;

  // 1. OpenAI 兼容模型列表
  if (path.includes("/models")) {
    return new Response(
      JSON.stringify({
        object: "list",
        data: [
          { id: "gemini-1.5-flash", object: "model", created: 1710000000, owned_by: "google" },
          { id: "gemini-1.5-pro", object: "model", created: 1710000000, owned_by: "google" },
        ],
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  // 2. OpenAI 兼容聊天补全 -> 转发至 Google AI Studio
  if (path.includes("/chat/completions")) {
    try {
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: { message: "Missing Google AI Studio API Key" } }),
          { status: 401, headers: corsHeaders }
        );
      }

      const body = await req.json();
      const model = body.model || "gemini-1.5-flash";

      // 转换 OpenAI messages 格式 -> Gemini contents 格式
      const contents = (body.messages || []).map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content || "" }],
      }));

      // 纯正的 AI Studio 官方端点
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const geminiRes = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });

      const geminiData = await geminiRes.json();
      if (!geminiRes.ok) {
        return new Response(
          JSON.stringify({
            error: {
              message: geminiData.error?.message || `AI Studio error status ${geminiRes.status}`,
              code: geminiRes.status,
            },
          }),
          { status: geminiRes.status, headers: corsHeaders }
        );
      }

      const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

      return new Response(
        JSON.stringify({
          id: "chatcmpl-" + Date.now(),
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: textResponse },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: corsHeaders }
      );
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: { message: e.message } }),
        { status: 500, headers: corsHeaders }
      );
    }
  }

  return new Response(
    JSON.stringify({ status: "OK", path: url.pathname }),
    { status: 200, headers: corsHeaders }
  );
});
