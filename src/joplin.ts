export interface JoplinNote {
  id: string;
  title: string;
}

export interface JoplinNoteDetail extends JoplinNote {
  body: string;
  source_url: string;
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

    const response = await fetch(url.toString(), options);

    if (!response.ok) {
      throw new Error(
        `Joplin API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  private async fetchAllPages<T>(
    path: string,
    params: Record<string, string> = {}
  ): Promise<T[]> {
    const items: T[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const data = await this.request<PaginatedResponse<T>>(path, {
        ...params,
        page: String(page),
      });
      items.push(...data.items);
      hasMore = data.has_more;
      page++;
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

  async getNote(id: string): Promise<JoplinNoteDetail> {
    return this.request<JoplinNoteDetail>(`/notes/${encodeURIComponent(id)}`, {
      fields: "id,title,body,source_url,parent_id,updated_time,created_time",
    });
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

  async getOrCreateTag(title: string): Promise<JoplinTag> {
    const tags = await this.getAllTags();
    const normalised = title.toLowerCase();
    const existing = tags.find((t) => t.title.toLowerCase() === normalised);
    if (existing) return existing;
    return this.createTag(title);
  }
}
