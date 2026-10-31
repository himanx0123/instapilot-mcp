# InstaPilot MCP

Remote MCP bridge for Claude and the official Instagram Graph API, designed for Cloudflare Workers.

## Tools
- `instagram_get_account`: read basic details for the connected professional account.
- `instagram_publish_image`: publish an image from a public HTTPS URL.
- `instagram_publish_reel`: publish a Reel from a public HTTPS URL.

Publishing tools perform real actions. Use them only after the account owner confirms the exact media URL and caption.

## Requirements
- Instagram Professional account (Creator or Business) eligible for API publishing.
- Meta developer app, the required current permissions, and an access token issued by Meta.
- Cloudflare Workers account.
- Claude custom remote MCP connector support.

The project never asks for your Instagram password. Never commit access tokens or secrets.

## Deploy
1. Import this GitHub repository into Cloudflare Workers, or deploy with Wrangler.
2. Add Worker secrets:
   - `MCP_ACCESS_TOKEN`: long random secret protecting the MCP endpoint.
   - `IG_ACCESS_TOKEN`: Meta-issued Instagram access token.
3. Add Worker variables:
   - `IG_USER_ID`: Instagram professional account ID from Meta.
   - `GRAPH_API_VERSION`: currently supported Meta Graph API version (check Meta docs; `v24.0` is only an example).
4. Deploy. Check `https://YOUR-WORKER.workers.dev/health`.

## Connect Claude
In Claude: Settings → Customize → Connectors → Add → Custom connector.
- Name: `InstaPilot AI`
- URL: `https://YOUR-WORKER.workers.dev/mcp`
- Configure request header `Authorization` with value `Bearer YOUR_MCP_ACCESS_TOKEN`.

Claude's remote MCP service must be able to reach your Worker over the public internet.

## Security and limitations
- Keep both access tokens private. Anyone with the MCP secret can invoke this server's tools.
- Meta decides account eligibility, permissions, API versions, supported formats, rate limits, and token expiry.
- Image/video URLs must be publicly fetchable by Meta; local phone-gallery files cannot be passed directly.
- Review Claude's tool approval prompts before any publish action.

## Official references
- Cloudflare remote MCP guide: https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/
- Claude custom connectors: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Meta for Developers: https://developers.facebook.com/
