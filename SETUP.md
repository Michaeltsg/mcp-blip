# Setup — connecting blip-mcp to a workspace

`blip-mcp` (published as **`take-blip-mcp`**) is an MCP server for the Take Blip
platform. To use it in any project, add **two files** to the project root and two
lines to `.gitignore`. Nothing to install globally — `npx` fetches it.

## 1. `.mcp.json` (project root)

```json
{
  "mcpServers": {
    "blip": {
      "command": "npx",
      "args": ["-y", "take-blip-mcp"],
      "env": {
        "BLIP_ENV_FILE": "blip.env",
        "BLIP_ALLOW_WRITES": "false"
      }
    }
  }
}
```

> Claude Code reads `.mcp.json`. Cursor reads `.cursor/mcp.json` (same shape).

## 2. `blip.env` (project root) — your credentials

Get each bot's **Id** (name) and an **access key** in the Blip portal
(Settings → Connection information / Access keys). One bot = one flow:

```
BLIP_CONTRACT_ID=mycontract
BLIP_FLOW_NAME=my-main-bot
BLIP_AUTHORIZATION="Key ..."

# extra bots (optional) — each needs ITS OWN access key
BLIP_FLOW_1_NAME=another-bot
BLIP_FLOW_1_AUTHORIZATION="Key ..."
```

Single bot? Just the first three lines.

## 3. `.gitignore` (project root) — keep secrets + data out of git

```
blip.env
.mcp-blip/
```

`blip.env` holds your credentials; `.mcp-blip/` is where the server writes
anything it discovers/documents (e.g. flow maps). Neither should be committed.

## 4. Reload your MCP client

Claude Code will ask you to **approve** the new `blip` server the first time
(security) — approve it. Then the 22 tools are available in that workspace.

## Verify

- CLI: `npx -y take-blip-mcp --self-test` (validates credentials, masks the token).
- Or just ask your client: *"list my Blip flows"* (`blip_list_flows`).

## Safety

Starts **read-only** (`BLIP_ALLOW_WRITES=false`): tools that send messages or
change data refuse until you flip it to `true`. Read tools always work.
