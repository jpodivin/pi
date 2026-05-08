# Running pi in a Container

All commands use `podman` but work identically with `docker`.

## Building

From the **repository root**:

```bash
podman build -f packages/coding-agent/Containerfile -t pi-agent .
```

## Running

### Interactive TUI

```bash
podman run -it --rm \
  -v "$(pwd)":/home/node/workspace:Z \
  -e ANTHROPIC_API_KEY \
  pi-agent
```

The `:Z` suffix is required on SELinux-enabled systems (Fedora, RHEL). It relabels the bind mount so the container process can access it. On systems without SELinux, omit it.

### Print mode (non-interactive)

```bash
podman run --rm \
  -v "$(pwd)":/home/node/workspace:Z \
  -e ANTHROPIC_API_KEY \
  pi-agent -p "Explain this codebase"
```

### Pipe mode

```bash
echo "What does main.ts do?" | podman run -i --rm \
  -v "$(pwd)":/home/node/workspace:Z \
  -e ANTHROPIC_API_KEY \
  pi-agent
```

### Continue a previous session

Requires persistent config volume (see below):

```bash
podman run -it --rm \
  -v "$(pwd)":/home/node/workspace:Z \
  -v pi-config:/home/node/.pi:Z \
  -e ANTHROPIC_API_KEY \
  pi-agent --continue
```

## Persisting configuration and sessions

Without a volume for the global config directory (`/home/node/.pi` inside the container), settings, auth tokens, sessions, and installed extensions are lost when the container exits. This is separate from any project-level `.pi/` directory in the workspace.

```bash
podman run -it --rm \
  -v "$(pwd)":/home/node/workspace:Z \
  -v pi-config:/home/node/.pi:Z \
  -e ANTHROPIC_API_KEY \
  pi-agent
```

The named volume `pi-config` survives container restarts. Inspect it with `podman volume inspect pi-config`.

## Environment variables

Pass API keys for whichever LLM provider you use:

```bash
-e ANTHROPIC_API_KEY
-e OPENAI_API_KEY
-e GEMINI_API_KEY
-e MISTRAL_API_KEY
-e GROQ_API_KEY
-e XAI_API_KEY
-e OPENROUTER_API_KEY
```

Other useful variables:

| Variable | Effect |
|----------|--------|
| `PI_OFFLINE=1` | Disable all network operations (extensions, binary downloads) |
| `PI_CODING_AGENT_DIR` | Override the config directory (default: `~/.pi/agent/`) |
| `PI_CACHE_RETENTION=long` | Extended prompt cache retention |

## File ownership on bind mounts

With rootless Podman, files created inside the container may be owned by a different UID on the host. Use `--userns=keep-id` to map your host UID into the container:

```bash
podman run -it --rm \
  --userns=keep-id \
  -v "$(pwd)":/home/node/workspace:Z \
  -v pi-config:/home/node/.pi:Z \
  -e ANTHROPIC_API_KEY \
  pi-agent
```

## Shell alias

Add to `~/.bashrc` or `~/.zshrc` for convenience:

```bash
alias pi='podman run -it --rm --userns=keep-id -v "$(pwd)":/home/node/workspace:Z -v pi-config:/home/node/.pi:Z -e ANTHROPIC_API_KEY pi-agent'
```

Then use `pi` as if it were installed natively.

## Extensions

**Local extensions:** Mount the extension directory into the container:

```bash
podman run -it --rm \
  -v "$(pwd)":/home/node/workspace:Z \
  -v /path/to/my-extension:/extensions/my-extension:Z,ro \
  -e ANTHROPIC_API_KEY \
  pi-agent --extension /extensions/my-extension
```

**npm/git extensions:** Persist `~/.pi/` via volume so installed packages survive container restarts.

## What's included

The container ships with:

- Node.js 22 (LTS)
- bash, git, curl
- ripgrep (`rg`) and fd (`fd`) pre-installed
- All pi runtime assets (themes, templates, docs)
