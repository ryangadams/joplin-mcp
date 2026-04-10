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

export interface JoplinSearchResponse {
  items: JoplinNote[];
  has_more: boolean;
}

export interface JoplinFolderListResponse {
  items: JoplinFolder[];
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

  async search(query: string): Promise<JoplinNote[]> {
    const data = await this.request<JoplinSearchResponse>("/search", {
      query,
      fields: "id,title",
    });
    return data.items;
  }

  async listFolders(): Promise<JoplinFolder[]> {
    const data = await this.request<JoplinFolderListResponse>("/folders", {
      fields: "id,title",
    });
    return data.items;
  }

  async getFolder(id: string): Promise<JoplinFolder> {
    return this.request<JoplinFolder>(`/folders/${encodeURIComponent(id)}`, {
      fields: "id,title",
    });
  }

  async getNotesInFolder(folderId: string): Promise<JoplinNote[]> {
    const data = await this.request<JoplinSearchResponse>(
      `/folders/${encodeURIComponent(folderId)}/notes`,
      { fields: "id,title" }
    );
    return data.items;
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
}
