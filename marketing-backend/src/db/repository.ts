import { v4 as uuidv4 } from 'uuid';
import { getDb } from './database';
import {
  ContentItem,
  AuditLog,
  LinkedInAccount,
  WorkflowState,
  ContentMetadata,
  QAEntry,
} from '../types';

// ─── Row shapes from SQLite ───────────────────────────────────────────────────

interface ContentItemRow {
  id: string;
  topic: string;
  state: string;
  economist_brief: string | null;
  marketing_draft: string | null;
  vp_review: string | null;
  approval: string | null;
  metadata: string;
  publish_result: string | null;
  revision_history: string;
  qa_history: string;
  created_at: string;
  updated_at: string;
}

interface AuditLogRow {
  id: string;
  content_id: string;
  action: string;
  actor: string;
  previous_state: string | null;
  new_state: string | null;
  details: string;
  created_at: string;
}

interface LinkedInAccountRow {
  id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  organization_id: string;
  created_at: string;
}

interface ProfileCacheRow {
  id: string;
  data: string;
  updated_at: string;
}

// ─── Deserializer ─────────────────────────────────────────────────────────────

function deserializeContentItem(row: ContentItemRow): ContentItem {
  return {
    id: row.id,
    topic: row.topic,
    state: row.state as WorkflowState,
    economist_brief: row.economist_brief ? JSON.parse(row.economist_brief) : null,
    marketing_draft: row.marketing_draft ? JSON.parse(row.marketing_draft) : null,
    vp_review: row.vp_review ? JSON.parse(row.vp_review) : null,
    approval: row.approval ? JSON.parse(row.approval) : null,
    metadata: JSON.parse(row.metadata) as ContentMetadata,
    publish_result: row.publish_result ? JSON.parse(row.publish_result) : null,
    revision_history: JSON.parse(row.revision_history),
    qa_history: JSON.parse(row.qa_history || '[]'),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function deserializeAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    content_id: row.content_id,
    action: row.action,
    actor: row.actor,
    previous_state: (row.previous_state as WorkflowState) || null,
    new_state: (row.new_state as WorkflowState) || null,
    details: JSON.parse(row.details),
    created_at: row.created_at,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class ContentRepository {
  // ── Content CRUD ────────────────────────────────────────────────────────────

  create(topic: string): ContentItem {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const initialMetadata: ContentMetadata = { revision_count: 0 };

    const stmt = db.prepare(`
      INSERT INTO content_items (id, topic, state, metadata, revision_history, created_at, updated_at)
      VALUES (?, ?, 'IDEA_IDENTIFIED', ?, '[]', ?, ?)
    `);

    stmt.run(id, topic, JSON.stringify(initialMetadata), now, now);

    const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id) as ContentItemRow;
    return deserializeContentItem(row);
  }

  findById(id: string): ContentItem | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id) as
      | ContentItemRow
      | undefined;
    return row ? deserializeContentItem(row) : null;
  }

  findAll(): ContentItem[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM content_items ORDER BY created_at DESC')
      .all() as ContentItemRow[];
    return rows.map(deserializeContentItem);
  }

  update(id: string, patch: Partial<ContentItem>): ContentItem {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`ContentItem with id ${id} not found`);
    }

    const now = new Date().toISOString();

    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [now];

    if (patch.state !== undefined) {
      setClauses.push('state = ?');
      values.push(patch.state);
    }
    if (patch.economist_brief !== undefined) {
      setClauses.push('economist_brief = ?');
      values.push(patch.economist_brief ? JSON.stringify(patch.economist_brief) : null);
    }
    if (patch.marketing_draft !== undefined) {
      setClauses.push('marketing_draft = ?');
      values.push(patch.marketing_draft ? JSON.stringify(patch.marketing_draft) : null);
    }
    if (patch.vp_review !== undefined) {
      setClauses.push('vp_review = ?');
      values.push(patch.vp_review ? JSON.stringify(patch.vp_review) : null);
    }
    if (patch.approval !== undefined) {
      setClauses.push('approval = ?');
      values.push(patch.approval ? JSON.stringify(patch.approval) : null);
    }
    if (patch.metadata !== undefined) {
      setClauses.push('metadata = ?');
      values.push(JSON.stringify(patch.metadata));
    }
    if (patch.publish_result !== undefined) {
      setClauses.push('publish_result = ?');
      values.push(patch.publish_result ? JSON.stringify(patch.publish_result) : null);
    }
    if (patch.revision_history !== undefined) {
      setClauses.push('revision_history = ?');
      values.push(JSON.stringify(patch.revision_history));
    }
    if (patch.qa_history !== undefined) {
      setClauses.push('qa_history = ?');
      values.push(JSON.stringify(patch.qa_history));
    }

    values.push(id);

    db.prepare(`UPDATE content_items SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    const updated = this.findById(id);
    if (!updated) throw new Error(`Failed to retrieve updated ContentItem ${id}`);
    return updated;
  }

  // ── Economist Q&A ────────────────────────────────────────────────────────────

  appendQAEntry(id: string, entry: QAEntry): ContentItem {
    const item = this.findById(id);
    if (!item) throw new Error(`ContentItem ${id} not found`);
    return this.update(id, { qa_history: [...item.qa_history, entry] });
  }

  // ── Audit Logs ───────────────────────────────────────────────────────────────

  addAuditEntry(entry: Omit<AuditLog, 'id' | 'created_at'>): void {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO audit_logs (id, content_id, action, actor, previous_state, new_state, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entry.content_id,
      entry.action,
      entry.actor,
      entry.previous_state || null,
      entry.new_state || null,
      JSON.stringify(entry.details || {}),
      now,
    );
  }

  getHistory(contentId: string): AuditLog[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM audit_logs WHERE content_id = ? ORDER BY created_at ASC')
      .all(contentId) as AuditLogRow[];
    return rows.map(deserializeAuditLog);
  }

  // ── LinkedIn Token ────────────────────────────────────────────────────────────

  saveLinkedInToken(token: LinkedInAccount): void {
    const db = getDb();
    // We only ever store one token (the latest connection)
    db.prepare('DELETE FROM linkedin_accounts').run();
    db.prepare(`
      INSERT INTO linkedin_accounts (id, access_token, refresh_token, expires_at, organization_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      token.id,
      token.access_token,
      token.refresh_token,
      token.expires_at,
      token.organization_id,
      token.created_at,
    );
  }

  getLinkedInToken(): LinkedInAccount | null {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM linkedin_accounts ORDER BY created_at DESC LIMIT 1')
      .get() as LinkedInAccountRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expires_at: row.expires_at,
      organization_id: row.organization_id,
      created_at: row.created_at,
    };
  }

  // ── LinkedIn Profile Cache ────────────────────────────────────────────────────

  cacheLinkedInProfile(data: unknown): void {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('DELETE FROM linkedin_profile_cache').run();
    db.prepare(
      'INSERT INTO linkedin_profile_cache (id, data, updated_at) VALUES (?, ?, ?)',
    ).run('profile', JSON.stringify(data), now);
  }

  getCachedLinkedInProfile(): unknown {
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM linkedin_profile_cache WHERE id = ?')
      .get('profile') as ProfileCacheRow | undefined;
    return row ? JSON.parse(row.data) : null;
  }
}

// Singleton export
export const contentRepository = new ContentRepository();
