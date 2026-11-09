# Content Engine Connectors

| Category | Default | Alternatives |
|----------|---------|-------------|
| `~~knowledge base` | Notion | Obsidian, Confluence, any document store |
| `~~publishing` | Vercel (Next.js MDX) | Ghost, Substack, WordPress, Webflow |
| `~~email marketing` | Resend | Mailchimp, ConvertKit, Beehiiv, Kit |
| `~~chat` | Slack | Discord, Teams |
| `~~analytics` | Vercel Analytics | Plausible, GA4, PostHog |

## Connector Usage in This Plugin

- `~~knowledge base` — check for existing drafts, research notes, or content calendar before writing
- `~~publishing` — publish approved content directly via `/publish-content`
- `~~email marketing` — send newsletters via `/generate-newsletter`
- `~~chat` — route drafts to approval channel via `/generate-newsletter` and `/generate-social`
- `~~analytics` — surface top-performing pieces to inform new content strategy

## No Connectors Required

Content creation and review work fully offline using local voice documentation (`CREATOR.md`). Connectors add distribution capability.

The installed MCP configuration is empty. Previous placeholder connections are now opt-in examples in `examples/mcp-config.json`; they do not start on install. Choose a provider only when the job needs it, verify its current setup and use credentials from your own environment. The examples have not established provider availability or runtime compatibility.

Installing this writing workflow does not connect accounts or authorize sends. Signature edition also works from a provisional voice brief when no existing voice file is available.
