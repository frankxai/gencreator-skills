# GenCreator Content Engine

Develop a point of view from your own source. Compare creative directions, finish an original piece and deliver editable work.

Signature edition uses the host model for writing and judgment. Python 3.10+ checks source spans and exports a local archive. The workflow needs no new account, model API key or MCP server. Existing content creation, Growth Studio and search-authority skills remain available.

## Start

Ask: "Turn this owned source into a distinctive, editable edition." Bring the source, intended audience and reader's job. The workflow compares three treatments, recommends one, finishes the piece and requested adaptations, then preserves the source, decisions and drafts in a verified ZIP.

[Signature edition](skills/signature-edition/SKILL.md) includes exact commands and a worked example: a finished essay, social caption and written film treatment for fictional Cedar Studio. No film has been rendered.

## Install

For Claude Code:

~~~bash
claude plugin marketplace add frankxai/gencreator-skills
claude plugin install content-engine@gencreator-skills
~~~

For a local Codex candidate:

~~~bash
codex plugin marketplace add /absolute/path/to/gencreator-skills
codex plugin add content-engine@gencreator-native
~~~

Restart the client to load changed instructions. A local install does not publish an OpenAI directory listing. A Git main install includes this workflow only after its reviewed change lands.

## Optional connections

To continue in the existing web Studio, use the skill's prepare-web command. It writes a separate source-normalized edition, recalculates evidence offsets and clears confirmations. The original stays intact. The existing MCP import can then return a Studio project file; review and account synchronization remain separate.

The installed MCP configuration is empty. Choose only the providers required for your task from [the connector guide](CONNECTORS.md). The example configurations do not establish provider availability or compatibility.

## Verification

For research-backed writing, attach a [research dossier](skills/signature-edition/references/research-method.md). It connects exact passages in each draft to dated source snapshots, records contrary evidence and preserves the decision and next test. The export includes editable research and a linked reader's guide. Changing a draft invalidates its research binding. A later verification checks freshness again while preserving the archive's original review date.

The checker performs no network calls and never executes source text. Source labels and editorial assessments remain supplied judgments. A mechanically clean dossier is ready for editorial review; it does not establish truth, complete coverage or permission to publish.

Run the signature-edition unittest suite and the archive verify command. Tests cover exact source spans, revision bindings, unchanged exports, preservation of existing outputs and archive integrity. They do not judge factual entailment, taste, human identity or commercial performance.

The existing GenCreator account icon is reused as a transitional asset. Independent creative review, real creator acceptance and directory submission remain release steps.
