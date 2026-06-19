# blip-mcp

An **MCP server** for the [Take Blip](https://www.blip.ai/) platform. It exposes
your Blip account to any MCP client (Claude Code, Claude Desktop, Cursor, …)
over the **stdio** transport, on top of the official Blip **HTTP / Command API**.

You can:

- **Reach your Blip resources** — contacts (CRM), key/value buckets, broadcast
  lists, schedules, and a generic escape hatch for *anything else*.
- **Ask your bot's AI / knowledge base** a question (`blip_ask_ai`).
- Send messages and mutate data — gated behind an explicit safety switch so you
  don't message real users by accident.

> Built with `@modelcontextprotocol/sdk`, TypeScript (strict), `zod` validation,
> per-request timeouts, retry-with-backoff, and **secret redaction everywhere**.

---

## Requirements

- **Node.js 18.17+** (uses the built-in global `fetch`).
- A Take Blip bot and its connection credentials (see below).

---

## Install

**Three ways for people to run it:**

1. **Straight from GitHub (no npm needed — works as soon as the repo is pushed):**
   ```bash
   npx -y github:Michaeltsg/mcp-blip --version
   ```
   npm clones, builds (via the `prepare` script) and runs it. This is what the
   `.mcp.json` below uses.

2. **From npm** (recommended — **published**): `npx -y take-blip-mcp`. Note: the name
   `blip-mcp` is already taken on npm, so publish under a free name (this package
   is set up as `take-blip-mcp`) and use `npx -y take-blip-mcp`.

3. **Clone & build** (for development or a pinned local copy):
   ```bash
   git clone https://github.com/Michaeltsg/mcp-blip.git
   cd mcp-blip && npm install && npm run build
   # then point .mcp.json at: node /abs/path/to/mcp-blip/dist/index.js
   ```

> ⚠️ Do **not** use a bare `npx blip-mcp` — that pulls a different, unrelated
> package from npm. Always use the `github:Michaeltsg/mcp-blip` form (or your own
> published name).

## Get your Blip credentials (portal step-by-step)

1. Open your bot in the Blip portal (**https://blip.ai** → your bot).
2. Go to **Configurações** (Settings) → **Informações de conexão**
   (Connection information).
3. Open the **HTTP Endpoints** section.
4. Copy the value of **"Cabeçalho de autenticação (Authorization)"**
   (Authorization header). It already looks like:

   ```
   Key bWV1Ym90OmFiYzEyMy4uLg==
   ```

   That whole string is your `BLIP_AUTHORIZATION`.
5. Your **contract id / shortname** is the bot subdomain — it forms the host
   `https://<contract>.http.msging.net`. Use it as `BLIP_CONTRACT_ID`.

> Prefer not to copy the ready-made header? You can instead provide
> `BLIP_BOT_IDENTIFIER` + `BLIP_ACCESS_KEY` and the server computes
> `Key base64("<identifier>:<accessKey>")` for you.

---

## Multiple bots (multi-flow)

If your account has several bots (a router + sub-bots), add each as a flow.
For EACH bot, repeat the credential steps above to get its name (the bot Id)
and an access key:

```
BLIP_CONTRACT_ID=mycontract
BLIP_FLOW_NAME=my-router-bot
BLIP_AUTHORIZATION="Key ..."           # default flow

BLIP_FLOW_1_NAME=my-subbot
BLIP_FLOW_1_AUTHORIZATION="Key ..."
BLIP_FLOW_2_NAME=another-bot
BLIP_FLOW_2_AUTHORIZATION="Key ..."
```

`blip_list_flows` shows everything configured (names only). When you map a flow,
the server checks that each key's real identity matches its configured name.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `BLIP_AUTHORIZATION` | one of two modes | — | Ready-made header, e.g. `Key <base64>`. **Preferred.** |
| `BLIP_BOT_IDENTIFIER` | with access key | — | Bot identifier (credential mode 2). |
| `BLIP_ACCESS_KEY` | with identifier | — | Access key (credential mode 2). |
| `BLIP_CONTRACT_ID` | no | — | Contract / shortname → host `https://<id>.http.msging.net`. |
| `BLIP_SHORTNAME` | no | — | Alias for `BLIP_CONTRACT_ID`. |
| `BLIP_BASE_URL` | no | derived | Full base URL override (rare). |
| `BLIP_ALLOW_WRITES` | no | `false` | Master switch for side-effecting tools. |
| `BLIP_REQUEST_TIMEOUT_MS` | no | `30000` | Per-request timeout (ms). |
| `BLIP_MAX_RETRIES` | no | `3` | Retries on 429/5xx/network errors. |
| `BLIP_LOG_LEVEL` | no | `info` | `error` \| `warn` \| `info` \| `debug` (stderr only). |
| `BLIP_FLOW_NAME` | no | `default` | Friendly name for the default flow (e.g. your bot Id). |
| `BLIP_FLOW_<n>_*` | no | — | Extra flows: `_NAME`, `_AUTHORIZATION` (or `_BOT_IDENTIFIER`/`_ACCESS_KEY`), `_CONTRACT_ID`. |
| `BLIP_FLOWS_DIR` | no | `flows` | Where `blip_map_flow` writes componentized docs. |
| `BLIP_ENV_FILE` | no | `blip.env` | Path to an env file to auto-load (real env always wins). |
| `BLIP_DATA_DIR` | no | `.mcp-blip` | Base folder for everything blip-mcp writes. |

If no contract/host is given, the server falls back to the shared host
`https://http.msging.net` (for accounts not in an organization).

---

## Safety: read-only by default

Every tool that **sends a message** or **mutates data** is gated by
`BLIP_ALLOW_WRITES` (default `false`). While off:

- `blip_send_message`, `blip_set_bucket`, `blip_set_contact`,
  `blip_delete_contact` return a **"READ-ONLY MODE"** notice instead of running.
- `blip_command` refuses any method other than `get`.

Start in read-only mode while you explore. Set `BLIP_ALLOW_WRITES=true` (and
restart the server) only when you're ready to cause real side effects.

---

## Configure your MCP client

### Project file `.mcp.json` (recommended)

Drop a `.mcp.json` at your project root (any MCP client picks it up). Keep your
secrets in a gitignored `blip.env` and point the server at it:

```json
{
  "mcpServers": {
    "blip": {
      "command": "npx",
      "args": ["-y", "github:Michaeltsg/mcp-blip"],
      "env": { "BLIP_ENV_FILE": "blip.env", "BLIP_ALLOW_WRITES": "false" }
    }
  }
}
```

Then create `blip.env` next to it with your credentials. The server also
auto-loads `./blip.env` even if you omit `BLIP_ENV_FILE`. See
[.mcp.json.example](.mcp.json.example). (Cursor uses `.cursor/mcp.json`, same shape.)

### Claude Code

Local build (works today):

```bash
claude mcp add blip -s user \
  -e BLIP_AUTHORIZATION="Key xxxxx" \
  -e BLIP_CONTRACT_ID="meu-contrato" \
  -e BLIP_ALLOW_WRITES="false" \
  -- node /absolute/path/to/mcp-blip/dist/index.js
```

After publishing to npm, the same with `npx`:

```bash
claude mcp add blip -s user \
  -e BLIP_AUTHORIZATION="Key xxxxx" \
  -e BLIP_CONTRACT_ID="meu-contrato" \
  -e BLIP_ALLOW_WRITES="false" \
  -- npx -y github:Michaeltsg/mcp-blip
```

### Claude Desktop / Cursor (JSON)

Add to `mcpServers` (Claude Desktop: `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "blip": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-blip/dist/index.js"],
      "env": {
        "BLIP_AUTHORIZATION": "Key xxxxx",
        "BLIP_CONTRACT_ID": "meu-contrato",
        "BLIP_ALLOW_WRITES": "false"
      }
    }
  }
}
```

Once published, swap `command`/`args` for `"command": "npx", "args": ["-y", "github:Michaeltsg/mcp-blip"]`.

---

## Validate credentials (self-test)

```bash
BLIP_AUTHORIZATION="Key xxxxx" BLIP_CONTRACT_ID="meu-contrato" \
  node dist/index.js --self-test
```

It performs a tiny `GET /contacts?$take=1` and prints a **masked** config
summary plus OK/FAILED. Your token is never printed.

---

## Tools

### Read (safe, always available)

| Tool | What it does |
|---|---|
| `blip_list_contacts` | List CRM contacts. Args: `skip`, `take` (1–100), `filter` (OData). |
| `blip_get_contact` | Get one contact by `identity`. |
| `blip_find_contact_by_phone` | Find a contact by phone (tries 55/+/local formats). |
| `blip_get_bucket` | Read a value from key/value storage by `id`. |
| `blip_list_broadcast_lists` | List broadcast/distribution lists. *(experimental)* |
| `blip_list_recipients` | List recipients of a broadcast `list`. *(experimental)* |
| `blip_list_schedules` | List scheduled messages/commands. *(experimental)* |
| `blip_ask_ai` | Ask your bot's AI. `mode="knowledge"` (knowledge base) or `"intent"` (intentions/entities). *(experimental)* |
| `blip_command` | **Escape hatch:** run any `get` command (and writes when enabled). |
| `blip_get_thread` | Conversation history with a contact (what was said). |
| `blip_list_threads` | Recent conversations. |
| `blip_get_context` | A contact's **context variables** — the values flow rules evaluate against. *(experimental)* |
| `blip_get_context_variable` | One context variable; `stateid@{flowId}` = where the contact is in a flow. *(experimental)* |
| `blip_get_flow` | The published flow definition (blocks + conditions/rules). *(experimental)* |
| `blip_list_event_categories` | Event categories your flows track. *(experimental)* |
| `blip_get_event_track` | Tracked events for a category (optional date range). *(experimental)* |
| `blip_list_flows` | List configured flows (names/hosts only, never secrets). |
| `blip_map_flow` | Read a flow and write componentized docs (index + one file per block) under `flows/<flow>/`. |

### Write (require `BLIP_ALLOW_WRITES=true`)

| Tool | Side effect |
|---|---|
| `blip_send_message` | **Sends a message to a real recipient.** |
| `blip_set_bucket` | Writes a value to storage. |
| `blip_set_contact` | Creates/updates a contact (`merge`). |
| `blip_delete_contact` | Permanently deletes a contact. |

### Examples (natural language to your MCP client)

- "List the first 5 Blip contacts that came from WhatsApp."
  → `blip_list_contacts { take: 5, filter: "substringof('WhatsApp',source)" }`
- "Ask my bot's knowledge base: what are the opening hours?"
  → `blip_ask_ai { text: "what are the opening hours?", mode: "knowledge" }`
- "Read bucket `onboarding_state`."
  → `blip_get_bucket { id: "onboarding_state" }`
- "Run a raw command: get the active message templates."
  → `blip_command { method: "get", uri: "/templates" }`
- (writes on) "Send 'Hi!' to 5511999999999 on WhatsApp."
  → `blip_send_message { to: "5511999999999@wa.gw.msging.net", content: "Hi!" }`

---

## Experimental / unverified endpoints

These were implemented from Blip's documented patterns and the official C# SDK,
but **not verified against a live account**, so they're marked *experimental*:

- **AI / knowledge base** (`blip_ask_ai`): `postmaster@ai.msging.net`,
  `SET /content/analysis` (knowledge) and `SET /analysis` (intent), resource
  type `application/vnd.iris.ai.analysis-request+json`. The exact content
  contract can vary per account.
- **Broadcast lists** (`blip_list_broadcast_lists`, `blip_list_recipients`):
  `postmaster@broadcast.msging.net`, `/lists` and `/lists/{id}/recipients`.
- **Schedules** (`blip_list_schedules`): `postmaster@scheduler.msging.net`,
  `/schedules`.

If any of these don't match your account, use `blip_command` with the exact
`to`/`uri`/`resource` from your Blip docs.

> **Buckets note:** bucket commands are sent to your bot's **own node** (no
> `to`/postmaster), which is the correct Blip behavior — this differs from the
> `postmaster@msging.net` mentioned in some notes. Override with `blip_command`
> if your setup needs it.

---

## Debugging "why did this contact take this path?"

Blip's HTTP API does not expose a turn-by-turn condition-evaluation log, but you
can reconstruct the decision from a few reads and let your MCP client diff them:

1. `blip_get_flow` — the exact condition/rule on the branch in question.
2. `blip_get_context { identity }` — the contact's actual variable values that the
   rule evaluated against (and `stateid@{flowId}` for where they are now).
3. `blip_get_thread { identity }` — what the user actually said / chose.
4. (optional) `blip_get_event_track` — milestones the flow logged.

Then ask, e.g.: *"Why did 5511999999999 enter the Support flow instead of Sales?"*
Your client reads the rule, sees (say) `origem = WhatsApp-Ads` in the context and
explains the match — or shows that the variable the rule needed was empty.

> These journey tools are **experimental** and sent to your bot's own node (no
> postmaster). The richest turn-by-turn view is still the portal's conversation
> history / Builder debug tool; the API gives you the raw materials to reconstruct it.

---
## Multiple flows & mapping a flow into docs

`blip.env` (or your MCP env) can hold several flows (Blip bots) — a parent
router plus its subflows, each with its own access key:

```
BLIP_CONTRACT_ID=mycontract
BLIP_FLOW_NAME=my-router
BLIP_AUTHORIZATION="Key ..."          # default flow (the parent / router)

BLIP_FLOW_1_NAME=fila-identificada
BLIP_FLOW_1_AUTHORIZATION="Key ..."   # a subflow bot (its own access key)
```

- `blip_list_flows` shows what's configured (never the secrets).
- `blip_map_flow { flow: "my-router" }` reads the flow and writes a
  **componentized** doc tree under `flows/<flow>/`, so a large flow stays browsable:

```
.mcp-blip/flows/my-router/
  index.md            overview + routing graph (block -> who it connects to)
  index.json          machine-readable map
  blocks/
    inicio.md         what the block does (messages, HTTP/script actions) + its rules
    roteador-de-mensagem.md
    ...
```

Re-run after editing the flow in Builder (idempotent). CLI: `npm run map-flow -- --flow my-router`.
The `flows/` folder is gitignored by default (business logic). Mapping a subflow's
internals needs that subflow's own access key configured as an extra flow.

---

## Where blip-mcp writes (`.mcp-blip/`)

Everything the server discovers or documents goes under a single `.mcp-blip/`
folder in your project root — e.g. `blip_map_flow` writes to
`.mcp-blip/flows/<flow>/`. This keeps blip-mcp's output namespaced and out of
the way when you connect it inside a new or existing repo.

Add it (and `blip.env`) to your project's `.gitignore`:

```
.mcp-blip/
blip.env
```

Override the base with `BLIP_DATA_DIR`.

---

## How it works

Commands `POST` to `https://<contract>.http.msging.net/commands` with header
`Authorization: Key <token>` and a LIME-style envelope:

```json
{
  "id": "<uuid>",
  "to": "postmaster@crm.msging.net",
  "method": "get",
  "uri": "/contacts?$skip=0&$take=20"
}
```

A response with `status: "failure"` is converted into a clear error carrying
Blip's `reason.code` and `reason.description`. Messages `POST` to `/messages`.

---

## Publishing to npm

A GitHub Action (`.github/workflows/publish.yml`) publishes the package whenever
you create a GitHub Release. One-time setup:

1. Create an npm account + an **automation** access token (npmjs.com → Access
   Tokens → Generate New Token → Automation).
2. Add it as a repo secret named `NPM_TOKEN`:
   ```bash
   gh secret set NPM_TOKEN        # paste the token when prompted
   ```
   (or GitHub → Settings → Secrets and variables → Actions).
3. Create a release — the Action runs typecheck + tests, builds, and publishes:
   ```bash
   gh release create v0.1.0 --generate-notes
   ```
   For later versions, bump first: `npm version patch && git push --follow-tags`,
   then create the matching release.

The first publish claims the `take-blip-mcp` name. After that, users install with
`npx -y take-blip-mcp`. (A `ci.yml` workflow runs tests on every push/PR.)

## Development

```bash
npm run dev         # run from source via tsx
npm run build       # compile to dist/
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest (header assembly, sendCommand, failure, guardrails)
npm run self-test   # build first, then validate credentials
```

---

## Security notes

- Credentials come **only** from environment variables; nothing is hardcoded.
- The authorization header value is **never logged**. All logs go to **stderr**
  (stdout is reserved for the MCP protocol) and pass through a redactor that
  scrubs the token and any `Key …` pattern — even from error bodies.
- Writes are off by default (`BLIP_ALLOW_WRITES=false`).

## License

MIT © Michaeltsg. See [LICENSE](LICENSE).
