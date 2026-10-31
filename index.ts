import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";

interface Env {
  MCP_ACCESS_TOKEN: string;
  IG_ACCESS_TOKEN: string;
  IG_USER_ID: string;
  GRAPH_API_VERSION: string;
}

function graphBase(env: Env): string {
  const version = (env.GRAPH_API_VERSION || "").trim();
  if (!/^v\d+\.\d+$/.test(version)) {
    throw new Error("Set GRAPH_API_VERSION to a currently supported Meta Graph API version.");
  }
  return `https://graph.facebook.com/${version}`;
}

async function graphRequest(
  env: Env,
  path: string,
  method: "GET" | "POST",
  params: Record<string, string>
): Promise<any> {
  if (!env.IG_ACCESS_TOKEN || !env.IG_USER_ID) {
    throw new Error("Instagram is not configured. Add IG_ACCESS_TOKEN and IG_USER_ID as Worker secrets/variables.");
  }

  const url = new URL(`${graphBase(env)}/${path.replace(/^\//, "")}`);
  const form = new URLSearchParams(params);
  if (method === "GET") {
    for (const [key, value] of form) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.IG_ACCESS_TOKEN}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {})
    },
    ...(method === "POST" ? { body: form } : {})
  });

  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `Instagram Graph API failed (HTTP ${response.status}).`);
  }
  return data;
}

function createServer(env: Env) {
  const server = new McpServer({ name: "InstaPilot AI", version: "1.0.0" });

  server.registerTool(
    "instagram_get_account",
    {
      description: "Read basic details of the connected Instagram professional account.",
      inputSchema: {}
    },
    async () => {
      try {
        const data = await graphRequest(env, env.IG_USER_ID, "GET", {
          fields: "id,username,account_type,media_count"
        });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: String(error) }] };
      }
    }
  );

  server.registerTool(
    "instagram_publish_image",
    {
      description: "Publish an image immediately. Requires a public HTTPS image URL. Only call after the account owner explicitly confirms the exact image URL and caption.",
      inputSchema: {
        image_url: z.string().url().describe("Public HTTPS image URL"),
        caption: z.string().max(2200).optional().describe("Instagram caption")
      }
    },
    async ({ image_url, caption }) => {
      try {
        if (!image_url.startsWith("https://")) throw new Error("image_url must use HTTPS.");
        const container = await graphRequest(env, `${env.IG_USER_ID}/media`, "POST", {
          image_url,
          ...(caption ? { caption } : {})
        });
        if (!container.id) throw new Error("Meta did not return a media container ID.");
        const result = await graphRequest(env, `${env.IG_USER_ID}/media_publish`, "POST", {
          creation_id: String(container.id)
        });
        return { content: [{ type: "text", text: JSON.stringify({
          status: "published", creation_id: container.id, media_id: result.id
        }, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: String(error) }] };
      }
    }
  );

  server.registerTool(
    "instagram_publish_reel",
    {
      description: "Publish a Reel immediately. Requires a public HTTPS video URL. Only call after the account owner explicitly confirms the exact video URL and caption.",
      inputSchema: {
        video_url: z.string().url().describe("Public HTTPS video URL"),
        caption: z.string().max(2200).optional().describe("Reel caption")
      }
    },
    async ({ video_url, caption }) => {
      try {
        if (!video_url.startsWith("https://")) throw new Error("video_url must use HTTPS.");
        const container = await graphRequest(env, `${env.IG_USER_ID}/media`, "POST", {
          media_type: "REELS",
          video_url,
          ...(caption ? { caption } : {})
        });
        if (!container.id) throw new Error("Meta did not return a Reel container ID.");

        let status = "";
        for (let i = 0; i < 8; i++) {
          const state = await graphRequest(env, String(container.id), "GET", { fields: "status_code" });
          status = String(state.status_code || "");
          if (status === "FINISHED") break;
          if (status === "ERROR" || status === "EXPIRED") {
            throw new Error(`Reel processing failed with status ${status}.`);
          }
          await new Promise(resolve => setTimeout(resolve, 2500));
        }
        if (status !== "FINISHED") {
          return { content: [{ type: "text", text:
            `Reel container ${container.id} is still processing (status: ${status || "unknown"}). Check again before publishing.`
          }] };
        }

        const result = await graphRequest(env, `${env.IG_USER_ID}/media_publish`, "POST", {
          creation_id: String(container.id)
        });
        return { content: [{ type: "text", text: JSON.stringify({
          status: "published", creation_id: container.id, media_id: result.id
        }, null, 2) }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: String(error) }] };
      }
    }
  );

  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "InstaPilot MCP" });
    }
    if (url.pathname !== "/mcp") {
      return new Response("InstaPilot MCP. Use /mcp.", { status: 404 });
    }
    if (!env.MCP_ACCESS_TOKEN) {
      return new Response("Server setup incomplete: MCP_ACCESS_TOKEN is missing.", { status: 503 });
    }
    if (request.headers.get("Authorization") !== `Bearer ${env.MCP_ACCESS_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const handler = createMcpHandler(() => createServer(env));
    return handler(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;
