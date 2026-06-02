/**
 * BUAD Platform — Cloudflare Pages Functions API
 * Bindings required:
 *   BUAD_DB  → D1 database
 *   JWT_SECRET → Environment variable (secret string)
 */

/* ── Helpers ── */

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

// Unicode-safe base64url encode (supports Arabic and all Unicode)
function b64uEncode(str) {
  const bytes = new TextEncoder().encode(str);
  const bin = Array.from(bytes, b => String.fromCharCode(b)).join('');
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Unicode-safe base64url decode
function b64uDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') +
    '=='.slice(0, (4 - str.length % 4) % 4);
  const bin = atob(padded);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function signJWT(payload, secret) {
  const header = b64uEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body   = b64uEncode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 30,
  }));
  const msg = header + '.' + body;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return msg + '.' + sigB64;
}

async function verifyJWT(token, secret) {
  try {
    const parts = (token || '').split('.');
    if (parts.length !== 3) return null;
    const msg = parts[0] + '.' + parts[1];
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const sigPadded = parts[2].replace(/-/g, '+').replace(/_/g, '/') +
      '=='.slice(0, (4 - parts[2].length % 4) % 4);
    const sig = Uint8Array.from(atob(sigPadded), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(msg));
    if (!valid) return null;
    const payload = JSON.parse(b64uDecode(parts[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

/* ── Main handler ── */

export async function onRequest(context) {
  const { request, env } = context;
  const url    = new URL(request.url);
  const path   = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/';
  const method = request.method;

  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  const db = env.BUAD_DB;
  const jwtSecret = env.JWT_SECRET || 'buad-dev-secret-change-in-production';

  /* ─── POST /api/auth/login ─── */
  if (path === '/auth/login' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const email = (body.email || '').toLowerCase().trim();
    const pass  = (body.password || '');

    const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) {
      return json({ error: 'invalid_credentials' }, 401);
    }
    // First-login users have no password yet — let them set one (no password check)
    if (user.must_change_pass) {
      const setupToken = await signJWT({ id: user.id, name: user.name, email: user.email, role: user.role, action: 'setup' }, jwtSecret);
      return json({ action: 'setup', token: setupToken, name: user.name });
    }
    if (user.password_hash !== djb2(pass)) {
      return json({ error: 'invalid_credentials' }, 401);
    }
    const token = await signJWT({ id: user.id, name: user.name, email: user.email, role: user.role }, jwtSecret);
    return json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  }

  /* ─── POST /api/auth/setup-pass ─── */
  if (path === '/auth/setup-pass' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const setupToken = (body.setupToken || '').replace('Bearer ', '');
    const payload = await verifyJWT(setupToken, jwtSecret);
    if (!payload || payload.action !== 'setup') return json({ error: 'Invalid token' }, 401);
    const newPass = body.password || '';
    if (newPass.length < 6) return json({ error: 'Password too short' }, 400);
    await db.prepare('UPDATE users SET password_hash = ?, must_change_pass = 0 WHERE id = ?')
      .bind(djb2(newPass), payload.id).run();
    const token = await signJWT({ id: payload.id, name: payload.name, email: payload.email, role: payload.role }, jwtSecret);
    return json({ token, user: { id: payload.id, name: payload.name, email: payload.email, role: payload.role } });
  }

  /* ─── PUBLIC: GET /api/public/org-site/:orgId ─── published org website data (no auth) */
  const pubOrgSiteMatch = path.match(/^\/public\/org-site\/([^/]+)$/);
  if (pubOrgSiteMatch && method === 'GET') {
    const orgId = pubOrgSiteMatch[1];
    const org = await db.prepare('SELECT id, name, website_enabled FROM orgs WHERE id = ?').bind(orgId).first();
    if (!org || !org.website_enabled) return json({ error: 'not_found' }, 404);
    const ws = await db.prepare('SELECT * FROM org_websites WHERE org_id = ?').bind(orgId).first();
    if (!ws || !ws.published) return json({ error: 'not_published' }, 404);
    return json({ org_id: orgId, config: JSON.parse(ws.config || '{}'), published_at: ws.published_at });
  }

  /* ─── PUBLIC: GET /api/public/site ─── landing-page content (no auth) */
  if (path === '/public/site' && method === 'GET') {
    const row = await db.prepare('SELECT data FROM site_content WHERE id = ?').bind('main').first();
    const data = row ? JSON.parse(row.data) : {};
    return json(data);
  }

  /* ─── PUBLIC: GET /api/public/resources ─── resources for org portal (no auth) */
  if (path === '/public/resources' && method === 'GET') {
    const row = await db.prepare('SELECT data FROM site_content WHERE id = ?').bind('resources').first();
    return json(row ? JSON.parse(row.data) : null);
  }

  /* ─── PUBLIC: POST /api/public/request ─── submit a service request (no auth) */
  if (path === '/public/request' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const name = (body.name || '').trim();
    const phone = (body.phone || '').trim();
    if (!name || !phone) return json({ error: 'name and phone required' }, 400);
    const id = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.prepare(
      'INSERT INTO service_requests (id, name, org, phone, email, service, budget, message, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id, name, (body.org || '').trim(), phone, (body.email || '').trim(),
      (body.service || '').trim(), (body.budget || '').trim(), (body.message || '').trim(),
      (body.source || 'website')
    ).run();
    return json({ ok: true, id }, 201);
  }

  /* ─── PUBLIC: POST /api/org/register ─── association self-registration */
  if (path === '/org/register' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const email = (body.email || '').toLowerCase().trim();
    const pass  = (body.password || '');
    const name  = (body.name || '').trim();
    if (!email || !pass || !name) return json({ error: 'missing_fields' }, 400);
    if (pass.length < 6) return json({ error: 'weak_password' }, 400);
    const existing = await db.prepare('SELECT id FROM orgs WHERE email = ?').bind(email).first();
    if (existing) return json({ error: 'email_exists' }, 409);
    const id = 'org_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const today = new Date().toISOString().slice(0, 10);
    await db.prepare(
      'INSERT INTO orgs (id, name, email, password_hash, contact_name, phone, city, license_no, plan_start) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id, name, email, djb2(pass), (body.contact_name || '').trim(),
      (body.phone || '').trim(), (body.city || '').trim(), (body.license_no || '').trim(), today
    ).run();
    const token = await signJWT({ id, name, email, kind: 'org' }, jwtSecret);
    return json({ token, org: { id, name, email, plan_start: today, progress: {} } }, 201);
  }

  /* ─── PUBLIC: POST /api/org/login ─── association login (org admin or team member) */
  if (path === '/org/login' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const email = (body.email || '').toLowerCase().trim();
    const pass  = (body.password || '');
    // Check org admin first
    const org = await db.prepare('SELECT * FROM orgs WHERE email = ?').bind(email).first();
    if (org && org.password_hash === djb2(pass)) {
      const token = await signJWT({ id: org.id, name: org.name, email: org.email, kind: 'org', role: 'admin' }, jwtSecret);
      return json({
        token,
        org: { id: org.id, name: org.name, email: org.email, plan_start: org.plan_start,
               progress: JSON.parse(org.progress || '{}'), contact_name: org.contact_name,
               phone: org.phone, city: org.city, license_no: org.license_no,
               logo_url: org.logo_url || '', banner_url: org.banner_url || '' }
      });
    }
    // Check team members
    try {
      const mem = await db.prepare('SELECT m.*, o.id AS org_id, o.name AS org_name, o.plan_start, o.progress, o.contact_name, o.phone, o.city, o.license_no, o.logo_url, o.banner_url FROM org_members m JOIN orgs o ON m.org_id=o.id WHERE m.email=?').bind(email).first();
      if (mem && mem.password_hash === djb2(pass)) {
        const token = await signJWT({ id: mem.org_id, name: mem.name, email: mem.email, kind: 'org', role: mem.role, member_id: mem.id }, jwtSecret);
        return json({
          token,
          org: { id: mem.org_id, name: mem.org_name, email: mem.email, plan_start: mem.plan_start,
                 progress: JSON.parse(mem.progress || '{}'), contact_name: mem.contact_name,
                 phone: mem.phone, city: mem.city, license_no: mem.license_no,
                 logo_url: mem.logo_url || '', banner_url: mem.banner_url || '' }
        });
      }
    } catch (_) {}
    return json({ error: 'invalid_credentials' }, 401);
  }

  /* ── Org-authenticated routes (association portal) ── */
  const orgAuth = request.headers.get('Authorization') || '';
  const orgToken = orgAuth.replace('Bearer ', '');
  const orgMe = await verifyJWT(orgToken, jwtSecret);

  if (path === '/org/me' && method === 'GET') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    const org = await db.prepare('SELECT * FROM orgs WHERE id = ?').bind(orgMe.id).first();
    if (!org) return json({ error: 'not_found' }, 404);
    return json({ id: org.id, name: org.name, email: org.email, plan_start: org.plan_start,
      progress: JSON.parse(org.progress || '{}'), contact_name: org.contact_name,
      phone: org.phone, city: org.city, license_no: org.license_no,
      logo_url: org.logo_url || '', banner_url: org.banner_url || '',
      website_enabled: org.website_enabled ? 1 : 0,
      crm_enabled: org.crm_enabled ? 1 : 0 });
  }

  if (path === '/org/progress' && method === 'PUT') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const progress = JSON.stringify(body.progress || {});
    await db.prepare('UPDATE orgs SET progress = ?, last_active = unixepoch() WHERE id = ?')
      .bind(progress, orgMe.id).run();
    return json({ ok: true });
  }

  /* ─── PUT /api/org/profile ─── association updates its own profile details */
  if (path === '/org/profile' && method === 'PUT') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const name = (body.name || '').trim();
    if (!name) return json({ error: 'missing_fields' }, 400);
    // Ensure logo/banner columns exist (defensive — older DBs may predate them)
    try { await db.prepare('ALTER TABLE orgs ADD COLUMN logo_url TEXT NOT NULL DEFAULT \'\'').run(); } catch (e) {}
    try { await db.prepare('ALTER TABLE orgs ADD COLUMN banner_url TEXT NOT NULL DEFAULT \'\'').run(); } catch (e) {}
    await db.prepare(
      'UPDATE orgs SET name = ?, contact_name = ?, phone = ?, city = ?, license_no = ?, logo_url = ?, banner_url = ?, last_active = unixepoch() WHERE id = ?'
    ).bind(
      name,
      (body.contact_name || '').trim(),
      (body.phone || '').trim(),
      (body.city || '').trim(),
      (body.license_no || '').trim(),
      (body.logo_url || '').trim(),
      (body.banner_url || '').trim(),
      orgMe.id
    ).run();
    const org = await db.prepare('SELECT * FROM orgs WHERE id = ?').bind(orgMe.id).first();
    return json({ ok: true, org: { id: org.id, name: org.name, email: org.email, plan_start: org.plan_start,
      progress: JSON.parse(org.progress || '{}'), contact_name: org.contact_name,
      phone: org.phone, city: org.city, license_no: org.license_no,
      logo_url: org.logo_url || '', banner_url: org.banner_url || '' } });
  }

  /* ─── GET /api/org/members ─── list team members */
  if (path === '/org/members' && method === 'GET') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    try {
      await db.prepare('CREATE TABLE IF NOT EXISTS org_members (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT "editor", created_at INTEGER NOT NULL DEFAULT (unixepoch()))').run();
      const { results } = await db.prepare('SELECT id,name,email,role,created_at FROM org_members WHERE org_id=? ORDER BY created_at ASC').bind(orgMe.id).all();
      // Include org admin as main member
      const orgRow = await db.prepare('SELECT name,email FROM orgs WHERE id=?').bind(orgMe.id).first();
      const mainMember = orgRow ? [{ id: 'main', name: orgRow.name, email: orgRow.email, role: 'admin', is_main: true }] : [];
      return json([...mainMember, ...results.map(function(m){ return { ...m, is_main: false }; })]);
    } catch (e) { return json([], 200); }
  }

  /* ─── POST /api/org/members ─── add team member */
  if (path === '/org/members' && method === 'POST') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const name = (body.name || '').trim();
    const email = (body.email || '').toLowerCase().trim();
    const pass = body.password || '';
    const role = ['admin','editor','viewer'].includes(body.role) ? body.role : 'editor';
    if (!name || !email || !pass) return json({ error: 'missing_fields' }, 400);
    try {
      await db.prepare('CREATE TABLE IF NOT EXISTS org_members (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT "editor", created_at INTEGER NOT NULL DEFAULT (unixepoch()))').run();
      // Check email unique across orgs + org_members
      const existOrg = await db.prepare('SELECT id FROM orgs WHERE email=?').bind(email).first();
      const existMem = await db.prepare('SELECT id FROM org_members WHERE email=?').bind(email).first();
      if (existOrg || existMem) return json({ error: 'email_taken' }, 409);
      const id = 'mem_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.prepare('INSERT INTO org_members (id,org_id,name,email,password_hash,role) VALUES (?,?,?,?,?,?)').bind(id, orgMe.id, name, email, djb2(pass), role).run();
      return json({ ok: true, id, name, email, role }, 201);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── DELETE /api/org/members/:id ─── remove team member */
  const orgMemDelMatch = path.match(/^\/org\/members\/([^/]+)$/);
  if (orgMemDelMatch && method === 'DELETE') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    const memId = orgMemDelMatch[1];
    try {
      await db.prepare('DELETE FROM org_members WHERE id=? AND org_id=?').bind(memId, orgMe.id).run();
      return json({ ok: true });
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── POST /api/org/change-password ─── */
  if (path === '/org/change-password' && method === 'POST') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const oldPass = body.old_password || '';
    const newPass = body.new_password || '';
    if (!oldPass || !newPass) return json({ error: 'missing_fields' }, 400);
    if (newPass.length < 6) return json({ error: 'password_too_short' }, 400);
    const orgRow = await db.prepare('SELECT password_hash FROM orgs WHERE id=?').bind(orgMe.id).first();
    if (!orgRow || orgRow.password_hash !== djb2(oldPass)) return json({ error: 'wrong_password' }, 401);
    await db.prepare('UPDATE orgs SET password_hash=? WHERE id=?').bind(djb2(newPass), orgMe.id).run();
    return json({ ok: true });
  }

  /* ─── GET /api/org/website ─── get org's website config */
  if (path === '/org/website' && method === 'GET') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    const org = await db.prepare('SELECT website_enabled FROM orgs WHERE id = ?').bind(orgMe.id).first();
    if (!org || !org.website_enabled) return json({ error: 'not_enabled' }, 403);
    const ws = await db.prepare('SELECT * FROM org_websites WHERE org_id = ?').bind(orgMe.id).first();
    if (!ws) return json({ org_id: orgMe.id, config: {}, published: 0, published_at: null, custom_domain: '' });
    return json({ org_id: orgMe.id, config: JSON.parse(ws.config || '{}'), published: ws.published,
      published_at: ws.published_at, custom_domain: ws.custom_domain });
  }

  /* ─── PUT /api/org/website ─── save org's website config */
  if (path === '/org/website' && method === 'PUT') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    const org = await db.prepare('SELECT website_enabled FROM orgs WHERE id = ?').bind(orgMe.id).first();
    if (!org || !org.website_enabled) return json({ error: 'not_enabled' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const config = JSON.stringify(body.config || {});
    const publish = body.publish ? 1 : 0;
    const customDomain = (body.custom_domain || '').trim();
    const publishedAt = publish ? Math.floor(Date.now() / 1000) : null;
    await db.prepare(
      'INSERT INTO org_websites (org_id, config, published, published_at, custom_domain) VALUES (?, ?, ?, ?, ?) ' +
      'ON CONFLICT(org_id) DO UPDATE SET config = excluded.config, published = excluded.published, ' +
      'published_at = CASE WHEN excluded.published = 1 THEN excluded.published_at ELSE published_at END, ' +
      'custom_domain = excluded.custom_domain, updated_at = unixepoch()'
    ).bind(orgMe.id, config, publish, publishedAt, customDomain).run();
    return json({ ok: true, published: publish });
  }

  /* ─── POST /api/org/request ─── association requests a service (lands in admin requests) */
  if (path === '/org/request' && method === 'POST') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const service = (body.service || '').trim();
    if (!service) return json({ error: 'missing_fields' }, 400);
    // ensure org_id + client_note columns exist (defensive for older DBs)
    try { await db.prepare('ALTER TABLE service_requests ADD COLUMN org_id TEXT NOT NULL DEFAULT \'\'').run(); } catch (e) {}
    try { await db.prepare('ALTER TABLE service_requests ADD COLUMN client_note TEXT NOT NULL DEFAULT \'\'').run(); } catch (e) {}
    // pull the org's own contact details so the admin sees who's asking
    const o = await db.prepare('SELECT name, email, contact_name, phone FROM orgs WHERE id = ?').bind(orgMe.id).first();
    const id = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.prepare(
      'INSERT INTO service_requests (id, name, org, phone, email, service, budget, message, source, org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      (o && o.contact_name) || (o && o.name) || orgMe.name || '',
      (o && o.name) || orgMe.name || '',
      (o && o.phone) || '',
      (o && o.email) || orgMe.email || '',
      service,
      '',
      (body.message || '').trim(),
      'portal',
      orgMe.id
    ).run();
    return json({ ok: true, id }, 201);
  }

  /* ─── GET /api/org/requests ─── association views its own submitted requests */
  if (path === '/org/requests' && method === 'GET') {
    if (!orgMe || orgMe.kind !== 'org') return json({ error: 'Unauthorized' }, 401);
    try { await db.prepare('ALTER TABLE service_requests ADD COLUMN org_id TEXT NOT NULL DEFAULT \'\'').run(); } catch (e) {}
    try { await db.prepare('ALTER TABLE service_requests ADD COLUMN client_note TEXT NOT NULL DEFAULT \'\'').run(); } catch (e) {}
    const { results } = await db.prepare(
      'SELECT id, service, message, status, client_note, created_at FROM service_requests WHERE org_id = ? ORDER BY created_at DESC'
    ).bind(orgMe.id).all();
    return json(results);
  }

  /* ─── CRM helper: verify org has CRM enabled + ensure tables exist ─── */
  async function crmGuard() {
    if (!orgMe || orgMe.kind !== 'org') return false;
    const crmMigrations = [
      'ALTER TABLE orgs ADD COLUMN crm_enabled INTEGER NOT NULL DEFAULT 0',
      'CREATE TABLE IF NOT EXISTS beneficiaries (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, id_number TEXT NOT NULL DEFAULT "", dob TEXT NOT NULL DEFAULT "", gender TEXT NOT NULL DEFAULT "male", phone TEXT NOT NULL DEFAULT "", phone2 TEXT NOT NULL DEFAULT "", email TEXT NOT NULL DEFAULT "", city TEXT NOT NULL DEFAULT "", district TEXT NOT NULL DEFAULT "", address TEXT NOT NULL DEFAULT "", marital_status TEXT NOT NULL DEFAULT "", dependents INTEGER NOT NULL DEFAULT 0, housing_type TEXT NOT NULL DEFAULT "", income REAL NOT NULL DEFAULT 0, employment_status TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "needy", status TEXT NOT NULL DEFAULT "active", notes TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE TABLE IF NOT EXISTS crm_requests (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, service_type TEXT NOT NULL DEFAULT "other", title TEXT NOT NULL DEFAULT "", description TEXT NOT NULL DEFAULT "", amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT "pending", priority TEXT NOT NULL DEFAULT "normal", assigned_to TEXT NOT NULL DEFAULT "", due_date TEXT NOT NULL DEFAULT "", resolution TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE TABLE IF NOT EXISTS crm_aids (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT "", aid_type TEXT NOT NULL DEFAULT "financial", amount REAL NOT NULL DEFAULT 0, items TEXT NOT NULL DEFAULT "[]", provided_at TEXT NOT NULL DEFAULT "", notes TEXT NOT NULL DEFAULT "", created_by TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE TABLE IF NOT EXISTS crm_notes (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT "", type TEXT NOT NULL DEFAULT "note", content TEXT NOT NULL DEFAULT "", created_by TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE TABLE IF NOT EXISTS crm_config (org_id TEXT PRIMARY KEY, config TEXT NOT NULL DEFAULT "{}", updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'ALTER TABLE beneficiaries ADD COLUMN custom_data TEXT NOT NULL DEFAULT "{}"',
      // ── Beneficiary onboarding/approval workflow ──
      'ALTER TABLE beneficiaries ADD COLUMN stage TEXT NOT NULL DEFAULT "active"',
      'ALTER TABLE beneficiaries ADD COLUMN stage_note TEXT NOT NULL DEFAULT ""',
      'ALTER TABLE beneficiaries ADD COLUMN assigned_to TEXT NOT NULL DEFAULT ""',
      // ── Enhanced notes (internal flag + stage link) ──
      'ALTER TABLE crm_notes ADD COLUMN internal INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE crm_notes ADD COLUMN stage TEXT NOT NULL DEFAULT ""',
      // ── Request multi-stage assignment ──
      'ALTER TABLE crm_requests ADD COLUMN stage TEXT NOT NULL DEFAULT ""',
      // ── Document checklist ──
      'CREATE TABLE IF NOT EXISTS crm_documents (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL DEFAULT "", request_id TEXT NOT NULL DEFAULT "", doc_type TEXT NOT NULL DEFAULT "", label TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "required", note TEXT NOT NULL DEFAULT "", file_url TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()), verified_at INTEGER NOT NULL DEFAULT 0, verified_by TEXT NOT NULL DEFAULT "")',
      'CREATE INDEX IF NOT EXISTS idx_cdoc_ben ON crm_documents(beneficiary_id)',
      'CREATE INDEX IF NOT EXISTS idx_cdoc_req ON crm_documents(request_id)',
      // ── Request approval chain ──
      'CREATE TABLE IF NOT EXISTS crm_approvals (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, request_id TEXT NOT NULL, stage TEXT NOT NULL DEFAULT "", action TEXT NOT NULL DEFAULT "", actor TEXT NOT NULL DEFAULT "", from_status TEXT NOT NULL DEFAULT "", to_status TEXT NOT NULL DEFAULT "", note TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE INDEX IF NOT EXISTS idx_capp_req ON crm_approvals(request_id)'
    ];
    for (const sql of crmMigrations) { try { await db.prepare(sql).run(); } catch (_) {} }
    try {
      const row = await db.prepare('SELECT crm_enabled FROM orgs WHERE id = ?').bind(orgMe.id).first();
      return !!(row && row.crm_enabled);
    } catch (_) { return false; }
  }

  /* ─── CRM helper: write an automatic audit-trail note ─── */
  async function crmLog(beneficiaryId, requestId, type, content, stage) {
    try {
      const id = 'nt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.prepare(
        'INSERT INTO crm_notes (id,org_id,beneficiary_id,request_id,type,content,created_by,internal,stage) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(id, orgMe.id, beneficiaryId || '', requestId || '', type || 'system',
        (content || '').trim(), orgMe.name || '', 1, stage || '').run();
    } catch (_) {}
  }

  /* ─── GET /api/crm/config ─── per-org CRM taxonomies + form builder ─── */
  if (path === '/crm/config' && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const row = await db.prepare('SELECT config FROM crm_config WHERE org_id=?').bind(orgMe.id).first();
      let cfg = {};
      if (row && row.config) { try { cfg = JSON.parse(row.config); } catch (_) { cfg = {}; } }
      return json(cfg);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── PUT /api/crm/config ─── save per-org CRM config (admin role only) ─── */
  if (path === '/crm/config' && method === 'PUT') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    if (orgMe.role && orgMe.role !== 'admin') return json({ error: 'forbidden' }, 403);
    try {
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      const cfg = JSON.stringify(body || {});
      await db.prepare('INSERT INTO crm_config (org_id, config, updated_at) VALUES (?, ?, unixepoch()) ON CONFLICT(org_id) DO UPDATE SET config=excluded.config, updated_at=unixepoch()').bind(orgMe.id, cfg).run();
      return json({ ok: true });
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── GET /api/crm/dashboard ─── */
  if (path === '/crm/dashboard' && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const [stats, recentBens, pendingReqs] = await Promise.all([
        db.prepare(
          'SELECT (SELECT COUNT(*) FROM beneficiaries WHERE org_id=?) AS total_bens,' +
          '(SELECT COUNT(*) FROM beneficiaries WHERE org_id=? AND status="active") AS active_bens,' +
          '(SELECT COUNT(*) FROM beneficiaries WHERE org_id=? AND stage IN ("pending","reviewing")) AS pending_bens,' +
          '(SELECT COUNT(*) FROM crm_requests WHERE org_id=? AND status="pending") AS pending_reqs,' +
          '(SELECT COUNT(*) FROM crm_requests WHERE org_id=? AND status="reviewing") AS reviewing_reqs,' +
          '(SELECT COUNT(*) FROM crm_requests WHERE org_id=? AND status="completed") AS done_reqs,' +
          '(SELECT COALESCE(SUM(amount),0) FROM crm_aids WHERE org_id=?) AS total_spent'
        ).bind(orgMe.id, orgMe.id, orgMe.id, orgMe.id, orgMe.id, orgMe.id, orgMe.id).first(),
        db.prepare('SELECT id,name,category,status,city,created_at FROM beneficiaries WHERE org_id=? ORDER BY created_at DESC LIMIT 6').bind(orgMe.id).all(),
        db.prepare(
          'SELECT r.*,b.name AS ben_name,b.category AS ben_cat FROM crm_requests r ' +
          'JOIN beneficiaries b ON r.beneficiary_id=b.id ' +
          'WHERE r.org_id=? AND r.status IN ("pending","reviewing") ' +
          'ORDER BY CASE r.priority WHEN "urgent" THEN 0 WHEN "high" THEN 1 ELSE 2 END, r.created_at LIMIT 10'
        ).bind(orgMe.id).all()
      ]);
      return json({ stats, recent_bens: recentBens.results, pending_reqs_list: pendingReqs.results });
    } catch (e) {
      return json({ error: 'db_error', detail: e.message }, 500);
    }
  }

  /* ─── GET /api/crm/beneficiaries ─── */
  if (path === '/crm/beneficiaries' && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const url = new URL(request.url);
      const q = (url.searchParams.get('q') || '').trim();
      const status = url.searchParams.get('status') || '';
      const category = url.searchParams.get('category') || '';
      let sql = 'SELECT b.*,' +
        '(SELECT COUNT(*) FROM crm_requests r WHERE r.beneficiary_id=b.id) AS req_count,' +
        '(SELECT COALESCE(SUM(a.amount),0) FROM crm_aids a WHERE a.beneficiary_id=b.id) AS total_aid ' +
        'FROM beneficiaries b WHERE b.org_id=?';
      const params = [orgMe.id];
      if (q) { sql += ' AND (b.name LIKE ? OR b.id_number LIKE ? OR b.phone LIKE ?)'; params.push('%'+q+'%', '%'+q+'%', '%'+q+'%'); }
      if (status) { sql += ' AND b.status=?'; params.push(status); }
      if (category) { sql += ' AND b.category=?'; params.push(category); }
      sql += ' ORDER BY b.created_at DESC LIMIT 200';
      const { results } = await db.prepare(sql).bind(...params).all();
      return json(results);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── POST /api/crm/beneficiaries ─── */
  if (path === '/crm/beneficiaries' && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      if (!(body.name || '').trim()) return json({ error: 'name_required' }, 400);
      const id = 'ben_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const customData = JSON.stringify(body.custom_data || {});
      // New beneficiaries enter the onboarding workflow at "pending" unless the
      // caller explicitly registers them as already-active (e.g. import / quick add).
      const stage = body.stage || 'pending';
      const status = stage === 'approved' ? 'active' : (body.status || 'inactive');
      await db.prepare(
        'INSERT INTO beneficiaries (id,org_id,name,id_number,dob,gender,phone,phone2,email,city,district,address,marital_status,dependents,housing_type,income,employment_status,category,status,stage,assigned_to,notes,custom_data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(id, orgMe.id, (body.name||'').trim(), (body.id_number||'').trim(), (body.dob||'').trim(),
        body.gender||'male', (body.phone||'').trim(), (body.phone2||'').trim(), (body.email||'').trim(),
        (body.city||'').trim(), (body.district||'').trim(), (body.address||'').trim(),
        body.marital_status||'', parseInt(body.dependents)||0, body.housing_type||'',
        parseFloat(body.income)||0, body.employment_status||'', body.category||'needy',
        status, stage, (body.assigned_to||'').trim(), (body.notes||'').trim(), customData).run();
      // Audit trail
      await crmLog(id, '', 'system', 'تم تسجيل المستفيد', '');
      const ben = await db.prepare('SELECT * FROM beneficiaries WHERE id=?').bind(id).first();
      return json(ben, 201);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── GET /PUT /DELETE /api/crm/beneficiaries/:id ─── */
  const crmBenMatch = path.match(/^\/crm\/beneficiaries\/([^/]+)$/);
  if (crmBenMatch && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const benId = crmBenMatch[1];
      const ben = await db.prepare('SELECT * FROM beneficiaries WHERE id=? AND org_id=?').bind(benId, orgMe.id).first();
      if (!ben) return json({ error: 'not_found' }, 404);
      const [reqs, aids, notes, docs] = await Promise.all([
        db.prepare('SELECT * FROM crm_requests WHERE beneficiary_id=? ORDER BY created_at DESC').bind(benId).all(),
        db.prepare('SELECT * FROM crm_aids WHERE beneficiary_id=? ORDER BY created_at DESC').bind(benId).all(),
        db.prepare('SELECT * FROM crm_notes WHERE beneficiary_id=? ORDER BY created_at DESC').bind(benId).all(),
        db.prepare('SELECT * FROM crm_documents WHERE beneficiary_id=? AND request_id="" ORDER BY created_at ASC').bind(benId).all()
      ]);
      return json(Object.assign({}, ben, { requests: reqs.results, aids: aids.results, notes: notes.results, documents: docs.results }));
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }
  if (crmBenMatch && method === 'PUT') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const benId = crmBenMatch[1];
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      const customData = JSON.stringify(body.custom_data || {});
      await db.prepare(
        'UPDATE beneficiaries SET name=?,id_number=?,dob=?,gender=?,phone=?,phone2=?,email=?,city=?,district=?,address=?,marital_status=?,dependents=?,housing_type=?,income=?,employment_status=?,category=?,status=?,notes=?,custom_data=?,updated_at=unixepoch() WHERE id=? AND org_id=?'
      ).bind((body.name||'').trim(), (body.id_number||'').trim(), (body.dob||'').trim(),
        body.gender||'male', (body.phone||'').trim(), (body.phone2||'').trim(), (body.email||'').trim(),
        (body.city||'').trim(), (body.district||'').trim(), (body.address||'').trim(),
        body.marital_status||'', parseInt(body.dependents)||0, body.housing_type||'',
        parseFloat(body.income)||0, body.employment_status||'', body.category||'needy',
        body.status||'active', (body.notes||'').trim(), customData, benId, orgMe.id).run();
      const ben = await db.prepare('SELECT * FROM beneficiaries WHERE id=?').bind(benId).first();
      return json(ben);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }
  if (crmBenMatch && method === 'DELETE') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const benId = crmBenMatch[1];
      await Promise.all([
        db.prepare('DELETE FROM crm_notes WHERE beneficiary_id=? AND org_id=?').bind(benId, orgMe.id).run(),
        db.prepare('DELETE FROM crm_aids WHERE beneficiary_id=? AND org_id=?').bind(benId, orgMe.id).run(),
        db.prepare('DELETE FROM crm_requests WHERE beneficiary_id=? AND org_id=?').bind(benId, orgMe.id).run(),
        db.prepare('DELETE FROM beneficiaries WHERE id=? AND org_id=?').bind(benId, orgMe.id).run()
      ]);
      return json({ ok: true });
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── PATCH /api/crm/beneficiaries/:id/stage ─── onboarding workflow ─── */
  const crmBenStageMatch = path.match(/^\/crm\/beneficiaries\/([^/]+)\/stage$/);
  if (crmBenStageMatch && method === 'PATCH') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const benId = crmBenStageMatch[1];
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      const stage = body.stage || '';
      const valid = ['pending', 'reviewing', 'approved', 'rejected'];
      if (!valid.includes(stage)) return json({ error: 'bad_stage' }, 400);
      // Approving/rejecting is an admin/reviewer action
      if (stage === 'approved' || stage === 'rejected') {
        if (orgMe.role && orgMe.role === 'viewer') return json({ error: 'forbidden' }, 403);
      }
      const newStatus = stage === 'approved' ? 'active' : (stage === 'rejected' ? 'inactive' : null);
      if (newStatus) {
        await db.prepare('UPDATE beneficiaries SET stage=?, stage_note=?, status=?, updated_at=unixepoch() WHERE id=? AND org_id=?')
          .bind(stage, (body.note||'').trim(), newStatus, benId, orgMe.id).run();
      } else {
        await db.prepare('UPDATE beneficiaries SET stage=?, stage_note=?, updated_at=unixepoch() WHERE id=? AND org_id=?')
          .bind(stage, (body.note||'').trim(), benId, orgMe.id).run();
      }
      const stageLabels = { pending: 'بانتظار المراجعة', reviewing: 'قيد مراجعة الملف', approved: 'اعتماد الملف', rejected: 'رفض الملف' };
      await crmLog(benId, '', 'system', (stageLabels[stage] || stage) + (body.note ? ' — ' + body.note.trim() : ''), stage);
      const ben = await db.prepare('SELECT * FROM beneficiaries WHERE id=? AND org_id=?').bind(benId, orgMe.id).first();
      return json(ben);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── Documents checklist ─── */
  if (path === '/crm/documents' && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const url = new URL(request.url);
      const benId = url.searchParams.get('beneficiary_id') || '';
      const reqId = url.searchParams.get('request_id') || '';
      let sql = 'SELECT * FROM crm_documents WHERE org_id=?'; const p = [orgMe.id];
      if (reqId) { sql += ' AND request_id=?'; p.push(reqId); }
      else if (benId) { sql += ' AND beneficiary_id=? AND request_id=""'; p.push(benId); }
      sql += ' ORDER BY created_at ASC';
      const { results } = await db.prepare(sql).bind(...p).all();
      return json(results);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }
  if (path === '/crm/documents' && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      // Accept either a single doc or an array (for seeding a checklist at once)
      const items = Array.isArray(body.items) ? body.items : [body];
      const ids = [];
      for (const it of items) {
        const id = 'doc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await db.prepare(
          'INSERT INTO crm_documents (id,org_id,beneficiary_id,request_id,doc_type,label,status,note,file_url) VALUES (?,?,?,?,?,?,?,?,?)'
        ).bind(id, orgMe.id, body.beneficiary_id || it.beneficiary_id || '', body.request_id || it.request_id || '',
          it.doc_type || '', (it.label || '').trim(), it.status || 'required', (it.note || '').trim(), (it.file_url || '').trim()).run();
        ids.push(id);
      }
      return json({ ok: true, ids }, 201);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }
  const crmDocMatch = path.match(/^\/crm\/documents\/([^/]+)$/);
  if (crmDocMatch && method === 'PATCH') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      const fields = [], vals = [];
      ['status', 'note', 'label', 'file_url'].forEach(function (k) { if (body[k] !== undefined) { fields.push(k + '=?'); vals.push(body[k]); } });
      if (body.status === 'verified') { fields.push('verified_at=unixepoch()'); fields.push('verified_by=?'); vals.push(orgMe.name || ''); }
      if (!fields.length) return json({ error: 'nothing' }, 400);
      vals.push(crmDocMatch[1], orgMe.id);
      await db.prepare('UPDATE crm_documents SET ' + fields.join(',') + ' WHERE id=? AND org_id=?').bind(...vals).run();
      return json({ ok: true });
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }
  if (crmDocMatch && method === 'DELETE') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try { await db.prepare('DELETE FROM crm_documents WHERE id=? AND org_id=?').bind(crmDocMatch[1], orgMe.id).run(); }
    catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
    return json({ ok: true });
  }

  /* ─── GET /api/crm/requests/:id ─── full request detail with approval chain ─── */
  const crmReqDetailMatch = path.match(/^\/crm\/requests\/([^/]+)\/detail$/);
  if (crmReqDetailMatch && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const reqId = crmReqDetailMatch[1];
      const req = await db.prepare('SELECT r.*,b.name AS ben_name FROM crm_requests r JOIN beneficiaries b ON r.beneficiary_id=b.id WHERE r.id=? AND r.org_id=?').bind(reqId, orgMe.id).first();
      if (!req) return json({ error: 'not_found' }, 404);
      const [approvals, docs, notes] = await Promise.all([
        db.prepare('SELECT * FROM crm_approvals WHERE request_id=? ORDER BY created_at ASC').bind(reqId).all(),
        db.prepare('SELECT * FROM crm_documents WHERE request_id=? ORDER BY created_at ASC').bind(reqId).all(),
        db.prepare('SELECT * FROM crm_notes WHERE request_id=? ORDER BY created_at DESC').bind(reqId).all()
      ]);
      return json(Object.assign({}, req, { approvals: approvals.results, documents: docs.results, notes: notes.results }));
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── POST /api/crm/requests/:id/action ─── approval chain step ─── */
  const crmReqActionMatch = path.match(/^\/crm\/requests\/([^/]+)\/action$/);
  if (crmReqActionMatch && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const reqId = crmReqActionMatch[1];
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      const action = body.action || ''; // advance | approve | reject | return
      const cur = await db.prepare('SELECT * FROM crm_requests WHERE id=? AND org_id=?').bind(reqId, orgMe.id).first();
      if (!cur) return json({ error: 'not_found' }, 404);
      // Final approve/reject is restricted to admin/editor (not viewer)
      if ((action === 'approve' || action === 'reject') && orgMe.role === 'viewer') return json({ error: 'forbidden' }, 403);
      const map = { advance: 'reviewing', approve: 'approved', reject: 'rejected', return: 'pending', complete: 'completed' };
      const toStatus = body.to_status || map[action] || cur.status;
      const actId = 'app_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.prepare(
        'INSERT INTO crm_approvals (id,org_id,request_id,stage,action,actor,from_status,to_status,note) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(actId, orgMe.id, reqId, body.stage || '', action, orgMe.name || '', cur.status, toStatus, (body.note || '').trim()).run();
      await db.prepare('UPDATE crm_requests SET status=?, updated_at=unixepoch() WHERE id=? AND org_id=?').bind(toStatus, reqId, orgMe.id).run();
      const actionLabels = { advance: 'إحالة للمراجعة', approve: 'اعتماد الطلب', reject: 'رفض الطلب', return: 'إعادة الطلب', complete: 'إكمال الطلب' };
      await crmLog(cur.beneficiary_id, reqId, 'system', (actionLabels[action] || action) + (body.note ? ' — ' + body.note.trim() : ''), toStatus);
      return json({ ok: true, status: toStatus });
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── GET /api/crm/reports ─── analytics & statistics ─── */
  if (path === '/crm/reports' && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const oid = orgMe.id;
      const [benStage, benCat, reqStatus, reqSvc, aidType, staff, monthly, missingDocs, procTime] = await Promise.all([
        db.prepare('SELECT stage, COUNT(*) AS n FROM beneficiaries WHERE org_id=? GROUP BY stage').bind(oid).all(),
        db.prepare('SELECT category, COUNT(*) AS n FROM beneficiaries WHERE org_id=? GROUP BY category').bind(oid).all(),
        db.prepare('SELECT status, COUNT(*) AS n FROM crm_requests WHERE org_id=? GROUP BY status').bind(oid).all(),
        db.prepare('SELECT service_type, COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM crm_requests WHERE org_id=? GROUP BY service_type').bind(oid).all(),
        db.prepare('SELECT aid_type, COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM crm_aids WHERE org_id=? GROUP BY aid_type').bind(oid).all(),
        db.prepare('SELECT assigned_to, COUNT(*) AS n, SUM(CASE WHEN status IN ("approved","completed") THEN 1 ELSE 0 END) AS done FROM crm_requests WHERE org_id=? AND assigned_to<>"" GROUP BY assigned_to').bind(oid).all(),
        db.prepare("SELECT strftime('%Y-%m', datetime(created_at,'unixepoch')) AS ym, COUNT(*) AS n, COALESCE(SUM(amount),0) AS total FROM crm_aids WHERE org_id=? GROUP BY ym ORDER BY ym DESC LIMIT 12").bind(oid).all(),
        db.prepare('SELECT COUNT(*) AS n FROM crm_documents WHERE org_id=? AND status IN ("required","missing")').bind(oid).all(),
        db.prepare('SELECT AVG(updated_at-created_at) AS avg_sec FROM crm_requests WHERE org_id=? AND status IN ("approved","completed","rejected")').bind(oid).all()
      ]);
      return json({
        ben_by_stage: benStage.results,
        ben_by_category: benCat.results,
        req_by_status: reqStatus.results,
        req_by_service: reqSvc.results,
        aid_by_type: aidType.results,
        staff: staff.results,
        monthly_aid: monthly.results,
        missing_docs: (missingDocs.results[0] || {}).n || 0,
        avg_process_days: Math.round(((procTime.results[0] || {}).avg_sec || 0) / 86400 * 10) / 10
      });
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── GET /api/crm/requests ─── */
  if (path === '/crm/requests' && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      const url = new URL(request.url);
      const status = url.searchParams.get('status') || '';
      let sql = 'SELECT r.*,b.name AS ben_name,b.category AS ben_cat FROM crm_requests r JOIN beneficiaries b ON r.beneficiary_id=b.id WHERE r.org_id=?';
      const params = [orgMe.id];
      if (status) { sql += ' AND r.status=?'; params.push(status); }
      sql += ' ORDER BY CASE r.priority WHEN "urgent" THEN 0 WHEN "high" THEN 1 ELSE 2 END, r.created_at DESC LIMIT 300';
      const { results } = await db.prepare(sql).bind(...params).all();
      return json(results);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── POST /api/crm/requests ─── */
  if (path === '/crm/requests' && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      if (!body.beneficiary_id) return json({ error: 'beneficiary_id required' }, 400);
      const id = 'crq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.prepare(
        'INSERT INTO crm_requests (id,org_id,beneficiary_id,service_type,title,description,amount,status,priority,assigned_to,due_date) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(id, orgMe.id, body.beneficiary_id, body.service_type||'other',
        (body.title||'').trim(), (body.description||'').trim(),
        parseFloat(body.amount)||0, 'pending', body.priority||'normal', (body.assigned_to||'').trim(), (body.due_date||'').trim()).run();
      await crmLog(body.beneficiary_id, id, 'system', 'تم إنشاء الطلب: ' + (body.title||'').trim(), 'pending');
      return json({ ok: true, id }, 201);
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── PATCH /api/crm/requests/:id ─── */
  const crmReqMatch = path.match(/^\/crm\/requests\/([^/]+)$/);
  if (crmReqMatch && method === 'PATCH') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      const fields = [], vals = [];
      ['status','priority','assigned_to','due_date','resolution','title','description','amount'].forEach(function(k) {
        if (body[k] !== undefined) { fields.push(k+'=?'); vals.push(body[k]); }
      });
      if (!fields.length) return json({ error: 'nothing' }, 400);
      fields.push('updated_at=unixepoch()'); vals.push(crmReqMatch[1], orgMe.id);
      await db.prepare('UPDATE crm_requests SET '+fields.join(',')+' WHERE id=? AND org_id=?').bind(...vals).run();
      return json({ ok: true });
    } catch (e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── POST /api/crm/aids ─── */
  if (path === '/crm/aids' && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const id = 'aid_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.prepare(
      'INSERT INTO crm_aids (id,org_id,beneficiary_id,request_id,aid_type,amount,items,provided_at,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(id, orgMe.id, body.beneficiary_id, body.request_id||'',
      body.aid_type||'financial', parseFloat(body.amount)||0,
      JSON.stringify(body.items||[]),
      body.provided_at||new Date().toISOString().slice(0,10),
      (body.notes||'').trim(), (body.created_by||'').trim()).run();
    return json({ ok: true, id }, 201);
    } catch(e) { return json({ error:'db_error', detail:e.message }, 500); }
  }
  const crmAidMatch = path.match(/^\/crm\/aids\/([^/]+)$/);
  if (crmAidMatch && method === 'DELETE') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try { await db.prepare('DELETE FROM crm_aids WHERE id=? AND org_id=?').bind(crmAidMatch[1], orgMe.id).run(); }
    catch(e) { return json({ error:'db_error', detail:e.message }, 500); }
    return json({ ok: true });
  }

  /* ─── POST /api/crm/notes ─── */
  if (path === '/crm/notes' && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try {
      let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
      const id = 'nt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await db.prepare(
        'INSERT INTO crm_notes (id,org_id,beneficiary_id,request_id,type,content,created_by,internal) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(id, orgMe.id, body.beneficiary_id, body.request_id||'',
        body.type||'note', (body.content||'').trim(), orgMe.name || (body.created_by||'').trim(), body.internal ? 1 : 0).run();
      return json({ ok: true, id }, 201);
    } catch(e) { return json({ error:'db_error', detail:e.message }, 500); }
  }
  const crmNoteMatch = path.match(/^\/crm\/notes\/([^/]+)$/);
  if (crmNoteMatch && method === 'DELETE') {
    if (!await crmGuard()) return json({ error: 'crm_not_enabled' }, 403);
    try { await db.prepare('DELETE FROM crm_notes WHERE id=? AND org_id=?').bind(crmNoteMatch[1], orgMe.id).run(); }
    catch(e) { return json({ error:'db_error', detail:e.message }, 500); }
    return json({ ok: true });
  }

  /* ─── PUBLIC: GET /api/public/grants ─── active grant opportunities (no auth) */
  if (path === '/public/grants' && method === 'GET') {
    try {
      const { results } = await db.prepare(
        'SELECT * FROM grant_opportunities WHERE is_active=1 ORDER BY submission_start ASC'
      ).all();
      return json((results || []).map(function(g) {
        return Object.assign({}, g, { domains: JSON.parse(g.domains || '[]') });
      }));
    } catch (e) {
      return json([]);
    }
  }

  /* ── Auth required for all routes below (team/admin only) ── */
  const authHeader = request.headers.get('Authorization') || '';
  const rawToken = authHeader.replace('Bearer ', '');
  const me = await verifyJWT(rawToken, jwtSecret);
  if (!me || me.action || me.kind === 'org') return json({ error: 'Unauthorized' }, 401);

  /* ─── POST /api/admin/run-migrations ─── apply pending DB schema changes ─── */
  if (path === '/admin/run-migrations' && method === 'POST') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const stmts = [
      'ALTER TABLE orgs ADD COLUMN crm_enabled INTEGER NOT NULL DEFAULT 0',
      'ALTER TABLE orgs ADD COLUMN logo_url TEXT NOT NULL DEFAULT \'\'',
      'ALTER TABLE orgs ADD COLUMN banner_url TEXT NOT NULL DEFAULT \'\'',
      'ALTER TABLE service_requests ADD COLUMN org_id TEXT NOT NULL DEFAULT \'\'',
      'ALTER TABLE service_requests ADD COLUMN client_note TEXT NOT NULL DEFAULT \'\'',
      'CREATE INDEX IF NOT EXISTS idx_req_org ON service_requests(org_id)',
      'CREATE TABLE IF NOT EXISTS grant_opportunities (id TEXT PRIMARY KEY, funder_name TEXT NOT NULL, funder_type TEXT NOT NULL DEFAULT \'government\', grant_type TEXT NOT NULL DEFAULT \'\', description TEXT NOT NULL DEFAULT \'\', submission_start TEXT NOT NULL DEFAULT \'\', submission_end TEXT NOT NULL DEFAULT \'\', domains TEXT NOT NULL DEFAULT \'[]\', amount_min INTEGER NOT NULL DEFAULT 0, amount_max INTEGER NOT NULL DEFAULT 0, amount_note TEXT NOT NULL DEFAULT \'\', url TEXT NOT NULL DEFAULT \'\', logo_url TEXT NOT NULL DEFAULT \'\', brand_color TEXT NOT NULL DEFAULT \'\', is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE INDEX IF NOT EXISTS idx_grants_active ON grant_opportunities(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_grants_dates ON grant_opportunities(submission_start, submission_end)',
      'ALTER TABLE grant_opportunities ADD COLUMN logo_url TEXT NOT NULL DEFAULT \'\'',
      'ALTER TABLE grant_opportunities ADD COLUMN brand_color TEXT NOT NULL DEFAULT \'\'',
      'CREATE TABLE IF NOT EXISTS beneficiaries (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, id_number TEXT NOT NULL DEFAULT "", dob TEXT NOT NULL DEFAULT "", gender TEXT NOT NULL DEFAULT "male", phone TEXT NOT NULL DEFAULT "", phone2 TEXT NOT NULL DEFAULT "", email TEXT NOT NULL DEFAULT "", city TEXT NOT NULL DEFAULT "", district TEXT NOT NULL DEFAULT "", address TEXT NOT NULL DEFAULT "", marital_status TEXT NOT NULL DEFAULT "", dependents INTEGER NOT NULL DEFAULT 0, housing_type TEXT NOT NULL DEFAULT "", income REAL NOT NULL DEFAULT 0, employment_status TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "needy", status TEXT NOT NULL DEFAULT "active", notes TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE INDEX IF NOT EXISTS idx_ben_org ON beneficiaries(org_id)',
      'CREATE INDEX IF NOT EXISTS idx_ben_status ON beneficiaries(org_id, status)',
      'CREATE INDEX IF NOT EXISTS idx_ben_cat ON beneficiaries(org_id, category)',
      'CREATE TABLE IF NOT EXISTS crm_requests (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, service_type TEXT NOT NULL DEFAULT "other", title TEXT NOT NULL DEFAULT "", description TEXT NOT NULL DEFAULT "", amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT "pending", priority TEXT NOT NULL DEFAULT "normal", assigned_to TEXT NOT NULL DEFAULT "", due_date TEXT NOT NULL DEFAULT "", resolution TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE INDEX IF NOT EXISTS idx_creq_org ON crm_requests(org_id)',
      'CREATE INDEX IF NOT EXISTS idx_creq_ben ON crm_requests(beneficiary_id)',
      'CREATE INDEX IF NOT EXISTS idx_creq_status ON crm_requests(org_id, status)',
      'CREATE TABLE IF NOT EXISTS crm_aids (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT "", aid_type TEXT NOT NULL DEFAULT "financial", amount REAL NOT NULL DEFAULT 0, items TEXT NOT NULL DEFAULT "[]", provided_at TEXT NOT NULL DEFAULT "", notes TEXT NOT NULL DEFAULT "", created_by TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE INDEX IF NOT EXISTS idx_caid_org ON crm_aids(org_id)',
      'CREATE INDEX IF NOT EXISTS idx_caid_ben ON crm_aids(beneficiary_id)',
      'CREATE TABLE IF NOT EXISTS crm_notes (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT "", type TEXT NOT NULL DEFAULT "note", content TEXT NOT NULL DEFAULT "", created_by TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE INDEX IF NOT EXISTS idx_cnote_ben ON crm_notes(beneficiary_id)'
    ];
    const results = [];
    for (const sql of stmts) {
      try { await db.prepare(sql).run(); results.push({ ok: true, sql: sql.slice(0, 60) }); }
      catch (e) { results.push({ ok: false, sql: sql.slice(0, 60), err: e.message }); }
    }
    return json({ ok: true, results });
  }

  /* ─── GET /api/orgs ─── list registered associations + progress (team) */
  if (path === '/orgs' && method === 'GET') {
    let results;
    try {
      const r = await db.prepare(
        'SELECT id, name, email, contact_name, phone, city, license_no, plan_start, progress, created_at, last_active, website_enabled, crm_enabled FROM orgs ORDER BY last_active DESC'
      ).all();
      results = r.results;
    } catch (e) {
      // crm_enabled column may not exist yet (migration pending) — fallback without it
      const r = await db.prepare(
        'SELECT id, name, email, contact_name, phone, city, license_no, plan_start, progress, created_at, last_active, website_enabled, 0 as crm_enabled FROM orgs ORDER BY last_active DESC'
      ).all();
      results = r.results;
    }
    return json((results || []).map(function (o) {
      return Object.assign({}, o, { progress: JSON.parse(o.progress || '{}') });
    }));
  }

  /* ─── PATCH /api/orgs/:id/toggle-website ─── admin enables/disables website for org */
  const toggleWebMatch = path.match(/^\/orgs\/([^/]+)\/toggle-website$/);
  if (toggleWebMatch && method === 'PATCH') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const orgId = toggleWebMatch[1];
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const enabled = body.enabled ? 1 : 0;
    await db.prepare('UPDATE orgs SET website_enabled = ? WHERE id = ?').bind(enabled, orgId).run();
    return json({ ok: true, website_enabled: enabled });
  }

  /* ─── PATCH /api/orgs/:id/toggle-crm ─── admin enables/disables CRM for org */
  const toggleCrmMatch = path.match(/^\/orgs\/([^/]+)\/toggle-crm$/);
  if (toggleCrmMatch && method === 'PATCH') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const orgId = toggleCrmMatch[1];
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const enabled = body.enabled ? 1 : 0;
    // Ensure crm_enabled column + all CRM tables exist (safe idempotent migrations)
    const crmSetup = [
      'ALTER TABLE orgs ADD COLUMN crm_enabled INTEGER NOT NULL DEFAULT 0',
      'CREATE TABLE IF NOT EXISTS beneficiaries (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, id_number TEXT NOT NULL DEFAULT "", dob TEXT NOT NULL DEFAULT "", gender TEXT NOT NULL DEFAULT "male", phone TEXT NOT NULL DEFAULT "", phone2 TEXT NOT NULL DEFAULT "", email TEXT NOT NULL DEFAULT "", city TEXT NOT NULL DEFAULT "", district TEXT NOT NULL DEFAULT "", address TEXT NOT NULL DEFAULT "", marital_status TEXT NOT NULL DEFAULT "", dependents INTEGER NOT NULL DEFAULT 0, housing_type TEXT NOT NULL DEFAULT "", income REAL NOT NULL DEFAULT 0, employment_status TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "needy", status TEXT NOT NULL DEFAULT "active", notes TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE TABLE IF NOT EXISTS crm_requests (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, service_type TEXT NOT NULL DEFAULT "other", title TEXT NOT NULL DEFAULT "", description TEXT NOT NULL DEFAULT "", amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT "pending", priority TEXT NOT NULL DEFAULT "normal", assigned_to TEXT NOT NULL DEFAULT "", due_date TEXT NOT NULL DEFAULT "", resolution TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE TABLE IF NOT EXISTS crm_aids (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT "", aid_type TEXT NOT NULL DEFAULT "financial", amount REAL NOT NULL DEFAULT 0, items TEXT NOT NULL DEFAULT "[]", provided_at TEXT NOT NULL DEFAULT "", notes TEXT NOT NULL DEFAULT "", created_by TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()))',
      'CREATE TABLE IF NOT EXISTS crm_notes (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT "", type TEXT NOT NULL DEFAULT "note", content TEXT NOT NULL DEFAULT "", created_by TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()))'
    ];
    for (const sql of crmSetup) { try { await db.prepare(sql).run(); } catch (_) {} }
    await db.prepare('UPDATE orgs SET crm_enabled = ? WHERE id = ?').bind(enabled, orgId).run();
    return json({ ok: true, crm_enabled: enabled });
  }

  /* ─── POST /api/admin/enable-tool ─── enable/disable a tool for an org by email (from request flow) */
  if (path === '/admin/enable-tool' && method === 'POST') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const { org_email, org_id, tool, enabled } = body;
    if ((!org_email && !org_id) || !tool) return json({ error: 'missing fields' }, 400);
    const val = enabled ? 1 : 0;
    if (tool === 'website') {
      const clause = org_id ? 'WHERE id = ?' : 'WHERE email = ?';
      await db.prepare('UPDATE orgs SET website_enabled = ? ' + clause).bind(val, org_id || org_email).run();
    } else if (tool === 'crm') {
      const crmSetup = [
        'ALTER TABLE orgs ADD COLUMN crm_enabled INTEGER NOT NULL DEFAULT 0',
        'CREATE TABLE IF NOT EXISTS beneficiaries (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, id_number TEXT NOT NULL DEFAULT "", dob TEXT NOT NULL DEFAULT "", gender TEXT NOT NULL DEFAULT "male", phone TEXT NOT NULL DEFAULT "", phone2 TEXT NOT NULL DEFAULT "", email TEXT NOT NULL DEFAULT "", city TEXT NOT NULL DEFAULT "", district TEXT NOT NULL DEFAULT "", address TEXT NOT NULL DEFAULT "", marital_status TEXT NOT NULL DEFAULT "", dependents INTEGER NOT NULL DEFAULT 0, housing_type TEXT NOT NULL DEFAULT "", income REAL NOT NULL DEFAULT 0, employment_status TEXT NOT NULL DEFAULT "", category TEXT NOT NULL DEFAULT "needy", status TEXT NOT NULL DEFAULT "active", notes TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
        'CREATE TABLE IF NOT EXISTS crm_requests (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, service_type TEXT NOT NULL DEFAULT "other", title TEXT NOT NULL DEFAULT "", description TEXT NOT NULL DEFAULT "", amount REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT "pending", priority TEXT NOT NULL DEFAULT "normal", assigned_to TEXT NOT NULL DEFAULT "", due_date TEXT NOT NULL DEFAULT "", resolution TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch()))',
        'CREATE TABLE IF NOT EXISTS crm_aids (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT "", aid_type TEXT NOT NULL DEFAULT "financial", amount REAL NOT NULL DEFAULT 0, items TEXT NOT NULL DEFAULT "[]", provided_at TEXT NOT NULL DEFAULT "", notes TEXT NOT NULL DEFAULT "", created_by TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()))',
        'CREATE TABLE IF NOT EXISTS crm_notes (id TEXT PRIMARY KEY, org_id TEXT NOT NULL, beneficiary_id TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT "", type TEXT NOT NULL DEFAULT "note", content TEXT NOT NULL DEFAULT "", created_by TEXT NOT NULL DEFAULT "", created_at INTEGER NOT NULL DEFAULT (unixepoch()))'
      ];
      for (const sql of crmSetup) { try { await db.prepare(sql).run(); } catch (_) {} }
      const clause = org_id ? 'WHERE id = ?' : 'WHERE email = ?';
      await db.prepare('UPDATE orgs SET crm_enabled = ? ' + clause).bind(val, org_id || org_email).run();
    } else {
      return json({ error: 'unknown tool' }, 400);
    }
    const findClause = org_id ? 'WHERE id = ?' : 'WHERE email = ?';
    const org = await db.prepare('SELECT id, name FROM orgs ' + findClause).bind(org_id || org_email).first();
    return json({ ok: true, org_id: org && org.id, org_name: org && org.name });
  }

  /* ─── DELETE /api/orgs/:id ─── (admin) */
  const orgDelMatch = path.match(/^\/orgs\/([^/]+)$/);
  if (orgDelMatch && method === 'DELETE') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    await db.prepare('DELETE FROM orgs WHERE id = ?').bind(orgDelMatch[1]).run();
    return json({ ok: true });
  }

  /* ─── GET /api/site ─── full site content for editing */
  if (path === '/site' && method === 'GET') {
    const row = await db.prepare('SELECT data FROM site_content WHERE id = ?').bind('main').first();
    return json(row ? JSON.parse(row.data) : {});
  }

  /* ─── PUT /api/site ─── update landing-page content */
  if (path === '/site' && method === 'PUT') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    await db.prepare('INSERT OR REPLACE INTO site_content (id, data, updated_at) VALUES (?, ?, unixepoch())')
      .bind('main', JSON.stringify(body)).run();
    return json({ ok: true });
  }

  /* ─── GET /api/admin/grants ─── admin: list all grant opportunities */
  if (path === '/admin/grants' && method === 'GET') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    try {
      const { results } = await db.prepare('SELECT * FROM grant_opportunities ORDER BY created_at DESC').all();
      return json((results || []).map(function(g) {
        return Object.assign({}, g, { domains: JSON.parse(g.domains || '[]') });
      }));
    } catch (e) { return json([]); }
  }

  /* ─── POST /api/admin/grants ─── admin: create grant opportunity */
  if (path === '/admin/grants' && method === 'POST') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    let body; try { body = await request.json(); } catch(e) { return json({ error: 'Bad request' }, 400); }
    if (!(body.funder_name||'').trim()) return json({ error: 'funder_name required' }, 400);
    const id = 'gr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      await db.prepare(
        'INSERT INTO grant_opportunities (id,funder_name,funder_type,grant_type,description,submission_start,submission_end,domains,amount_min,amount_max,amount_note,url,logo_url,brand_color,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(id, (body.funder_name||'').trim(), body.funder_type||'government', body.grant_type||'',
        body.description||'', body.submission_start||'', body.submission_end||'',
        JSON.stringify(Array.isArray(body.domains)?body.domains:[]),
        body.amount_min||0, body.amount_max||0, body.amount_note||'', body.url||'',
        body.logo_url||'', body.brand_color||'', body.is_active===false ? 0 : 1).run();
      return json({ ok: true, id }, 201);
    } catch(e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── PUT /api/admin/grants/:id ─── admin: update grant opportunity */
  const grantUpdateMatch = path.match(/^\/admin\/grants\/([^/]+)$/);
  if (grantUpdateMatch && method === 'PUT') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    let body; try { body = await request.json(); } catch(e) { return json({ error: 'Bad request' }, 400); }
    if (!(body.funder_name||'').trim()) return json({ error: 'funder_name required' }, 400);
    try {
      await db.prepare(
        'UPDATE grant_opportunities SET funder_name=?,funder_type=?,grant_type=?,description=?,submission_start=?,submission_end=?,domains=?,amount_min=?,amount_max=?,amount_note=?,url=?,logo_url=?,brand_color=?,is_active=?,updated_at=unixepoch() WHERE id=?'
      ).bind((body.funder_name||'').trim(), body.funder_type||'government', body.grant_type||'',
        body.description||'', body.submission_start||'', body.submission_end||'',
        JSON.stringify(Array.isArray(body.domains)?body.domains:[]),
        body.amount_min||0, body.amount_max||0, body.amount_note||'', body.url||'',
        body.logo_url||'', body.brand_color||'', body.is_active===false ? 0 : 1, grantUpdateMatch[1]).run();
      return json({ ok: true });
    } catch(e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── DELETE /api/admin/grants/:id ─── admin: delete grant opportunity */
  const grantDeleteMatch = path.match(/^\/admin\/grants\/([^/]+)$/);
  if (grantDeleteMatch && method === 'DELETE') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    try {
      await db.prepare('DELETE FROM grant_opportunities WHERE id=?').bind(grantDeleteMatch[1]).run();
      return json({ ok: true });
    } catch(e) { return json({ error: 'db_error', detail: e.message }, 500); }
  }

  /* ─── GET /api/resources ─── admin: get portal resources */
  if (path === '/resources' && method === 'GET') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const row = await db.prepare('SELECT data FROM site_content WHERE id = ?').bind('resources').first();
    return json(row ? JSON.parse(row.data) : null);
  }

  /* ─── PUT /api/resources ─── admin: save portal resources */
  if (path === '/resources' && method === 'PUT') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    if (!Array.isArray(body)) return json({ error: 'expected array' }, 400);
    await db.prepare('INSERT OR REPLACE INTO site_content (id, data, updated_at) VALUES (?, ?, unixepoch())')
      .bind('resources', JSON.stringify(body)).run();
    return json({ ok: true });
  }

  /* ─── GET /api/requests ─── list service requests */
  if (path === '/requests' && method === 'GET') {
    const { results } = await db.prepare(
      'SELECT * FROM service_requests ORDER BY created_at DESC'
    ).all();
    return json(results);
  }

  /* ─── PUT /api/requests/:id ─── update status / notes / assignee */
  const reqUpdateMatch = path.match(/^\/requests\/([^/]+)$/);
  if (reqUpdateMatch && method === 'PUT') {
    const rid = reqUpdateMatch[1];
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const fields = [], vals = [];
    ['status', 'notes', 'assignee', 'client_note'].forEach(function (k) {
      if (body[k] !== undefined) { fields.push(k + ' = ?'); vals.push(body[k]); }
    });
    if (!fields.length) return json({ error: 'nothing to update' }, 400);
    vals.push(rid);
    await db.prepare('UPDATE service_requests SET ' + fields.join(', ') + ' WHERE id = ?').bind(...vals).run();
    return json({ ok: true });
  }

  /* ─── DELETE /api/requests/:id ─── */
  const reqDeleteMatch = path.match(/^\/requests\/([^/]+)$/);
  if (reqDeleteMatch && method === 'DELETE') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    await db.prepare('DELETE FROM service_requests WHERE id = ?').bind(reqDeleteMatch[1]).run();
    return json({ ok: true });
  }

  /* ─── GET /api/workspace ─── */
  if (path === '/workspace' && method === 'GET') {
    const row = await db.prepare('SELECT data FROM workspace WHERE id = ?').bind('main').first();
    const data = row ? JSON.parse(row.data) : {};
    return json(data);
  }

  /* ─── PUT /api/workspace ─── */
  if (path === '/workspace' && method === 'PUT') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    // Never store user credentials in workspace
    delete body.users;
    await db.prepare('INSERT OR REPLACE INTO workspace (id, data, updated_at) VALUES (?, ?, unixepoch())')
      .bind('main', JSON.stringify(body)).run();
    return json({ ok: true });
  }

  /* ─── GET /api/users ─── */
  if (path === '/users' && method === 'GET') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const { results } = await db.prepare('SELECT id, name, email, role, must_change_pass, created_at FROM users ORDER BY created_at').all();
    return json(results);
  }

  /* ─── POST /api/users ─── */
  if (path === '/users' && method === 'POST') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const email = (body.email || '').toLowerCase().trim();
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return json({ error: 'email_exists' }, 409);
    const id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const mustChange = body.password ? 0 : 1;
    const passHash = body.password ? djb2(body.password) : djb2('__pending__' + id);
    await db.prepare('INSERT INTO users (id, name, email, password_hash, role, must_change_pass) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, body.name || '', email, passHash, body.role || 'user', mustChange).run();
    const resp = { id, name: body.name, email, role: body.role || 'user', must_change_pass: mustChange };
    // For first-login users, return an invite token so the admin can share a setup link
    if (mustChange) {
      resp.inviteToken = await signJWT({ id, name: body.name, email, role: body.role || 'user', action: 'setup' }, jwtSecret);
    }
    return json(resp, 201);
  }

  /* ─── GET /api/users/:id/invite ─── regenerate a setup link for a pending user */
  const inviteMatch = path.match(/^\/users\/([^/]+)\/invite$/);
  if (inviteMatch && method === 'GET') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const uid = inviteMatch[1];
    const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(uid).first();
    if (!u) return json({ error: 'not_found' }, 404);
    const inviteToken = await signJWT({ id: u.id, name: u.name, email: u.email, role: u.role, action: 'setup' }, jwtSecret);
    return json({ inviteToken, name: u.name, email: u.email });
  }

  /* ─── PUT /api/users/:id ─── */
  const userUpdateMatch = path.match(/^\/users\/([^/]+)$/);
  if (userUpdateMatch && method === 'PUT') {
    const uid = userUpdateMatch[1];
    if (me.role !== 'admin' && me.id !== uid) return json({ error: 'Forbidden' }, 403);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    if (body.password) {
      await db.prepare('UPDATE users SET password_hash = ?, must_change_pass = 0 WHERE id = ?')
        .bind(djb2(body.password), uid).run();
    }
    if (body.name) {
      await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(body.name, uid).run();
    }
    if (body.role && me.role === 'admin') {
      await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, uid).run();
    }
    return json({ ok: true });
  }

  /* ─── DELETE /api/users/:id ─── */
  const userDeleteMatch = path.match(/^\/users\/([^/]+)$/);
  if (userDeleteMatch && method === 'DELETE') {
    if (me.role !== 'admin') return json({ error: 'Forbidden' }, 403);
    const uid = userDeleteMatch[1];
    if (uid === me.id) return json({ error: 'Cannot delete yourself' }, 400);
    await db.prepare('DELETE FROM users WHERE id = ?').bind(uid).run();
    return json({ ok: true });
  }

  return json({ error: 'Not found' }, 404);
}
