# Publish the plugin in a public GitHub repo

**Done 22 Oct 2026:** https://github.com/black12-ag/viral4all-ads (public, `main`), working copy at `~/code/viral4all-ads`. Both `/plugin marketplace add black12-ag/viral4all-ads` and the hosted marketplace URL install the plugin with 5 skills and the connector (tested in a throwaway config). For updates, use "Release a new version" below.

Anthropic's directory reads plugins from a public GitHub repo, and this repo is private and holds the whole app. The steps below build a separate public repo that holds only this marketplace and its one plugin, so both of these work:

- the directory submission (plugin path `plugins/viral4all-ads`);
- `/plugin marketplace add <owner>/<repo>` in Claude Code.

Nothing here runs by itself. Run the commands from the root of this repo, as the owner, after `gh auth login`.

The public repo will contain:

```text
.claude-plugin/marketplace.json   the "viral4all" marketplace, source ./plugins/viral4all-ads
plugins/viral4all-ads/            the plugin: manifest, .mcp.json, skills, README, LICENSE, icon
README.md, LICENSE                copies of the plugin's, for the GitHub page
.gitignore                        .DS_Store
```

## First publish

1. Check the plugin. Both must print `✔ Validation passed`:

   ```bash
   claude plugin validate --strict integrations/claude-plugin
   claude plugin validate --strict integrations/claude-plugin/plugins/viral4all-ads
   ```

2. Pick the owner and name. The plugin's `repository` field already says `https://github.com/black12-ag/viral4all-ads`. If you use another owner or name (for example a `viral4all` organization), change `repository` in `plugins/viral4all-ads/.claude-plugin/plugin.json` first, then run step 1 again.

   ```bash
   OWNER=black12-ag
   REPO=viral4all-ads
   DEST="$HOME/code/$REPO"
   ```

3. Copy only the marketplace and the plugin:

   ```bash
   mkdir -p "$DEST"
   rsync -a --exclude .DS_Store --exclude PUBLISH.md integrations/claude-plugin/ "$DEST/"
   cp integrations/claude-plugin/plugins/viral4all-ads/{README.md,LICENSE} "$DEST/"
   printf '.DS_Store\n' > "$DEST/.gitignore"
   ```

4. Check the copy. The file list must match the tree above, with nothing else:

   ```bash
   claude plugin validate --strict "$DEST"
   claude plugin validate --strict "$DEST/plugins/viral4all-ads"
   (cd "$DEST" && find . -type f -not -path './.git/*' | sort)
   ```

5. Create the public repo and push:

   ```bash
   cd "$DEST"
   git init -b main
   git add -A
   git commit -m "Viral4All Ads plugin 1.0.1"
   gh repo create "$OWNER/$REPO" --public --source . --remote origin --push \
     --description "Viral4All Ads for Claude: Meta ads reports and changes, with owner approval" \
     --homepage https://ads.viral4all.com
   ```

6. Install it the way a user would, in Claude Code. This marketplace has the same name, `viral4all`, as the one at `https://ads.viral4all.com/claude/marketplace.json`, so remove that one first if you added it (`/plugin marketplace remove viral4all`).

   ```text
   /plugin marketplace add black12-ag/viral4all-ads
   /plugin install viral4all-ads@viral4all
   ```

7. Submit it in the developer portal with repository `$OWNER/$REPO`, plugin path `plugins/viral4all-ads` and branch `main`. The answers are in `../directory-submissions/claude-plugin.md`.

## Release a new version

1. Change the plugin here, bump `version` in its `plugin.json`, and run step 1 and `node scripts/build-integrations.mjs`.
2. Mirror it into the public repo and push. `--delete` drops files you removed here.

   ```bash
   rsync -a --delete --exclude .DS_Store integrations/claude-plugin/plugins/ "$DEST/plugins/"
   cp integrations/claude-plugin/.claude-plugin/marketplace.json "$DEST/.claude-plugin/"
   cp integrations/claude-plugin/plugins/viral4all-ads/{README.md,LICENSE} "$DEST/"
   cd "$DEST" && git add -A && git commit -m "Viral4All Ads plugin <version>" && git push
   ```

The directory picks up the commit through its push webhook, or on its schedule, then scans and publishes it.
