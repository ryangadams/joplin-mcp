export interface JoplinNote {
  id: string;
  title: string;
}

export interface JoplinNoteDetail extends JoplinNote {
  body: string;
  source_url: string | null;
  parent_id: string;
  updated_time: number;
  created_time: number;
}

export interface JoplinFolder {
  id: string;
  title: string;
}

export interface JoplinCreatedNote {
  id: string;
  title: string;
  parent_id: string;
}

export interface JoplinTag {
  id: string;
  title: string;
}

interface PaginatedResponse<T> {
  items: T[];
  has_more: boolean;
}

/** Joplin IDs are 32 lowercase hex characters. */
const JOPLIN_ID_PATTERN = /^[0-9a-f]{32}$/i;

export class JoplinApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "JoplinApiError";
  }
}

/** Joplin puts a human-readable reason in the response body; surface it if present. */
async function describeErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      const reason = parsed.error ?? parsed.message;
      return reason ? ` - ${reason}` : "";
    } catch {
      return ` - ${text.slice(0, 200)}`;
    }
  } catch {
    return "";
  }
}

export class JoplinClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(token: string, port = 41184) {
    this.baseUrl = `http://localhost:${port}`;
    this.token = token;
  }

  private async request<T>(
    path: string,
    params: Record<string, string> = {},
    options: RequestInit = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("token", this.token);

    const response = await fetch(url.toString(), {
      ...options,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new JoplinApiError(
        `Joplin API error: ${response.status} ${response.statusText}${await describeErrorBody(response)}`,
        response.status
      );
    }

    return response.json() as Promise<T>;
  }

  private async fetchAllPages<T>(
    path: string,
    params: Record<string, string> = {}
  ): Promise<T[]> {
    const MAX_PAGES = 100;
    const items: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= MAX_PAGES) {
      const data = await this.request<PaginatedResponse<T>>(path, {
        ...params,
        page: String(page),
      });
      items.push(...data.items);
      hasMore = data.has_more;
      page++;
    }

    if (hasMore) {
      throw new Error(
        `Pagination exceeded ${MAX_PAGES} pages for ${path}`
      );
    }

    return items;
  }

  async search(query: string): Promise<JoplinNote[]> {
    return this.fetchAllPages<JoplinNote>("/search", {
      query,
      fields: "id,title",
    });
  }

  async listFolders(): Promise<JoplinFolder[]> {
    return this.fetchAllPages<JoplinFolder>("/folders", {
      fields: "id,title",
    });
  }

  async getFolder(id: string): Promise<JoplinFolder> {
    return this.request<JoplinFolder>(`/folders/${encodeURIComponent(id)}`, {
      fields: "id,title",
    });
  }

  async getNotesInFolder(folderId: string): Promise<JoplinNote[]> {
    return this.fetchAllPages<JoplinNote>(
      `/folders/${encodeURIComponent(folderId)}/notes`,
      { fields: "id,title" }
    );
  }

  async createNote(title: string, body: string, parentId: string): Promise<JoplinCreatedNote> {
    return this.request<JoplinCreatedNote>("/notes", {}, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, parent_id: parentId }),
    });
  }

  async getNote(id: string): Promise<JoplinNoteDetail & { tags: JoplinTag[] }> {
    const [note, tags] = await Promise.all([
      this.request<JoplinNoteDetail>(`/notes/${encodeURIComponent(id)}`, {
        fields: "id,title,body,source_url,parent_id,updated_time,created_time",
      }),
      this.getNoteTags(id),
    ]);
    return { ...note, tags };
  }

  /**
   * Cheap existence check: `/notes/{id}/tags` returns an empty list for an
   * unknown note, but `/notes/{id}` 404s, so use that to validate a note ID.
   */
  async getNoteSummary(id: string): Promise<JoplinNote> {
    return this.request<JoplinNote>(`/notes/${encodeURIComponent(id)}`, {
      fields: "id,title",
    });
  }

  async getNoteTags(noteId: string): Promise<JoplinTag[]> {
    return this.fetchAllPages<JoplinTag>(
      `/notes/${encodeURIComponent(noteId)}/tags`,
      { fields: "id,title" }
    );
  }

  async getAllTags(): Promise<JoplinTag[]> {
    return this.fetchAllPages<JoplinTag>("/tags", {
      fields: "id,title",
    });
  }

  async getNotesForTag(tagId: string): Promise<JoplinNote[]> {
    return this.fetchAllPages<JoplinNote>(
      `/tags/${encodeURIComponent(tagId)}/notes`,
      { fields: "id,title" }
    );
  }

  async createTag(title: string): Promise<JoplinTag> {
    if (JOPLIN_ID_PATTERN.test(title.trim())) {
      throw new Error(
        `Refusing to create the tag "${title.trim()}": it looks like a Joplin ID rather than a tag title.`
      );
    }
    return this.request<JoplinTag>("/tags", {}, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  }

  async addNoteToTag(tagId: string, noteId: string): Promise<void> {
    await this.request(`/tags/${encodeURIComponent(tagId)}/notes`, {}, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: noteId }),
    });
  }

  /**
   * Resolve a tag by title (case-insensitive). Callers sometimes pass a tag ID
   * where a title is expected, so an ID-shaped input is looked up by ID first —
   * otherwise it would be treated as a brand new title and create a tag named
   * after another tag's ID.
   */
  async findTag(titleOrId: string): Promise<JoplinTag | undefined> {
    const tags = await this.getAllTags();
    const normalised = titleOrId.trim().toLowerCase();

    if (JOPLIN_ID_PATTERN.test(normalised)) {
      return tags.find((t) => t.id.toLowerCase() === normalised);
    }

    return tags.find((t) => t.title.toLowerCase() === normalised);
  }

  async getOrCreateTag(titleOrId: string): Promise<JoplinTag> {
    const title = titleOrId.trim();
    const existing = await this.findTag(title);
    if (existing) return existing;

    if (JOPLIN_ID_PATTERN.test(title)) {
      throw new Error(
        `"${title}" looks like a Joplin ID, not a tag title, and no tag has that ID. ` +
          `Pass the tag's title (e.g. "reference") instead.`
      );
    }

    return this.createTag(title);
  }
}
