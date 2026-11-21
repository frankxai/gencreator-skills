# Project-local installer evidence

The sample covers the standalone video engine inside the video-social-studio plugin. It does not activate the MCP server. Other video skills may require video-engine to be installed alongside them.

[Local profile](install-profile.json) · [Measured receipt](install-baseline.json) · [Shared standard and checker](https://github.com/frankxai/skills/tree/2f1bf24d7b8e7040b49dad41c4511fdfb8b0ea35/quality/v1)

From this repository root, use a disposable checkout of the shared checker. Python 3.12+, Git and Node are required. The receipt verifier also needs Python jsonschema.

```sh
tools_dir=$(mktemp -d) \
  && git clone --quiet https://github.com/frankxai/skills.git "$tools_dir/standard" \
  && git -C "$tools_dir/standard" checkout --quiet 2f1bf24d7b8e7040b49dad41c4511fdfb8b0ea35 \
  && npm install --prefix "$tools_dir/cli" --ignore-scripts --no-audit --no-fund skills@1.9.0 \
  && python "$tools_dir/standard/quality/v1/check_install.py" --repo . --profile quality/install-profile.json \
       --cli "$tools_dir/cli/node_modules/.bin/skills" --output "$tools_dir/result.json" \
  && python "$tools_dir/standard/quality/v1/verify_receipt.py" --revision "$(git rev-parse HEAD)" \
       --profile quality/install-profile.json "$tools_dir/result.json"
```

Every step is chained with `&&`, so a failed pinned checkout stops the run instead of executing the checker from the default branch. The checker uses a fresh project and profile per cell. A successful package copy, a scoped removal and a native runtime invocation have separate evidence. A nonzero result preserves the failure in the JSON report.
