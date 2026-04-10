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
if (Number.isNaN(port)) {
  console.error("Error: JOPLIN_PORT must be a valid number.");
  process.exit(1);
}

const client = new JoplinClient(token, port);

const server = new McpServer({
  name: "joplin-connector",
  version: "0.1.0",
});

server.registerTool(
  "search_notes",
  {
    description: "Search Joplin notes by keywords. Returns matching note IDs and titles. Use this when the user asks if they have notes about a topic, or wants to find something they wrote down.",
    inputSchema: {
      query: z
        .string()
        .describe(
          "Search query. Supports Joplin search syntax: plain keywords, quoted phrases, tag:name, notebook:name, title:word, -exclusion"
        ),
    },
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

server.registerTool(
  "get_note",
  {
    description: "Fetch the full content of a Joplin note by its ID. Returns the note title, notebook, and Markdown body. Use after search_notes to read the actual note.",
    inputSchema: {
      id: z.string().describe("The note ID returned by search_notes"),
    },
  },
  async ({ id }) => {
    try {
      const note = await client.getNote(id);

      let notebookName: string;
      try {
        const folder = await client.getFolder(note.parent_id);
        notebookName = folder.title;
      } catch {
        notebookName = note.parent_id;
      }

      const meta: string[] = [`Notebook: ${notebookName}`];
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

server.registerTool(
  "list_notebooks",
  {
    description: "List all notebooks (folders) in Joplin. Returns notebook IDs and titles. Use this to explore the user's notebook structure or find a notebook by name.",
  },
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

server.registerTool(
  "get_notes_in_notebook",
  {
    description: "List all notes inside a specific Joplin notebook by its ID. Use list_notebooks first to find a notebook ID, then call this to see what notes it contains.",
    inputSchema: {
      id: z.string().describe("The notebook (folder) ID from list_notebooks"),
    },
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

server.registerTool(
  "create_note",
  {
    description: "Create a new note in Joplin. Use this when the user asks to save something to Joplin, write a note, or make a note of something. The note will be saved to the configured default notebook.",
    inputSchema: {
      title: z.string().describe("The title of the note"),
      body: z.string().describe("The note content in Markdown"),
    },
  },
  async ({ title, body }) => {
    try {
      const note = await client.createNote(title, body, defaultNotebookId);

      let notebookName: string;
      try {
        const folder = await client.getFolder(note.parent_id);
        notebookName = folder.title;
      } catch {
        notebookName = note.parent_id;
      }

      return {
        content: [
          {
            type: "text",
            text: `Note created successfully.\n\nTitle: ${note.title}\nNotebook: ${notebookName}\nID: ${note.id}`,
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

server.registerTool(
  "get_all_tags",
  {
    description: "List all tags in Joplin. Returns tag IDs and titles. Use this to see what tags exist or find a tag by name.",
  },
  async () => {
    try {
      const tags = await client.getAllTags();

      if (tags.length === 0) {
        return {
          content: [{ type: "text", text: "No tags found in Joplin." }],
        };
      }

      const list = tags
        .map((t, i) => `${i + 1}. [${t.id}] ${t.title}`)
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${tags.length} tag${tags.length === 1 ? "" : "s"}:\n\n${list}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to list tags: ${message}\n\nMake sure Joplin is running with the Web Clipper service enabled (Tools > Options > Web Clipper).`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "search_notes_by_tag",
  {
    description: "Find all notes that have a specific tag. Searches by tag title (case-insensitive). Use this when the user wants to find notes with a particular tag.",
    inputSchema: {
      tag: z.string().describe("The tag title to search for (case-insensitive)"),
    },
  },
  async ({ tag }) => {
    try {
      const tags = await client.getAllTags();
      const normalised = tag.toLowerCase();
      const match = tags.find((t) => t.title.toLowerCase() === normalised);

      if (!match) {
        return {
          content: [
            {
              type: "text",
              text: `No tag found matching "${tag}".`,
            },
          ],
        };
      }

      const notes = await client.getNotesForTag(match.id);

      if (notes.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `Tag "${match.title}" exists but has no notes.`,
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
            text: `Found ${notes.length} note${notes.length === 1 ? "" : "s"} with tag "${match.title}":\n\n${list}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to search notes by tag: ${message}\n\nMake sure Joplin is running with the Web Clipper service enabled (Tools > Options > Web Clipper).`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "create_tag",
  {
    description: "Create a new tag in Joplin. Use this when the user wants to create a tag for organizing notes.",
    inputSchema: {
      title: z.string().describe("The tag title to create"),
    },
  },
  async ({ title }) => {
    try {
      const tag = await client.createTag(title);

      return {
        content: [
          {
            type: "text",
            text: `Tag created successfully.\n\nTitle: ${tag.title}\nID: ${tag.id}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to create tag: ${message}\n\nMake sure Joplin is running with the Web Clipper service enabled (Tools > Options > Web Clipper).`,
          },
        ],
        isError: true,
      };
    }
  }
);

server.registerTool(
  "tag_note",
  {
    description: "Add a tag to a note. Creates the tag if it doesn't already exist. Use this when the user wants to tag a note or organize notes with tags.",
    inputSchema: {
      noteId: z.string().describe("The note ID to tag"),
      tag: z.string().describe("The tag title (case-insensitive). Will be created if it doesn't exist."),
    },
  },
  async ({ noteId, tag }) => {
    try {
      const joplinTag = await client.getOrCreateTag(tag);
      await client.addNoteToTag(joplinTag.id, noteId);

      return {
        content: [
          {
            type: "text",
            text: `Note tagged successfully.\n\nTag: ${joplinTag.title}\nTag ID: ${joplinTag.id}\nNote ID: ${noteId}`,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Failed to tag note: ${message}\n\nMake sure Joplin is running with the Web Clipper service enabled (Tools > Options > Web Clipper).`,
          },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
