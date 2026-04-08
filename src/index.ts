import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JoplinClient } from "./joplin.js";

const token = process.env.JOPLIN_TOKEN;
if (!token) {
  console.error("Error: JOPLIN_TOKEN environment variable is required.");
  console.error(
    "Find your token in Joplin: Tools > Options > Web Clipper > Advanced Options"
  );
  process.exit(1);
}

const defaultNotebookId = process.env.JOPLIN_DEFAULT_NOTEBOOK_ID;
if (!defaultNotebookId) {
  console.error("Error: JOPLIN_DEFAULT_NOTEBOOK_ID environment variable is required.");
  console.error(
    "Set this to the ID of the notebook where new notes should be created."
  );
  process.exit(1);
}

const port = process.env.JOPLIN_PORT
  ? parseInt(process.env.JOPLIN_PORT, 10)
  : 41184;

const client = new JoplinClient(token, port);

const server = new McpServer({
  name: "joplin-connector",
  version: "0.1.0",
});

server.tool(
  "search_notes",
  "Search Joplin notes by keywords. Returns matching note IDs and titles. Use this when the user asks if they have notes about a topic, or wants to find something they wrote down.",
  {
    query: z
      .string()
      .describe(
        "Search query. Supports Joplin search syntax: plain keywords, quoted phrases, tag:name, notebook:name, title:word, -exclusion"
      ),
  },
  async ({ query }) => {
    try {
      const notes = await client.search(query);

      if (notes.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No notes found matching "${query}".`,
            },
          ],
        };
      }

      const list = notes
        .map((note, i) => `${i + 1}. [${note.id}] ${note.title}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${notes.length} note${notes.length === 1 ? "" : "s"} matching "${query}":\n\n${list}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to search Joplin: ${message}\n\nMake sure Joplin is running with the Web Clipper service enabled (Tools > Options > Web Clipper).`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_note",
  "Fetch the full content of a Joplin note by its ID. Returns the note title and body (Markdown). Use after search_notes to read the actual note.",
  {
    id: z.string().describe("The note ID returned by search_notes"),
  },
  async ({ id }) => {
    try {
      const note = await client.getNote(id);
      const folder = await client.getFolder(note.parent_id);

      const meta: string[] = [`Notebook: ${folder.title}`];
      if (note.source_url) meta.push(`Source: ${note.source_url}`);

      return {
        content: [
          {
            type: "text",
            text: `# ${note.title}\n\n${meta.join("\n")}\n\n${note.body}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get note: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "list_notebooks",
  "List all notebooks (folders) in Joplin. Returns notebook IDs and titles. Use this to explore the user's notebook structure or find a notebook by name.",
  {},
  async () => {
    try {
      const folders = await client.listFolders();

      if (folders.length === 0) {
        return {
          content: [{ type: "text", text: "No notebooks found in Joplin." }],
        };
      }

      const list = folders
        .map((f, i) => `${i + 1}. [${f.id}] ${f.title}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${folders.length} notebook${folders.length === 1 ? "" : "s"}:\n\n${list}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to list notebooks: ${message}\n\nMake sure Joplin is running with the Web Clipper service enabled (Tools > Options > Web Clipper).`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_notes_in_notebook",
  "List all notes inside a specific Joplin notebook by its ID. Use list_notebooks first to find a notebook ID, then call this to see what notes it contains.",
  {
    id: z.string().describe("The notebook (folder) ID from list_notebooks"),
  },
  async ({ id }) => {
    try {
      const notes = await client.getNotesInFolder(id);

      if (notes.length === 0) {
        return {
          content: [{ type: "text", text: "No notes found in this notebook." }],
        };
      }

      const list = notes
        .map((note, i) => `${i + 1}. [${note.id}] ${note.title}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${notes.length} note${notes.length === 1 ? "" : "s"} in notebook:\n\n${list}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to get notes in notebook: ${message}\n\nMake sure Joplin is running with the Web Clipper service enabled (Tools > Options > Web Clipper).`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.tool(
  "create_note",
  "Create a new note in Joplin. Use this when the user asks to save something to Joplin, write a note, or make a note of something. The note will be saved to the configured default notebook.",
  {
    title: z.string().describe("The title of the note"),
    body: z.string().describe("The note content in Markdown"),
  },
  async ({ title, body }) => {
    try {
      const note = await client.createNote(title, body, defaultNotebookId);
      const folder = await client.getFolder(note.parent_id);

      return {
        content: [
          {
            type: "text",
            text: `Note created successfully.\n\nTitle: ${note.title}\nNotebook: ${folder.title}\nID: ${note.id}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create note: ${message}\n\nMake sure Joplin is running with the Web Clipper service enabled (Tools > Options > Web Clipper).`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
