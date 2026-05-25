"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.contentRepository = exports.ContentRepository = void 0;
const uuid_1 = require("uuid");
const database_1 = require("./database");
const crypto_1 = require("../utils/crypto");
// ─── Deserializer ─────────────────────────────────────────────────────────────
function deserializeContentItem(row) {
    return {
        id: row.id,
        topic: row.topic,
        state: row.state,
        economist_brief: row.economist_brief ? JSON.parse(row.economist_brief) : null,
        marketing_draft: row.marketing_draft ? JSON.parse(row.marketing_draft) : null,
        vp_review: row.vp_review ? JSON.parse(row.vp_review) : null,
        approval: row.approval ? JSON.parse(row.approval) : null,
        metadata: JSON.parse(row.metadata),
        publish_result: row.publish_result ? JSON.parse(row.publish_result) : null,
        revision_history: JSON.parse(row.revision_history),
        qa_history: JSON.parse(row.qa_history || '[]'),
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
function deserializeAuditLog(row) {
    return {
        id: row.id,
        content_id: row.content_id,
        action: row.action,
        actor: row.actor,
        previous_state: row.previous_state || null,
        new_state: row.new_state || null,
        details: JSON.parse(row.details),
        created_at: row.created_at,
    };
}
// ─── Repository ───────────────────────────────────────────────────────────────
class ContentRepository {
    // ── Content CRUD ────────────────────────────────────────────────────────────
    create(topic) {
        const db = (0, database_1.getDb)();
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        const initialMetadata = { revision_count: 0 };
        const stmt = db.prepare(`
      INSERT INTO content_items (id, topic, state, metadata, revision_history, created_at, updated_at)
      VALUES (?, ?, 'IDEA_IDENTIFIED', ?, '[]', ?, ?)
    `);
        stmt.run(id, topic, JSON.stringify(initialMetadata), now, now);
        const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id);
        return deserializeContentItem(row);
    }
    findById(id) {
        const db = (0, database_1.getDb)();
        const row = db.prepare('SELECT * FROM content_items WHERE id = ?').get(id);
        return row ? deserializeContentItem(row) : null;
    }
    findAll() {
        const db = (0, database_1.getDb)();
        const rows = db
            .prepare('SELECT * FROM content_items ORDER BY created_at DESC')
            .all();
        return rows.map(deserializeContentItem);
    }
    update(id, patch) {
        const db = (0, database_1.getDb)();
        const existing = this.findById(id);
        if (!existing) {
            throw new Error(`ContentItem with id ${id} not found`);
        }
        const now = new Date().toISOString();
        const setClauses = ['updated_at = ?'];
        const values = [now];
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
        if (!updated)
            throw new Error(`Failed to retrieve updated ContentItem ${id}`);
        return updated;
    }
    // ── Economist Q&A ────────────────────────────────────────────────────────────
    appendQAEntry(id, entry) {
        const item = this.findById(id);
        if (!item)
            throw new Error(`ContentItem ${id} not found`);
        return this.update(id, { qa_history: [...item.qa_history, entry] });
    }
    // ── Audit Logs ───────────────────────────────────────────────────────────────
    addAuditEntry(entry) {
        const db = (0, database_1.getDb)();
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO audit_logs (id, content_id, action, actor, previous_state, new_state, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, entry.content_id, entry.action, entry.actor, entry.previous_state || null, entry.new_state || null, JSON.stringify(entry.details || {}), now);
    }
    getHistory(contentId) {
        const db = (0, database_1.getDb)();
        const rows = db
            .prepare('SELECT * FROM audit_logs WHERE content_id = ? ORDER BY created_at ASC')
            .all(contentId);
        return rows.map(deserializeAuditLog);
    }
    // ── LinkedIn Token ────────────────────────────────────────────────────────────
    saveLinkedInToken(token) {
        const db = (0, database_1.getDb)();
        db.prepare('DELETE FROM linkedin_accounts').run();
        db.prepare(`
      INSERT INTO linkedin_accounts (id, access_token, refresh_token, expires_at, organization_id, person_urn, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(token.id, (0, crypto_1.encryptToken)(token.access_token), token.refresh_token ? (0, crypto_1.encryptToken)(token.refresh_token) : '', token.expires_at, token.organization_id, token.person_urn, token.created_at);
    }
    getLinkedInToken() {
        const db = (0, database_1.getDb)();
        const row = db
            .prepare('SELECT * FROM linkedin_accounts ORDER BY created_at DESC LIMIT 1')
            .get();
        if (!row)
            return null;
        return {
            id: row.id,
            access_token: (0, crypto_1.decryptToken)(row.access_token),
            refresh_token: row.refresh_token ? (0, crypto_1.decryptToken)(row.refresh_token) : row.refresh_token,
            expires_at: row.expires_at,
            organization_id: row.organization_id,
            person_urn: row.person_urn,
            created_at: row.created_at,
        };
    }
    // ── LinkedIn Profile Cache ────────────────────────────────────────────────────
    cacheLinkedInProfile(data) {
        const db = (0, database_1.getDb)();
        const now = new Date().toISOString();
        db.prepare('DELETE FROM linkedin_profile_cache').run();
        db.prepare('INSERT INTO linkedin_profile_cache (id, data, updated_at) VALUES (?, ?, ?)').run('profile', JSON.stringify(data), now);
    }
    getCachedLinkedInProfile() {
        const db = (0, database_1.getDb)();
        const row = db
            .prepare('SELECT * FROM linkedin_profile_cache WHERE id = ?')
            .get('profile');
        return row ? JSON.parse(row.data) : null;
    }
}
exports.ContentRepository = ContentRepository;
// Singleton export
exports.contentRepository = new ContentRepository();
