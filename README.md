# Agentic Creator Skills

**ACOS — Agentic Creator OS.** Modular plugin system for independent creators, personal brands, and creative businesses. Also includes the original Anthropic agent skills library.

---

## Install ACOS Plugins

```bash
claude plugin marketplace add frankxai/gencreator-skills
```

### Full ACOS (everything):
```bash
claude plugin install core content-engine visual-studio music-lab brand-architect product-launcher intelligence@gencreator-skills
```

### Minimal setup (workspace + content):
```bash
claude plugin install core content-engine brand-architect@gencreator-skills
```

### Single module:
```bash
claude plugin install music-lab@gencreator-skills
```

**After installing core, run:** `/creator-sprint`

---

## ACOS Plugins

| Plugin | What it does | Key commands |
|--------|-------------|--------------|
| `core` | Workspace memory, task management, session structure | `/creator-sprint`, `/acos-score` |
| `content-engine` | Blog posts, social, newsletters, video scripts | `/create-content`, `/content-review`, `/generate-newsletter` |
| `visual-studio` | On-brand image generation with 7-gate quality filter | `/create-visual` |
| `music-lab` | Suno prompt engineering, style consistency | `/create-music` |
| `brand-architect` | Brand voice documentation and enforcement | `/brand-voice-check` |
| `product-launcher` | Spec → build → QA → ship → retro pipeline | `/product-spec`, `/product-sprint`, `/product-deploy`, `/product-retro` |
| `intelligence` | Pattern tracking, learning report, ACOS score | `/intelligence-report` |

### How It Works

Each plugin is a vertical slice of creator capability:
- `skills/` — domain expertise, loaded when relevant tasks are detected
- `commands/` — slash commands with full, executable workflows
- `CONNECTORS.md` — `~~category` placeholders for tool-agnostic integrations

**Progressive disclosure**: Lean SKILL.md (<3K words) + `references/` subdirectories for deep content loaded on demand.

**Memory system**: `core` sets up a two-tier memory system:
- `CREATOR.md` — hot cache (~80 lines, covers 90% of sessions)
- `creator-memory/` — deep documentation (voice, visual, music, projects, content catalog)

---

## Update

```bash
claude plugin marketplace update gencreator-skills
claude plugin update core@gencreator-skills
```

---

## Anthropic Agent Skills (original)

This repo also contains the original Anthropic agent skills library:

```bash
claude plugin install example-skills@gencreator-skills
claude plugin install document-skills@gencreator-skills
```

