// À placer dans le dépôt PUBLIC : netlify/functions/db.js
// Variables Netlify requises : GITHUB_TOKEN, ADMIN_PASSWORD
// Variables facultatives : GITHUB_REPO (défaut ndiayejoseph123-code/Maclassdb), DB_FILE (défaut classe.json), HIDE_DETAILS=1
const crypto = require('crypto');

const REPO = process.env.GITHUB_REPO || 'ndiayejoseph123-code/Maclassdb';
const FILE = process.env.DB_FILE || 'classe.json';
const URL_API = `https://api.github.com/repos/${REPO}/contents/${FILE}`;

const ghHeaders = () => ({
  Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'maclasse-netlify',
  'X-GitHub-Api-Version': '2022-11-28'
});

const h = s => crypto.createHash('sha256').update(String(s)).digest();
const isAdmin = p => !!p && !!process.env.ADMIN_PASSWORD &&
  crypto.timingSafeEqual(h(p), h(process.env.ADMIN_PASSWORD));

async function readDb() {
  const r = await fetch(URL_API, { headers: ghHeaders() });
  if (r.status === 404) return { data: null, sha: null };
  if (!r.ok) throw new Error('GitHub ' + r.status);
  const j = await r.json();
  const txt = Buffer.from(j.content, 'base64').toString('utf8');
  return { data: txt.trim() ? JSON.parse(txt) : null, sha: j.sha };
}

async function writeDb(data) {
  const cur = await readDb();
  const body = {
    message: 'Mise à jour classe ' + new Date().toISOString(),
    content: Buffer.from(JSON.stringify(data, null, 1)).toString('base64')
  };
  if (cur.sha) body.sha = cur.sha;
  const r = await fetch(URL_API, {
    method: 'PUT',
    headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('GitHub ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

exports.handler = async (event) => {
  const json = (code, obj) => ({
    statusCode: code,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj)
  });
  try {
    if (!process.env.GITHUB_TOKEN || !process.env.ADMIN_PASSWORD)
      return json(500, { error: 'Variables Netlify manquantes (GITHUB_TOKEN, ADMIN_PASSWORD)' });

    let body = {};
    if (event.httpMethod === 'POST') {
      try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'JSON invalide' }); }
    }
    const admin = isAdmin(body.password);

    // Lecture publique (visiteurs) ou complète (admin)
    if (event.httpMethod === 'GET' || body.action === 'load') {
      if (event.httpMethod === 'POST' && !admin) {
        await new Promise(r => setTimeout(r, 800));
        return json(401, { error: 'Mot de passe incorrect' });
      }
      const { data } = await readDb();
      if (data && !admin && process.env.HIDE_DETAILS === '1') data.info = {};
      return json(200, { data, admin });
    }

    if (event.httpMethod !== 'POST') return json(405, { error: 'Méthode non permise' });

    if (!admin) {
      await new Promise(r => setTimeout(r, 800));
      return json(401, { error: 'Mot de passe incorrect' });
    }

    if (body.action === 'login') return json(200, { ok: true });

    if (body.action === 'save') {
      const d = body.data;
      if (!d || typeof d !== 'object' || !Array.isArray(d.tables)) return json(400, { error: 'Données invalides' });
      if (JSON.stringify(d).length > 900000) return json(413, { error: 'Données trop volumineuses' });
      await writeDb(d);
      return json(200, { ok: true });
    }

    return json(400, { error: 'Action inconnue' });
  } catch (e) {
    return json(500, { error: String(e.message || e) });
  }
};
