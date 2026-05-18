# Joplin Claude Connector

An MCP server that gives Claude access to your [Joplin](https://joplinapp.org/) notes.

## Tools

| Tool | Description |
|------|-------------|
| `search_notes` | Search notes by keywords. Returns matching note IDs and titles. |
| `get_note` | Fetch the full content of a note by its ID. Returns title, notebook, tags, and Markdown body. |
| `list_notebooks` | List all notebooks (folders). Returns notebook IDs and titles. |
| `get_notes_in_notebook` | List all notes inside a specific notebook by its ID. |
| `create_note` | Create a new note in the configured default notebook. |
| `get_all_tags` | List all tags. Returns tag IDs and titles. |
| `search_notes_by_tag` | Find all notes that have a specific tag (case-insensitive). |
| `create_tag` | Create a new tag. |
| `tag_note` | Add a tag to a note. Creates the tag if it doesn't already exist. |

## Setup

### 1. Enable Joplin Web Clipper

In Joplin desktop: **Tools > Options > Web Clipper**

- Enable the clipper service
- Copy your **API token** from the Advanced Options section

### 2. Install & build

```sh
npm install
npm run build
```

### 3. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "joplin": {
      "command": "node",
      "args": ["/Users/ryan/Projects/personal/joplin-claude-connector/dist/index.js"],
      "env": {
        "JOPLIN_TOKEN": "your_token_here",
        "JOPLIN_DEFAULT_NOTEBOOK_ID": "your_notebook_id_here"
      }
    }
  }
}
```

Restart Claude Desktop. Joplin must be running for the connector to work.

## Usage

Just ask naturally:

- "Do I have a note about that?"
- "Search my notes for sourdough"
- "Find notes tagged #recipe"
- "Save a note about today's meeting"
- "Tag that note with #project"
- "What notebooks do I have?"

Claude will use the appropriate tools automatically.

## Search syntax

The `query` parameter supports full [Joplin search syntax](https://joplinapp.org/help/apps/search/):

| Syntax | Example | Effect |
|--------|---------|--------|
| Keywords | `sourdough bread` | Notes containing both words |
| Phrase | `"shopping list"` | Exact phrase match |
| Prefix wildcard | `swim*` | swimming, swimsuit, etc. |
| Tag filter | `tag:recipe` | Notes with that tag |
| Notebook filter | `notebook:work` | Notes in that notebook |
| Title search | `title:meeting` | Word appears in title |
| Exclusion | `bread -sourdough` | Contains bread, not sourdough |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JOPLIN_TOKEN` | _(required)_ | API token from Joplin Web Clipper settings |
| `JOPLIN_DEFAULT_NOTEBOOK_ID` | _(required)_ | ID of the notebook where new notes are created |
| `JOPLIN_PORT` | `41184` | Port the Joplin API is running on |
