Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  // CORS 预检
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // 提取 Bearer Token 作为默认 Google API Key（如果客户端在 Header 带了 sk-... 或 AIzaSy...）
  const authHeader = req.headers.get("Authorization") || "";
  const bearerKey = authHeader.replace(/^Bearer\s+/i, "").trim();

  // 简易路由适配 /v1/chat/completions -> Google Gemini generateContent
  if (url.pathname.includes("/v1/chat/completions")) {
    try {
      const body = await req.json();
      const model = (body.model || "gemini-1.5-flash").replace(/^gemini-/, "gemini-");
      
      // 提取 API Key：优先从 Header，如果没带或不对，可在 URL 后面带 ?key=AIzaSy... 或写死/动态传
      // 这里支持客户端传 x-goog-api-key 或 Bearer Key
      const apiKey = req.headers.get("x-goog-api-key") || bearerKey;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: { message: "Missing Google API Key" } }), { status: 401 });
      }

      // 转换 OpenAI messages 为 Gemini contents
      const contents = (body.messages || []).map((m: any) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content || "" }]
      }));

      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      
      const geminiRes = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      });

      const geminiData = await geminiRes.json();
      const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // 封装回 OpenAI 兼容格式
      const openAiResponse = {
        id: "chatcmpl-" + Date.now(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: textResponse },
            finish_reason: "stop",
          },
        ],
      };

      return new Response(JSON.stringify(openAiResponse), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ error: { message: e.message } }), {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }
  }

  // 默认透传或返回健康检查
  return new Response(JSON.stringify({ status: "OK", proxy: "active" }), {
    status: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
});
