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

  async search(query: string): Promise<JoplinNote[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set("query", query);
    url.searchParams.set("fields", "id,title");
    url.searchParams.set("token", this.token);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Joplin API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as JoplinSearchResponse;
    return data.items;
  }

  async listFolders(): Promise<JoplinFolder[]> {
    const url = new URL(`${this.baseUrl}/folders`);
    url.searchParams.set("fields", "id,title");
    url.searchParams.set("token", this.token);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Joplin API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as JoplinFolderListResponse;
    return data.items;
  }

  async getFolder(id: string): Promise<JoplinFolder> {
    const url = new URL(`${this.baseUrl}/folders/${id}`);
    url.searchParams.set("fields", "id,title");
    url.searchParams.set("token", this.token);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Joplin API error: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as JoplinFolder;
  }

  async getNotesInFolder(folderId: string): Promise<JoplinNote[]> {
    const url = new URL(`${this.baseUrl}/folders/${folderId}/notes`);
    url.searchParams.set("fields", "id,title");
    url.searchParams.set("token", this.token);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Joplin API error: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as JoplinSearchResponse;
    return data.items;
  }

  async createNote(title: string, body: string, parentId: string): Promise<JoplinCreatedNote> {
    const url = new URL(`${this.baseUrl}/notes`);
    url.searchParams.set("token", this.token);

    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, parent_id: parentId }),
    });

    if (!response.ok) {
      throw new Error(
        `Joplin API error: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as JoplinCreatedNote;
  }

  async getNote(id: string): Promise<JoplinNoteDetail> {
    const url = new URL(`${this.baseUrl}/notes/${id}`);
    url.searchParams.set("fields", "id,title,body,source_url,parent_id,updated_time,created_time");
    url.searchParams.set("token", this.token);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Joplin API error: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as JoplinNoteDetail;
  }
}
