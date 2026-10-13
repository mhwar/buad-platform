/** Shape of a v1 snapshot file (rows exactly as the SQL in v1-export.sql returns them). */
export interface V1Snapshot {
  users?: V1User[];
  orgs?: V1Org[];
  org_members?: V1Member[];
  /** The `workspace.data` JSON of row id='main', either as a string or already parsed. */
  workspace?: string | Record<string, unknown> | null;
}

export interface V1User {
  id: string;
  name?: string | null;
  email?: string | null;
  password_hash?: string | null;
  role?: string | null;
  must_change_pass?: number | boolean | null;
  created_at?: number | null;
}

export interface V1Org {
  id: string;
  name?: string | null;
  email?: string | null;
  password_hash?: string | null;
  contact_name?: string | null;
  created_at?: number | null;
}

export interface V1Member {
  id: string;
  org_id: string;
  name?: string | null;
  email?: string | null;
  password_hash?: string | null;
  role?: string | null;
  created_at?: number | null;
}
