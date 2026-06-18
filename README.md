# mcp-wheelcheck

> Before your AI agent proudly invents the 412th "usage tracker with SQLite and embeddings", check whether somebody already built it.

`mcp-wheelcheck` is an MCP server that searches the open-source ecosystem **before you write code**.

It checks **npm**, **crates.io**, and **GitHub** in parallel and returns ranked candidates with descriptions, stars/download counts, and links. Individual package inspection also works for **PyPI**.

The idea is simple:

1. Describe the thing you want to build.
2. Search the ecosystem.
3. Discover that three mature projects already exist.
4. Save yourself 2,000 lines of generated code and a maintenance burden.

Instead of asking:

> "Can you build a CLI that converts markdown into slides?"

ask:

> "Has the entire internet already solved this problem?"

and let `mcp-wheelcheck` answer first.

Designed to fight:

* Not-Invented-Here Syndrome
* Weekend Framework Syndrome
* "I'll just build a quick version myself"
* AI-Agent-Reimplemented-Postgres Syndrome
* The mysterious urge to spend three hours vibe-coding something that already has 40k GitHub stars

The connected LLM can then decide:

* `USE_EXISTING`
* `BUILD_NEW`
* `MIXED`

Because sometimes the best code is the code your agent never writes.

---

## Why?

Modern coding agents are incredibly good at generating software.

Unfortunately, they're also incredibly good at generating software that already exists.

Typical workflow:

* "I need a usage tracker."
* Agent writes 1,500 lines of code.
* You discover five mature alternatives.
* Agent adds configuration files.
* You discover the alternatives already solved configuration.
* Agent adds plugins.
* You discover one alternative has 300 plugins.
* Agent starts implementing analytics.
* Congratulations, you've accidentally launched a competitor.

`mcp-wheelcheck` inserts a missing step:

**Look first. Build second.**

The open-source ecosystem is enormous. Your LLM knows a lot, but it doesn't automatically perform ecosystem research before every coding task.

This tool helps it ask the ecosystem before it starts generating code.

---

## Tools

| Tool                  | Purpose                                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| `search_ecosystem`    | Free-text search across npm, crates.io, and GitHub. Returns ranked candidates.                              |
| `find_similar`        | Describe a feature in plain English and find projects that already do it. **Use this before writing code.** |
| `get_package_details` | Inspect a specific package or repository in detail before deciding whether to adopt it or reinvent it.      |

---

## Example Session

### Example 1: Markdown Slides

> **You:** I want to build a CLI tool that converts markdown files into presentation slides with live code execution.

**Agent** (`find_similar`):

Found 12 candidates:

* `slidev` [npm] ★ 36k — Presentation slides for developers
* `reveal-md` [npm] ★ 3.1k — reveal.js for markdown
* `presenterm` [crates] ★ 4.2k — Terminal markdown presentations

**Verdict:** `USE_EXISTING`

**Reasoning:** You are approximately four years and 36,000 GitHub stars late to this idea.

---

### Example 2: AI Usage Tracker

> **You:** I want to build a dashboard that tracks LLM token usage and costs.

**Agent** (`find_similar`):

Found 18 candidates:

* Langfuse
* Helicone
* OpenLIT
* LangSmith
* Phoenix

**Verdict:** `USE_EXISTING`

**Reasoning:** The ecosystem has already experienced this exact existential crisis.

---

### Example 3: Actually Build Something

> **You:** I want a CLI that automatically generates release notes from Git commits and company-specific Jira conventions.

**Agent** (`find_similar`):

Found partial matches.

**Verdict:** `MIXED`

**Reasoning:** Existing tools cover commit parsing, but your workflow-specific logic appears unique.

This is where building makes sense.

---

## How It Works

`mcp-wheelcheck` performs ecosystem discovery across multiple sources:

* **npm**
* **crates.io**
* **GitHub**

Results are returned as structured data containing:

* Package/repository name
* Description
* Popularity metrics (stars/downloads)
* Repository/package links
* Registry source

The MCP client's LLM then evaluates:

* Does this already solve the user's problem?
* Is it a close match?
* Should the user extend an existing tool instead?
* Is this actually novel?

The server intentionally stays simple:

* Read-only
* No code generation
* No opinions
* No framework wars
* No "Have you considered rewriting it in Rust?" suggestions

Just ecosystem discovery.

---

## Install

### Claude Desktop

Add to:

`~/Library/Application Support/Claude/claude_desktop_config.json`

(macOS)

or the equivalent location on your platform.

```json
{
  "mcpServers": {
    "wheelcheck": {
      "command": "npx",
      "args": ["-y", "mcp-wheelcheck"]
    }
  }
}
```

---

### Cursor

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "wheelcheck": {
      "command": "npx",
      "args": ["-y", "mcp-wheelcheck"]
    }
  }
}
```

---

### opencode

Create `opencode.json`:

```json
{
  "mcp": {
    "wheelcheck": {
      "type": "local",
      "command": ["npx", "-y", "mcp-wheelcheck"]
    }
  }
}
```

Or via:

```bash
opencode mcp add wheelcheck
```

---

### Claude Code

```bash
claude mcp add wheelcheck -- npx -y mcp-wheelcheck
```

---

### Windsurf / Codex / Others

Any MCP-compatible client that supports stdio servers can run:

```bash
npx -y mcp-wheelcheck
```

---

## Optional: GitHub Token

Without a token, GitHub search is rate-limited to approximately:

* 10 requests/minute per IP

With a token:

* 30 requests/minute for your account

Set:

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

Or configure it in your MCP client:

```json
{
  "mcpServers": {
    "wheelcheck": {
      "command": "npx",
      "args": ["-y", "mcp-wheelcheck"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

---

## Development

```bash
git clone https://github.com/tobiaspape/mcp-wheelcheck
cd mcp-wheelcheck

npm install
npm run build
npm test
npm run typecheck

npm run mcp:inspect
```

The last command launches the MCP Inspector UI for local testing.

---

## Limitations

### PyPI Search

PyPI search is currently unavailable.

Why?

Because PyPI search is protected behind a client-side challenge and the legacy XML-RPC search API was removed.

As a result:

* `search_ecosystem` searches:

  * npm
  * crates.io
  * GitHub

* `find_similar` searches:

  * npm
  * crates.io
  * GitHub

However:

`get_package_details` **does support PyPI** through the JSON API.

If you already know the package name, you can inspect it directly.

---

### Semantic Matching

Semantic matching uses the MCP client's LLM through MCP sampling.

This allows:

* Better query generation
* Better result ranking
* Semantic relevance scoring
* Match classification

Results may be classified as:

* `EXACT_MATCH`
* `PARTIAL_MATCH`
* `UNRELATED`

When MCP sampling isn't available, the server falls back to algorithmic ranking.

No embeddings. No vector database. No additional infrastructure.

The LLM already knows what a markdown presentation tool is.

Might as well let it help.

---

### Registry Limits

Rate limits still apply per registry.

Results are cached in-process for 5 minutes (200 entries, LRU) to reduce redundant API calls within and across tool invocations.

Please direct any remaining frustration toward the appropriate API provider.

---

## Philosophy

The default instinct of many coding agents is:

> "I can build that."

The question `mcp-wheelcheck` asks first is:

> "Should you?"

Sometimes the answer is:

> Build it.

Sometimes the answer is:

> Use the project with 40k stars, 800 contributors, and six years of bug fixes.

Both are valid outcomes.

The important thing is knowing which one you're dealing with.

---

## License

MIT © Tobias Pape

Built to reduce unnecessary software creation by a statistically insignificant amount.
