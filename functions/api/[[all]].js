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

  /* ─── PUBLIC: POST /api/org/login ─── association login */
  if (path === '/org/login' && method === 'POST') {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const email = (body.email || '').toLowerCase().trim();
    const pass  = (body.password || '');
    const org = await db.prepare('SELECT * FROM orgs WHERE email = ?').bind(email).first();
    if (!org || org.password_hash !== djb2(pass)) return json({ error: 'invalid_credentials' }, 401);
    const token = await signJWT({ id: org.id, name: org.name, email: org.email, kind: 'org' }, jwtSecret);
    return json({
      token,
      org: { id: org.id, name: org.name, email: org.email, plan_start: org.plan_start,
             progress: JSON.parse(org.progress || '{}'), contact_name: org.contact_name,
             phone: org.phone, city: org.city, license_no: org.license_no }
    });
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
    await db.prepare(
      'UPDATE orgs SET name = ?, contact_name = ?, phone = ?, city = ?, license_no = ?, last_active = unixepoch() WHERE id = ?'
    ).bind(
      name,
      (body.contact_name || '').trim(),
      (body.phone || '').trim(),
      (body.city || '').trim(),
      (body.license_no || '').trim(),
      orgMe.id
    ).run();
    const org = await db.prepare('SELECT * FROM orgs WHERE id = ?').bind(orgMe.id).first();
    return json({ ok: true, org: { id: org.id, name: org.name, email: org.email, plan_start: org.plan_start,
      progress: JSON.parse(org.progress || '{}'), contact_name: org.contact_name,
      phone: org.phone, city: org.city, license_no: org.license_no } });
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
    // pull the org's own contact details so the admin sees who's asking
    const o = await db.prepare('SELECT name, email, contact_name, phone FROM orgs WHERE id = ?').bind(orgMe.id).first();
    const id = 'req_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.prepare(
      'INSERT INTO service_requests (id, name, org, phone, email, service, budget, message, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id,
      (o && o.contact_name) || (o && o.name) || orgMe.name || '',
      (o && o.name) || orgMe.name || '',
      (o && o.phone) || '',
      (o && o.email) || orgMe.email || '',
      service,
      '',
      (body.message || '').trim(),
      'portal'
    ).run();
    return json({ ok: true, id }, 201);
  }

  /* ─── CRM helper: verify org has CRM enabled ─── */
  async function crmGuard() {
    if (!orgMe || orgMe.kind !== 'org') return false;
    const row = await db.prepare('SELECT crm_enabled FROM orgs WHERE id = ?').bind(orgMe.id).first();
    return !!(row && row.crm_enabled);
  }

  /* ─── GET /api/crm/dashboard ─── */
  if (path === '/crm/dashboard' && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    const [stats, recentBens, pendingReqs] = await Promise.all([
      db.prepare(
        'SELECT (SELECT COUNT(*) FROM beneficiaries WHERE org_id=?) AS total_bens,' +
        '(SELECT COUNT(*) FROM beneficiaries WHERE org_id=? AND status="active") AS active_bens,' +
        '(SELECT COUNT(*) FROM crm_requests WHERE org_id=? AND status="pending") AS pending_reqs,' +
        '(SELECT COUNT(*) FROM crm_requests WHERE org_id=? AND status="reviewing") AS reviewing_reqs,' +
        '(SELECT COUNT(*) FROM crm_requests WHERE org_id=? AND status="completed") AS done_reqs,' +
        '(SELECT COALESCE(SUM(amount),0) FROM crm_aids WHERE org_id=?) AS total_spent'
      ).bind(orgMe.id, orgMe.id, orgMe.id, orgMe.id, orgMe.id, orgMe.id).first(),
      db.prepare('SELECT id,name,category,status,city,created_at FROM beneficiaries WHERE org_id=? ORDER BY created_at DESC LIMIT 6').bind(orgMe.id).all(),
      db.prepare(
        'SELECT r.*,b.name AS ben_name,b.category AS ben_cat FROM crm_requests r ' +
        'JOIN beneficiaries b ON r.beneficiary_id=b.id ' +
        'WHERE r.org_id=? AND r.status IN ("pending","reviewing") ' +
        'ORDER BY CASE r.priority WHEN "urgent" THEN 0 WHEN "high" THEN 1 ELSE 2 END, r.created_at LIMIT 10'
      ).bind(orgMe.id).all()
    ]);
    return json({ ...stats, recent_bens: recentBens.results, pending_reqs: pendingReqs.results });
  }

  /* ─── GET /api/crm/beneficiaries ─── */
  if (path === '/crm/beneficiaries' && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
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
  }

  /* ─── POST /api/crm/beneficiaries ─── */
  if (path === '/crm/beneficiaries' && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    if (!(body.name || '').trim()) return json({ error: 'name_required' }, 400);
    const id = 'ben_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.prepare(
      'INSERT INTO beneficiaries (id,org_id,name,id_number,dob,gender,phone,phone2,email,city,district,address,marital_status,dependents,housing_type,income,employment_status,category,status,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(id, orgMe.id, (body.name||'').trim(), (body.id_number||'').trim(), (body.dob||'').trim(),
      body.gender||'male', (body.phone||'').trim(), (body.phone2||'').trim(), (body.email||'').trim(),
      (body.city||'').trim(), (body.district||'').trim(), (body.address||'').trim(),
      body.marital_status||'', parseInt(body.dependents)||0, body.housing_type||'',
      parseFloat(body.income)||0, body.employment_status||'', body.category||'needy',
      body.status||'active', (body.notes||'').trim()).run();
    return json({ ok: true, id }, 201);
  }

  /* ─── GET /PUT /api/crm/beneficiaries/:id ─── */
  const crmBenMatch = path.match(/^\/crm\/beneficiaries\/([^/]+)$/);
  if (crmBenMatch && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    const benId = crmBenMatch[1];
    const ben = await db.prepare('SELECT * FROM beneficiaries WHERE id=? AND org_id=?').bind(benId, orgMe.id).first();
    if (!ben) return json({ error: 'not_found' }, 404);
    const [reqs, aids, notes] = await Promise.all([
      db.prepare('SELECT * FROM crm_requests WHERE beneficiary_id=? ORDER BY created_at DESC').bind(benId).all(),
      db.prepare('SELECT * FROM crm_aids WHERE beneficiary_id=? ORDER BY created_at DESC').bind(benId).all(),
      db.prepare('SELECT * FROM crm_notes WHERE beneficiary_id=? ORDER BY created_at DESC').bind(benId).all()
    ]);
    return json({ ben, requests: reqs.results, aids: aids.results, notes: notes.results });
  }
  if (crmBenMatch && method === 'PUT') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    const benId = crmBenMatch[1];
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    await db.prepare(
      'UPDATE beneficiaries SET name=?,id_number=?,dob=?,gender=?,phone=?,phone2=?,email=?,city=?,district=?,address=?,marital_status=?,dependents=?,housing_type=?,income=?,employment_status=?,category=?,status=?,notes=?,updated_at=unixepoch() WHERE id=? AND org_id=?'
    ).bind((body.name||'').trim(), (body.id_number||'').trim(), (body.dob||'').trim(),
      body.gender||'male', (body.phone||'').trim(), (body.phone2||'').trim(), (body.email||'').trim(),
      (body.city||'').trim(), (body.district||'').trim(), (body.address||'').trim(),
      body.marital_status||'', parseInt(body.dependents)||0, body.housing_type||'',
      parseFloat(body.income)||0, body.employment_status||'', body.category||'needy',
      body.status||'active', (body.notes||'').trim(), benId, orgMe.id).run();
    return json({ ok: true });
  }
  if (crmBenMatch && method === 'DELETE') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    const benId = crmBenMatch[1];
    await Promise.all([
      db.prepare('DELETE FROM crm_notes WHERE beneficiary_id=? AND org_id=?').bind(benId, orgMe.id).run(),
      db.prepare('DELETE FROM crm_aids WHERE beneficiary_id=? AND org_id=?').bind(benId, orgMe.id).run(),
      db.prepare('DELETE FROM crm_requests WHERE beneficiary_id=? AND org_id=?').bind(benId, orgMe.id).run(),
      db.prepare('DELETE FROM beneficiaries WHERE id=? AND org_id=?').bind(benId, orgMe.id).run()
    ]);
    return json({ ok: true });
  }

  /* ─── GET /api/crm/requests ─── */
  if (path === '/crm/requests' && method === 'GET') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || '';
    let sql = 'SELECT r.*,b.name AS ben_name,b.category AS ben_cat FROM crm_requests r JOIN beneficiaries b ON r.beneficiary_id=b.id WHERE r.org_id=?';
    const params = [orgMe.id];
    if (status) { sql += ' AND r.status=?'; params.push(status); }
    sql += ' ORDER BY CASE r.priority WHEN "urgent" THEN 0 WHEN "high" THEN 1 ELSE 2 END, r.created_at DESC LIMIT 300';
    const { results } = await db.prepare(sql).bind(...params).all();
    return json(results);
  }

  /* ─── POST /api/crm/requests ─── */
  if (path === '/crm/requests' && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    if (!body.beneficiary_id) return json({ error: 'beneficiary_id required' }, 400);
    const id = 'crq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.prepare(
      'INSERT INTO crm_requests (id,org_id,beneficiary_id,service_type,title,description,amount,status,priority,due_date) VALUES (?,?,?,?,?,?,?,?,?,?)'
    ).bind(id, orgMe.id, body.beneficiary_id, body.service_type||'other',
      (body.title||'').trim(), (body.description||'').trim(),
      parseFloat(body.amount)||0, 'pending', body.priority||'normal', (body.due_date||'').trim()).run();
    return json({ ok: true, id }, 201);
  }

  /* ─── PATCH /api/crm/requests/:id ─── */
  const crmReqMatch = path.match(/^\/crm\/requests\/([^/]+)$/);
  if (crmReqMatch && method === 'PATCH') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const fields = [], vals = [];
    ['status','priority','assigned_to','due_date','resolution','title','description','amount'].forEach(k => {
      if (body[k] !== undefined) { fields.push(k+'=?'); vals.push(body[k]); }
    });
    if (!fields.length) return json({ error: 'nothing' }, 400);
    fields.push('updated_at=unixepoch()'); vals.push(crmReqMatch[1], orgMe.id);
    await db.prepare('UPDATE crm_requests SET '+fields.join(',')+' WHERE id=? AND org_id=?').bind(...vals).run();
    return json({ ok: true });
  }

  /* ─── POST /api/crm/aids ─── */
  if (path === '/crm/aids' && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
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
  }
  const crmAidMatch = path.match(/^\/crm\/aids\/([^/]+)$/);
  if (crmAidMatch && method === 'DELETE') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    await db.prepare('DELETE FROM crm_aids WHERE id=? AND org_id=?').bind(crmAidMatch[1], orgMe.id).run();
    return json({ ok: true });
  }

  /* ─── POST /api/crm/notes ─── */
  if (path === '/crm/notes' && method === 'POST') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    let body; try { body = await request.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    const id = 'nt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.prepare(
      'INSERT INTO crm_notes (id,org_id,beneficiary_id,request_id,type,content,created_by) VALUES (?,?,?,?,?,?,?)'
    ).bind(id, orgMe.id, body.beneficiary_id, body.request_id||'',
      body.type||'note', (body.content||'').trim(), (body.created_by||'').trim()).run();
    return json({ ok: true, id }, 201);
  }
  const crmNoteMatch = path.match(/^\/crm\/notes\/([^/]+)$/);
  if (crmNoteMatch && method === 'DELETE') {
    if (!await crmGuard()) return json({ error: 'Unauthorized' }, 401);
    await db.prepare('DELETE FROM crm_notes WHERE id=? AND org_id=?').bind(crmNoteMatch[1], orgMe.id).run();
    return json({ ok: true });
  }

  /* ── Auth required for all routes below (team/admin only) ── */
  const authHeader = request.headers.get('Authorization') || '';
  const rawToken = authHeader.replace('Bearer ', '');
  const me = await verifyJWT(rawToken, jwtSecret);
  if (!me || me.action || me.kind === 'org') return json({ error: 'Unauthorized' }, 401);

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
    // Ensure column exists (safe no-op if already present)
    try { await db.prepare('ALTER TABLE orgs ADD COLUMN crm_enabled INTEGER NOT NULL DEFAULT 0').run(); } catch (_) {}
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
      try { await db.prepare('ALTER TABLE orgs ADD COLUMN crm_enabled INTEGER NOT NULL DEFAULT 0').run(); } catch (_) {}
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
    ['status', 'notes', 'assignee'].forEach(function (k) {
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