> For information about the Agent Skills standard, see [agentskills.io](http://agentskills.io).

---

# Skills (Anthropic original)

Skills are folders of instructions, scripts, and resources that Claude loads dynamically to improve performance on specialized tasks. Skills teach Claude how to complete specific tasks in a repeatable way, whether that's creating documents with your company's brand guidelines, analyzing data using your organization's specific workflows, or automating personal tasks.

For more information, check out:
- [What are skills?](https://support.claude.com/en/articles/12512176-what-are-skills)
- [Using skills in Claude](https://support.claude.com/en/articles/12512180-using-skills-in-claude)
- [How to create custom skills](https://support.claude.com/en/articles/12512198-creating-custom-skills)
- [Equipping agents for the real world with Agent Skills](https://anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

# About This Repository

This repository contains skills that demonstrate what's possible with Claude's skills system. These skills range from creative applications (art, music, design) to technical tasks (testing web apps, MCP server generation) to enterprise workflows (communications, branding, etc.).

Each skill is self-contained in its own folder with a `SKILL.md` file containing the instructions and metadata that Claude uses. Browse through these skills to get inspiration for your own skills or to understand different patterns and approaches.

Many skills in this repo are open source (Apache 2.0). We've also included the document creation & editing skills that power [Claude's document capabilities](https://www.anthropic.com/news/create-files) under the hood in the [`skills/docx`](./skills/docx), [`skills/pdf`](./skills/pdf), [`skills/pptx`](./skills/pptx), and [`skills/xlsx`](./skills/xlsx) subfolders. These are source-available, not open source, but we wanted to share these with developers as a reference for more complex skills that are actively used in a production AI application.

## Disclaimer

**These skills are provided for demonstration and educational purposes only.** While some of these capabilities may be available in Claude, the implementations and behaviors you receive from Claude may differ from what is shown in these skills. These skills are meant to illustrate patterns and possibilities. Always test skills thoroughly in your own environment before relying on them for critical tasks.

# Skill Sets
- [./skills](./skills): Skill examples for Creative & Design, Development & Technical, Enterprise & Communication, and Document Skills
- [./spec](./spec): The Agent Skills specification
- [./template](./template): Skill template

# Try in Claude Code, Claude.ai, and the API

## Claude Code
You can register this repository as a Claude Code Plugin marketplace by running the following command in Claude Code:
```
/plugin marketplace add anthropics/skills
```

Then, to install a specific set of skills:
1. Select `Browse and install plugins`
2. Select `anthropic-agent-skills`
3. Select `document-skills` or `example-skills`
4. Select `Install now`

Alternatively, directly install either Plugin via:
```
/plugin install document-skills@anthropic-agent-skills
/plugin install example-skills@anthropic-agent-skills
```

After installing the plugin, you can use the skill by just mentioning it. For instance, if you install the `document-skills` plugin from the marketplace, you can ask Claude Code to do something like: "Use the PDF skill to extract the form fields from `path/to/some-file.pdf`"

## Claude.ai

These example skills are all already available to paid plans in Claude.ai. 

To use any skill from this repository or upload custom skills, follow the instructions in [Using skills in Claude](https://support.claude.com/en/articles/12512180-using-skills-in-claude#h_a4222fa77b).

## Claude API

You can use Anthropic's pre-built skills, and upload custom skills, via the Claude API. See the [Skills API Quickstart](https://docs.claude.com/en/api/skills-guide#creating-a-skill) for more.

# Creating a Basic Skill

Skills are simple to create - just a folder with a `SKILL.md` file containing YAML frontmatter and instructions. You can use the **template-skill** in this repository as a starting point:

```markdown
---
name: my-skill-name
description: A clear description of what this skill does and when to use it
---

# My Skill Name

[Add your instructions here that Claude will follow when this skill is active]

## Examples
- Example usage 1
- Example usage 2

## Guidelines
- Guideline 1
- Guideline 2
```

The frontmatter requires only two fields:
- `name` - A unique identifier for your skill (lowercase, hyphens for spaces)
- `description` - A complete description of what the skill does and when to use it

The markdown content below contains the instructions, examples, and guidelines that Claude will follow. For more details, see [How to create custom skills](https://support.claude.com/en/articles/12512198-creating-custom-skills).

# Partner Skills

Skills are a great way to teach Claude how to get better at using specific pieces of software. As we see awesome example skills from partners, we may highlight some of them here:

- **Notion** - [Notion Skills for Claude](https://www.notion.so/notiondevs/Notion-Skills-for-Claude-28da4445d27180c7af1df7d8615723d0)

## Music production reference

Public portable craft: [Agentic Music Producer OS](https://github.com/frankxai/agentic-music-producer-os/tree/18dc9bee02001befb3a2a3bd7747b78f798dff13). Its [fundamentals](https://github.com/frankxai/agentic-music-producer-os/blob/18dc9bee02001befb3a2a3bd7747b78f798dff13/docs/MUSIC-FUNDAMENTALS.md), [provider register](https://github.com/frankxai/agentic-music-producer-os/blob/18dc9bee02001befb3a2a3bd7747b78f798dff13/docs/PROVIDER-CAPABILITIES.md) and [factory contract](https://github.com/frankxai/agentic-music-producer-os/blob/18dc9bee02001befb3a2a3bd7747b78f798dff13/docs/MUSIC-FACTORY-CONTRACT.md) separate creative work, authenticated execution, durable jobs, audio evidence and release. These references do not install a provider account or deploy a workflow.
