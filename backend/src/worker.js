import { createHmac, pbkdf2, timingSafeEqual } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import qrcode from 'qrcode-generator';

const sitePath = '/face-id-voice/';
const encoder = new TextEncoder();
const token = () => toBase64(crypto.getRandomValues(new Uint8Array(32)));
const toBase64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const fromBase64 = value => Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
const hash = async value => toBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

const acceptablePassword = value => typeof value === 'string' && value.length >= 15 &&
  value.length <= 128 && value.trim().length >= 15 && new Set(value).size >= 5;
function derivePassword(password, salt, pepper) {
  if (!pepper) throw Error('Password secret is unavailable');
  const keyedPassword = createHmac('sha256', pepper).update(password).digest();
  return new Promise((resolve, reject) => {
    pbkdf2(keyedPassword, fromBase64(salt), 100_000, 32, 'sha256',
      (error, result) => error ? reject(error) : resolve(result));
  });
}

function deviceName(request) {
  const ua = request.headers.get('User-Agent') || '';
  const platform = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' :
    /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' :
    /Macintosh/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const browser = /Edg/.test(ua) ? 'Edge' : /Chrome|CriOS/.test(ua) ? 'Chrome' :
    /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'Navegador';
  return browser + ' · ' + platform;
}

function profileFrom(input) {
  const text = key => typeof input?.[key] === 'string' ? input[key].trim() : '';
  const profile = {
    email: text('email').toLowerCase(), name: text('name'), surname: text('surname'),
    age: input?.age, sex: text('sex'), country: text('country'),
    province: text('province'), city: text('city'),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) || profile.email.length > 254) return;
  if (!profile.name || profile.name.length > 48 || !profile.surname || profile.surname.length > 60) return;
  if (!Number.isInteger(profile.age) || profile.age < 1 || profile.age > 120) return;
  if (!['femenino', 'masculino', 'otro', 'sin-declarar'].includes(profile.sex)) return;
  if (!/^[A-Z]{2}$/.test(profile.country) || !profile.province || !profile.city ||
      profile.province.length > 120 || profile.city.length > 120) return;
  return profile;
}

export default {
  async fetch(request, { DB, NOVA_WEB_ORIGIN, AUTH_PASSWORD_PEPPER, CEO_ACCOUNT_ID }) {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== NOVA_WEB_ORIGIN) {
      return Response.json({ error: 'Origen no autorizado.' }, { status: 403 });
    }
    const rpID = new URL(origin).hostname;
    const cors = {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', Vary: 'Origin',
    };
    const json = (value, status = 200) => Response.json(value, { status, headers: cors });
    const fail = (status, message) => json({ error: message }, status);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return fail(405, 'Método no disponible.');
    const query = (sql, ...parameters) => DB.prepare(sql).bind(...parameters);
    const now = Date.now();
    const event = (accountId, type, device = deviceName(request)) =>
      query('INSERT INTO account_events (account_id, type, device, created_at) VALUES (?, ?, ?, ?)', accountId, type, device, now);
    async function logEvent(accountId, type) {
      try {
        await DB.batch([
          event(accountId, type),
          query(`DELETE FROM account_events WHERE account_id = ? AND id < COALESCE(
            (SELECT id FROM account_events WHERE account_id = ? ORDER BY id DESC LIMIT 1 OFFSET 59), 0)`, accountId, accountId),
        ]);
      } catch {
        // Account changes already committed independently of activity history.
      }
    }
    try {
      const raw = await request.text();
      if (raw.length > 24_000) return fail(413, 'Solicitud demasiado grande.');
      const body = JSON.parse(raw);
      const route = new URL(request.url).pathname;
      if (route === '/password/login' || route === '/password/delete-account') {
        const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
        if (!email || email.length > 254 || typeof body.password !== 'string' ||
            body.password.length < 1 || body.password.length > 128) return fail(401, 'El correo o la contraseña no coincide.');
        const window = 15 * 60_000;
        const ipBucket = 'ip:' + await hash(request.headers.get('CF-Connecting-IP') || 'unknown');
        const accountBucket = 'account:' + await hash(email);
        const throttle = bucket => query(`INSERT INTO password_attempts (bucket, started_at, attempts)
          VALUES (?, ?, 1) ON CONFLICT(bucket) DO UPDATE SET
          attempts = CASE WHEN started_at <= ? THEN 1 ELSE attempts + 1 END,
          started_at = CASE WHEN started_at <= ? THEN excluded.started_at ELSE started_at END
          RETURNING attempts`, bucket, now, now - window, now - window);
        const [ip, perAccount] = await DB.batch([throttle(ipBucket), throttle(accountBucket),
          query('DELETE FROM password_attempts WHERE started_at < ?', now - 86_400_000)]);
        if (ip.results[0].attempts > 40 || perAccount.results[0].attempts > 10) {
          return fail(429, 'Demasiados intentos. Volvé a probar en unos minutos.');
        }
        const account = await query(`SELECT id, given_name AS name, family_name AS surname, email, password_salt, password_hash
          FROM accounts WHERE email = ?`, email).first();
        const candidate = await derivePassword(body.password, account?.password_salt || 'AAAAAAAAAAAAAAAAAAAAAA', AUTH_PASSWORD_PEPPER);
        const expected = account?.password_hash ? fromBase64(account.password_hash) : new Uint8Array(32);
        if (!timingSafeEqual(candidate, expected) || !account?.password_hash ||
            (body.faceAccountId && body.faceAccountId !== account.id)) return fail(401, 'El correo o la contraseña no coincide.');
        if (route === '/password/delete-account') {
          if (!validToken(body.token)) return fail(401, 'Volvé a iniciar sesión.');
          const result = await query(`DELETE FROM accounts WHERE id = ? AND EXISTS (
            SELECT 1 FROM sessions WHERE account_id = ? AND token_hash = ? AND expires_at > ?
          )`, account.id, account.id, await hash(body.token), now).run();
          return result.meta.changes ? json({ deleted: true, credentialIds: [account.id] }) : fail(401, 'Volvé a iniciar sesión.');
        }
        const session = token();
        await DB.batch([
          query(`INSERT INTO sessions (token_hash, account_id, expires_at, device_id, device_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`, await hash(session), account.id, now + 7 * 86_400_000, token(), deviceName(request), now),
          query('DELETE FROM password_attempts WHERE bucket = ?', accountBucket),
        ]);
        await logEvent(account.id, 'signed_in');
        return json({ session, account: { id: account.id, name: account.name, surname: account.surname, email: account.email, hasPassword: true } });
      }
      if (route === '/registration/result') {
        if (!validToken(body.id) || !validToken(body.token)) return fail(400, 'Solicitud inválida.');
        const account = await query(`SELECT a.id, a.given_name AS name, a.family_name AS surname, a.email
          FROM qr_requests q JOIN accounts a ON a.id = q.id
          WHERE q.id = ? AND q.phone_token_hash = ? AND q.phone_origin = ?
            AND q.purpose = 'registration' AND q.consumed_at IS NOT NULL AND q.expires_at > ?`,
          body.id, await hash(body.token), origin, now).first();
        return json({ account });
      }
      if (route === '/room/shared/get' || route === '/room/shared/save') {
        if (!validToken(body.share)) return fail(404, 'Este enlace no está disponible.');
        if (route === '/room/shared/get') {
          const page = await query(`SELECT p.title, p.content, p.revision, s.permission
            FROM room_shares s JOIN room_pages p ON p.account_id = s.account_id AND p.id = s.page_id
            WHERE s.token = ?`, body.share).first();
          return page ? json(page) : fail(404, 'Este enlace no está disponible.');
        }
        const title = typeof body.title === 'string' ? body.title.trim() : '';
        if (!title || title.length > 120 || typeof body.content !== 'string' || body.content.length > 10000 ||
            !Number.isSafeInteger(body.revision) || body.revision < 1) return fail(400, 'Revisá el título y el contenido.');
        const result = await query(`UPDATE room_pages SET title = ?, content = ?, revision = revision + 1, updated_at = ?
          WHERE revision = ? AND (account_id, id) IN (
            SELECT account_id, page_id FROM room_shares WHERE token = ? AND permission = 'edit'
          )`, title, body.content, now, body.revision, body.share).run();
        if (result.meta.changes) return json({ revision: body.revision + 1 });
        const link = await query('SELECT permission FROM room_shares WHERE token = ?', body.share).first();
        return link?.permission === 'edit'
          ? fail(409, 'La página cambió. Copiá tus cambios antes de volver a abrirla.')
          : fail(403, 'El enlace ya no permite editar.');
      }
      if (route === '/new') {
        if (!['sign-in', 'registration'].includes(body.purpose)) return fail(400, 'Opción incorrecta.');
        const id = token(), desktop = token(), phone = token(), expires = now + 5 * 60_000;
        await DB.batch([
          query('DELETE FROM qr_requests WHERE expires_at < ?', now),
          query('DELETE FROM sessions WHERE expires_at < ?', now),
          query(`INSERT INTO qr_requests (id, desktop_token_hash, phone_token_hash, purpose, expires_at, desktop_origin, phone_origin)
            VALUES (?, ?, ?, ?, ?, ?, ?)`, id, await hash(desktop), await hash(phone), body.purpose, expires, origin, origin),
        ]);
        const url = new URL(sitePath, origin);
        url.hash = 'qr=' + id + '.' + phone;
        const qr = qrcode(0, 'M');
        qr.addData(url.href);
        qr.make();
        return json({ id, desktop, phone, expires, image: qr.createDataURL(4, 12) });
      }
      if (['/me', '/logout', '/devices', '/devices/revoke', '/devices/revoke-others', '/devices/rename', '/activity', '/room/list', '/room/order', '/room/entries/list', '/room/entries/add', '/room/entries/remove', '/room/entries/toggle', '/room/folders/save', '/room/folders/delete', '/room/folders/move', '/room/pages/move', '/room/pages/get', '/room/share/settings', '/room/pages/save', '/room/pages/delete', '/passkeys', '/passkeys/rename', '/passkeys/revoke', '/profile/update', '/account/delete/options', '/account/delete', '/passkey/options', '/passkey/register', '/face/credential'].includes(route)) {
        if (!validToken(body.token)) return fail(401, 'Volvé a iniciar sesión.');
        const key = await hash(body.token);
        if (route === '/logout') {
          await query('DELETE FROM sessions WHERE token_hash = ?', key).run();
          return json({});
        }
        const account = await query(`SELECT a.id, a.given_name AS name, a.family_name AS surname, a.email,
          (a.password_hash IS NOT NULL) AS hasPassword, a.age, a.sex, a.nationality AS country, a.province, a.locality AS city, a.created_at AS createdAt,
          (SELECT COUNT(*) FROM sessions active WHERE active.account_id = a.id AND active.expires_at > ?) AS sessionCount,
          (SELECT COUNT(*) FROM passkeys p WHERE p.account_id = a.id AND p.rp_id = ?) AS passkeyCount
          FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?`, now, rpID, key, now).first();
        if (!account) return fail(401, 'Volvé a iniciar sesión.');
        if (route === '/me' && account.id === CEO_ACCOUNT_ID) {
          account.ceo = await query(`SELECT
            (SELECT COUNT(*) FROM accounts) AS accounts,
            (SELECT MAX(created_at) FROM account_events WHERE account_id = ? AND type IN ('signed_in','account_created')) AS lastSignIn`,
            account.id).first();
        }
        if (route === '/account/delete/options') {
          const { results } = await query('SELECT id FROM passkeys WHERE account_id = ? AND rp_id = ?', account.id, rpID).all();
          if (!results.length) return fail(409, 'Agregá una clave de acceso para confirmar el borrado.');
          const options = await generateAuthenticationOptions({
            rpID, userVerification: 'required', allowCredentials: results.map(({ id }) => ({ id })),
          });
          await query(`UPDATE sessions SET passkey_challenge = ?, passkey_challenge_expires_at = ?
            WHERE token_hash = ? AND expires_at > ?`, 'delete:' + options.challenge, now + 5 * 60_000, key, now).run();
          return json(options);
        }
        if (route === '/account/delete') {
          const session = await query(`SELECT passkey_challenge AS challenge FROM sessions
            WHERE token_hash = ? AND expires_at > ? AND passkey_challenge_expires_at > ?`, key, now, now).first();
          if (!session?.challenge?.startsWith('delete:')) return fail(410, 'Volvé a iniciar la confirmación.');
          const passkey = await query('SELECT * FROM passkeys WHERE id = ? AND account_id = ? AND rp_id = ?',
            body.response?.id ?? '', account.id, rpID).first();
          if (!passkey) return fail(401, 'Usá una clave de acceso de esta cuenta.');
          try {
            const result = await verifyAuthenticationResponse({
              response: body.response, expectedChallenge: session.challenge.slice(7),
              expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true,
              credential: { id: passkey.id, publicKey: fromBase64(passkey.public_key), counter: passkey.counter },
            });
            if (!result.verified) return fail(401, 'No se confirmó el borrado.');
          } catch {
            return fail(401, 'No se confirmó el borrado con tu clave de acceso.');
          }
          const activeChallenge = `EXISTS (SELECT 1 FROM sessions
            WHERE account_id = ? AND token_hash = ? AND passkey_challenge = ?
              AND expires_at > ? AND passkey_challenge_expires_at > ?)`;
          const proof = [account.id, key, session.challenge, now, now];
          const [credentials, , deleted] = await DB.batch([
            query('SELECT id FROM passkeys WHERE account_id = ?', account.id),
            query(`DELETE FROM qr_requests WHERE (account_id = ? OR id = ?) AND ${activeChallenge}`, account.id, account.id, ...proof),
            query(`DELETE FROM accounts WHERE id = ? AND ${activeChallenge}`, account.id, ...proof),
          ]);
          if (!deleted.meta.changes) return fail(410, 'Volvé a iniciar la confirmación.');
          return json({ deleted: true, credentialIds: credentials.results.map(({ id }) => id) });
        }
        if (route === '/room/order') {
          const { kind, parentId, ids } = body;
          if (!['folder','page'].includes(kind) || (parentId !== null && !validToken(parentId)) ||
              !Array.isArray(ids) || !ids.length || ids.length > 300 || !ids.every(validToken) ||
              new Set(ids).size !== ids.length) return fail(400, 'Orden inválido.');
          const table = kind === 'folder' ? 'room_folders' : 'room_pages';
          const parent = kind === 'folder' ? 'parent_id' : 'folder_id';
          const result = await query(`WITH requested AS (SELECT value AS id, key AS position FROM json_each(?))
            UPDATE ${table} SET sort_order = (SELECT position FROM requested WHERE requested.id = ${table}.id)
            WHERE account_id = ? AND ${parent} IS ?
              AND id IN (SELECT id FROM requested)
              AND (SELECT COUNT(*) FROM ${table} WHERE account_id = ? AND ${parent} IS ?) = ?
              AND (SELECT COUNT(*) FROM ${table} JOIN requested USING (id)
                WHERE account_id = ? AND ${parent} IS ?) = ?`,
            JSON.stringify(ids), account.id, parentId, account.id, parentId, ids.length,
            account.id, parentId, ids.length).run();
          return result.meta.changes === ids.length ? json({}) : fail(409, 'La carpeta cambió. Recargá Room y volvé a ordenar.');
        }
        if (route.startsWith('/room/entries/')) {
          const { kind, id } = body;
          if (!['reminder','date','expense'].includes(kind)) return fail(400, 'Lista inválida.');
          if (route === '/room/entries/list') {
            const { results } = await query('SELECT id, title, day, cents, done FROM room_entries WHERE account_id = ? AND kind = ? ORDER BY day, id', account.id, kind).all();
            return json({ entries: results });
          }
          if (route === '/room/entries/add') {
            const title = typeof body.title === 'string' ? body.title.trim() : '';
            const day = typeof body.day === 'string' ? body.day : '';
            const date = /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(day + 'T00:00:00Z') : NaN;
            const cents = kind === 'expense' ? body.cents : 0;
            if (!title || title.length > 120 || !Number.isFinite(date) || new Date(date).toISOString().slice(0,10) !== day ||
                !Number.isSafeInteger(cents) || cents < (kind === 'expense' ? 1 : 0) || cents > 1_000_000_000_00) {
              return fail(400, 'Revisá los datos ingresados.');
            }
            const entryId = token();
            const result = await query(`INSERT INTO room_entries (account_id, id, kind, title, day, cents)
              SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM room_entries WHERE account_id = ?) < 1000`,
              account.id, entryId, kind, title, day, cents, account.id).run();
            return result.meta.changes ? json({ id: entryId, title, day, cents, done: 0 }) : fail(409, 'Alcanzaste el límite de entradas.');
          }
          if (!validToken(id)) return fail(400, 'Entrada inválida.');
          if (route === '/room/entries/toggle') {
            if (kind !== 'reminder' || typeof body.done !== 'boolean') return fail(400, 'Estado inválido.');
            await query('UPDATE room_entries SET done = ? WHERE account_id = ? AND kind = ? AND id = ?', Number(body.done), account.id, kind, id).run();
          } else {
            await query('DELETE FROM room_entries WHERE account_id = ? AND kind = ? AND id = ?', account.id, kind, id).run();
          }
          return json({});
        }
        if (route === '/room/list') {
          const [folders, pages] = await DB.batch([
            query('SELECT id, name, parent_id AS parentId, sort_order AS sortOrder FROM room_folders WHERE account_id = ? ORDER BY name COLLATE NOCASE, id', account.id),
            query(`SELECT id, folder_id AS folderId, title, updated_at AS updatedAt, sort_order AS sortOrder
              FROM room_pages WHERE account_id = ? ORDER BY updated_at DESC, id`, account.id),
          ]);
          return json({ folders: folders.results, pages: pages.results });
        }
        if (route === '/room/folders/save') {
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!name || name.length > 70) return fail(400, 'Ingresá un nombre de hasta 70 caracteres.');
          if (body.id != null && !validToken(body.id)) return fail(400, 'Carpeta inválida.');
          const parent = body.parentId ?? null;
          if (parent !== null && !validToken(parent)) return fail(400, 'Carpeta superior inválida.');
          const id = body.id ?? token();
          const saved = body.id
            ? await query('UPDATE room_folders SET name = ? WHERE account_id = ? AND id = ?', name, account.id, id).run()
            : await query(`INSERT INTO room_folders (account_id, id, name, parent_id)
                SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM room_folders WHERE account_id = ?) < 100
                AND (? IS NULL OR EXISTS (SELECT 1 FROM room_folders WHERE account_id = ? AND id = ?))`,
              account.id, id, name, parent, account.id, parent, account.id, parent).run();
          if (!saved.meta.changes) return fail(409, body.id ? 'La carpeta ya no está disponible.' : 'Alcanzaste el límite de 100 carpetas.');
          return json({ id });
        }
        if (route === '/room/folders/move' || route === '/room/folders/delete') {
          if (!validToken(body.id)) return fail(400, 'Carpeta inválida.');
          const subtree = `WITH RECURSIVE subtree(id) AS (
            SELECT id FROM room_folders WHERE account_id = ? AND id = ?
            UNION SELECT f.id FROM room_folders f JOIN subtree s ON f.parent_id = s.id WHERE f.account_id = ?
          )`;
          if (route === '/room/folders/delete') {
            await query(subtree + ' DELETE FROM room_folders WHERE account_id = ? AND id IN (SELECT id FROM subtree)',
              account.id, body.id, account.id, account.id).run();
            return json({});
          }
          const parent = body.parentId;
          if (parent !== null && !validToken(parent)) return fail(400, 'Carpeta superior inválida.');
          const result = await query(subtree + ` UPDATE room_folders SET parent_id = ?, sort_order = NULL WHERE account_id = ? AND id = ?
            AND (? IS NULL OR (EXISTS (SELECT 1 FROM room_folders WHERE account_id = ? AND id = ?)
              AND NOT EXISTS (SELECT 1 FROM subtree WHERE id = ?)))`,
            account.id, body.id, account.id, parent, account.id, body.id, parent, account.id, parent, parent).run();
          return result.meta.changes ? json({}) : fail(409, 'No se puede mover la carpeta a ese destino.');
        }
        if (route === '/room/pages/move') {
          if (!validToken(body.id) || !validToken(body.folderId)) return fail(400, 'Destino inválido.');
          const result = await query(`UPDATE room_pages SET folder_id = ?, sort_order = NULL WHERE account_id = ? AND id = ?
            AND EXISTS (SELECT 1 FROM room_folders WHERE account_id = ? AND id = ?)`,
            body.folderId, account.id, body.id, account.id, body.folderId).run();
          return result.meta.changes ? json({}) : fail(409, 'La página o la carpeta ya no está disponible.');
        }
        if (route === '/room/share/settings') {
          if (!validToken(body.id)) return fail(400, 'Página inválida.');
          if (body.permission !== undefined) {
            if (!['off', 'read', 'edit'].includes(body.permission)) return fail(400, 'Permiso inválido.');
            if (body.permission === 'off') {
              await query('DELETE FROM room_shares WHERE account_id = ? AND page_id = ?', account.id, body.id).run();
            } else {
              const result = await query(`INSERT INTO room_shares (account_id, page_id, token, permission)
                SELECT account_id, id, ?, ? FROM room_pages WHERE account_id = ? AND id = ?
                ON CONFLICT(account_id, page_id) DO UPDATE SET permission = excluded.permission`,
                token(), body.permission, account.id, body.id).run();
              if (!result.meta.changes) return fail(404, 'La página ya no está disponible.');
            }
          }
          const share = await query('SELECT token, permission FROM room_shares WHERE account_id = ? AND page_id = ?',
            account.id, body.id).first();
          return json(share ?? { permission: 'off' });
        }
        if (route === '/room/pages/get') {
          if (!validToken(body.id)) return fail(400, 'Página inválida.');
          const page = await query(`SELECT id, folder_id AS folderId, title, content, revision, updated_at AS updatedAt
            FROM room_pages WHERE account_id = ? AND id = ?`, account.id, body.id).first();
          return page ? json(page) : fail(404, 'La página ya no está disponible.');
        }
        if (route === '/room/pages/save') {
          const title = typeof body.title === 'string' ? body.title.trim() : '';
          if (!title || title.length > 120 || typeof body.content !== 'string' || body.content.length > 10000) {
            return fail(400, 'Usá un título de hasta 120 caracteres y un texto de hasta 10.000 caracteres.');
          }
          if (body.id != null) {
            if (!validToken(body.id) || !Number.isSafeInteger(body.revision) || body.revision < 1) return fail(400, 'Página inválida.');
            const saved = await query(`UPDATE room_pages SET title = ?, content = ?, revision = revision + 1, updated_at = ?
              WHERE account_id = ? AND id = ? AND revision = ?`, title, body.content, now, account.id, body.id, body.revision).run();
            if (!saved.meta.changes) return fail(409, 'La página cambió en otro dispositivo. Copiá tu texto antes de volver a abrirla.');
            return json({ id: body.id, revision: body.revision + 1, updatedAt: now });
          }
          if (!validToken(body.folderId)) return fail(400, 'Elegí una carpeta.');
          const id = token();
          const saved = await query(`INSERT INTO room_pages (account_id, id, folder_id, title, content, updated_at)
            SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM room_folders WHERE account_id = ? AND id = ?)
              AND (SELECT COUNT(*) FROM room_pages WHERE account_id = ?) < 300`,
          account.id, id, body.folderId, title, body.content, now, account.id, body.folderId, account.id).run();
          if (!saved.meta.changes) return fail(409, 'La carpeta ya no está disponible o alcanzaste el límite de 300 páginas.');
          return json({ id, revision: 1, updatedAt: now });
        }
        if (route === '/room/pages/delete') {
          if (!validToken(body.id)) return fail(400, 'Página inválida.');
          await query('DELETE FROM room_pages WHERE account_id = ? AND id = ?', account.id, body.id).run();
          return json({});
        }
        if (route === '/activity') {
          const { results } = await query(`SELECT type, device, created_at AS createdAt
            FROM account_events WHERE account_id = ? ORDER BY id DESC LIMIT 40`, account.id).all();
          return json({ events: results });
        }
        if (route === '/devices/rename') {
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (!validToken(body.id) || !name || name.length > 50) return fail(400, 'Elegí un nombre de hasta 50 caracteres.');
          const result = await query('UPDATE sessions SET device_name = ? WHERE account_id = ? AND device_id = ? AND expires_at > ?',
            name, account.id, body.id, now).run();
          if (!result.meta.changes) return fail(404, 'La sesión ya no está disponible.');
          await logEvent(account.id, 'device_renamed');
          return json({});
        }
        if (route === '/passkeys') {
          const { results } = await query(`SELECT id, label AS name, created_at AS createdAt
            FROM passkeys WHERE account_id = ? AND rp_id = ? ORDER BY created_at DESC, id`, account.id, rpID).all();
          return json({ passkeys: results });
        }
        if (route === '/passkeys/rename' || route === '/passkeys/revoke') {
          if (typeof body.id !== 'string' || !/^[\w-]{16,1400}$/.test(body.id)) return fail(400, 'Clave inválida.');
          const name = typeof body.name === 'string' ? body.name.trim() : '';
          if (route === '/passkeys/rename') {
            if (!name || name.length > 50) return fail(400, 'Elegí un nombre de hasta 50 caracteres.');
            const result = await query('UPDATE passkeys SET label = ? WHERE account_id = ? AND rp_id = ? AND id = ?',
              name, account.id, rpID, body.id).run();
            if (!result.meta.changes) return fail(404, 'La clave ya no está disponible.');
            await logEvent(account.id, 'passkey_renamed');
          } else {
            const result = await query(`DELETE FROM passkeys WHERE account_id = ? AND rp_id = ? AND id = ?
              AND EXISTS (SELECT 1 FROM passkeys other WHERE other.account_id = ? AND other.rp_id = ? AND other.id <> ?)`,
            account.id, rpID, body.id, account.id, rpID, body.id).run();
            if (!result.meta.changes) return fail(409, 'La clave ya no está disponible o es la última de tu cuenta.');
            await logEvent(account.id, 'passkey_removed');
          }
          return json({});
        }
        if (route === '/profile/update') {
          const profile = profileFrom({ ...body.profile, email: account.email });
          if (!profile) return fail(400, 'Revisá los datos del perfil.');
          await query(`UPDATE accounts SET given_name = ?, family_name = ?, age = ?, sex = ?, nationality = ?, province = ?, locality = ?
            WHERE id = ?`, profile.name, profile.surname, profile.age, profile.sex, profile.country, profile.province, profile.city, account.id).run();
          await logEvent(account.id, 'profile_updated');
          return json({ updated: true });
        }
        if (route === '/devices/revoke-others') {
          const result = await query('DELETE FROM sessions WHERE account_id = ? AND token_hash <> ?', account.id, key).run();
          if (result.meta.changes) await logEvent(account.id, 'sessions_closed');
          return json({ closed: result.meta.changes });
        }
        if (route === '/face/credential') {
          const credential = await query('SELECT id FROM passkeys WHERE account_id = ? AND rp_id = ? ORDER BY rowid DESC LIMIT 1',
            account.id, rpID).first();
          return credential ? json({ id: credential.id, name: account.name }) : fail(409, 'Guardá una clave de acceso antes de registrar tu rostro.');
        }
        if (route === '/passkey/options') {
          if (origin !== NOVA_WEB_ORIGIN) return fail(403, 'Abrí la nueva dirección de Renx.');
          const options = await generateRegistrationOptions({
            rpName: 'Renx', rpID, userName: account.email, userID: encoder.encode(account.id),
            attestationType: 'none', supportedAlgorithmIDs: [-7, -257],
            authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
          });
          await query('UPDATE sessions SET passkey_challenge = ?, passkey_challenge_expires_at = ? WHERE token_hash = ?',
            options.challenge, now + 5 * 60_000, key).run();
          return json(options);
        }
        if (route === '/passkey/register') {
          if (origin !== NOVA_WEB_ORIGIN) return fail(403, 'Abrí la nueva dirección de Renx.');
          const session = await query(`SELECT passkey_challenge AS challenge FROM sessions
            WHERE token_hash = ? AND expires_at > ? AND passkey_challenge_expires_at > ?`, key, now, now).first();
          if (!session?.challenge) return fail(410, 'Volvé a iniciar la creación de la clave.');
          let result;
          try {
            result = await verifyRegistrationResponse({ response: body.response, expectedChallenge: session.challenge,
              expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
          } catch {
            return fail(401, 'No se pudo confirmar la clave.');
          }
          if (!result.verified) return fail(401, 'No se pudo confirmar la clave.');
          const { id, publicKey, counter } = result.registrationInfo.credential;
          const [created] = await DB.batch([
            query(`INSERT INTO passkeys (id, account_id, public_key, counter, rp_id, label, created_at)
              SELECT ?, account_id, ?, ?, ?, ?, ? FROM sessions WHERE token_hash = ? AND passkey_challenge = ?
                AND expires_at > ? AND passkey_challenge_expires_at > ?`, id, toBase64(publicKey), counter, rpID, deviceName(request), now, key, session.challenge, now, now),
            query(`UPDATE sessions SET passkey_challenge = NULL, passkey_challenge_expires_at = NULL
              WHERE token_hash = ? AND passkey_challenge = ?`, key, session.challenge),
          ]);
          if (!created.meta.changes) return fail(410, 'Volvé a iniciar la creación de la clave.');
          await logEvent(account.id, 'passkey_added');
          return json({ added: true });
        }
        if (route === '/devices') {
          await query(`UPDATE sessions SET device_id = lower(hex(randomblob(21))) || '0',
            device_name = CASE WHEN token_hash = ? THEN ? ELSE 'Sesión anterior' END
            WHERE account_id = ? AND expires_at > ? AND device_id IS NULL`, key, deviceName(request), account.id, now).run();
          const { results } = await query(`SELECT device_id AS id, COALESCE(device_name, 'Sesión anterior') AS name,
            created_at AS createdAt, expires_at AS expiresAt, token_hash = ? AS current
            FROM sessions WHERE account_id = ? AND expires_at > ? ORDER BY current DESC, expires_at DESC`, key, account.id, now).all();
          return json({ devices: results });
        }
        if (route === '/devices/revoke') {
          if (!validToken(body.id)) return fail(400, 'Dispositivo inválido.');
          const result = await query('DELETE FROM sessions WHERE account_id = ? AND device_id = ? AND token_hash <> ?', account.id, body.id, key).run();
          if (result.meta.changes) await logEvent(account.id, 'session_closed');
          return json({});
        }
        delete account.id;
        return json(account);
      }
      if (!['/status', '/finish', '/phone', '/options', '/approve', '/approve-session', '/registration/ready'].includes(route)) return fail(404, 'Opción no disponible.');
      if (!validToken(body.id) || !validToken(body.token)) return fail(400, 'Solicitud inválida.');
      const tokenHash = await hash(body.token);
      const isDesktop = ['/status', '/finish'].includes(route);
      const handoff = await query(`SELECT * FROM qr_requests
        WHERE id = ? AND ${isDesktop ? 'desktop_token_hash' : 'phone_token_hash'} = ?
          AND ${isDesktop ? 'desktop_origin' : 'phone_origin'} = ? AND expires_at > ? AND consumed_at IS NULL`,
      body.id, tokenHash, origin, now).first();
      if (!handoff) return fail(410, 'El código venció o ya fue usado.');
      if (route === '/status') return json({ approved: Boolean(handoff.approved_at) });
      if (route === '/phone') return json({ purpose: handoff.purpose, approved: Boolean(handoff.approved_at) });

      const registration = handoff.purpose === 'registration';
      if (route === '/registration/ready') {
        if (!registration) return fail(400, 'Solicitud inválida.');
        const result = await query(`UPDATE qr_requests SET approved_at = ?, pending_credential = NULL, challenge = NULL
          WHERE id = ? AND expires_at > ? AND consumed_at IS NULL AND approved_at IS NULL`, now, handoff.id, now).run();
        return result.meta.changes ? json({ approved: true }) : fail(409, 'La solicitud ya se confirmó.');
      }
      if (route === '/approve-session') {
        if (registration) return fail(400, 'Este código es para registrarte.');
        if (!validToken(body.session)) return fail(401, 'Iniciá sesión en el celular.');
        const activeSession = await hash(body.session);
        const result = await query(`WITH active AS (
            SELECT account_id FROM sessions WHERE token_hash = ? AND expires_at > ?
          )
          UPDATE qr_requests SET approved_at = ?, account_id = (SELECT account_id FROM active), challenge = NULL
          WHERE id = ? AND phone_token_hash = ? AND phone_origin = ? AND purpose = 'sign-in'
            AND expires_at > ? AND consumed_at IS NULL AND approved_at IS NULL AND EXISTS (SELECT 1 FROM active)`,
          activeSession, now, now, handoff.id, tokenHash, origin, now).run();
        if (result.meta.changes) return json({ approved: true });
        return fail(409, 'La sesión o el código ya no está disponible. Volvé a iniciar el acceso.');
      }
      if (route === '/options') {
        if (handoff.approved_at) return fail(409, 'Ya se aprobó esta solicitud.');
        const options = registration
          ? await generateRegistrationOptions({
            rpName: 'Renx', rpID, userName: 'Cuenta Renx', userID: encoder.encode(handoff.id),
            attestationType: 'none', supportedAlgorithmIDs: [-7, -257],
            authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'required', userVerification: 'required' },
          })
          : await generateAuthenticationOptions({
            rpID, userVerification: 'required',
            allowCredentials: typeof body.credentialId === 'string' && /^[\w-]{16,1400}$/.test(body.credentialId)
              ? [{ id: body.credentialId }] : [],
          });
        await query('UPDATE qr_requests SET challenge = ? WHERE id = ? AND approved_at IS NULL', options.challenge, handoff.id).run();
        return json(options);
      }

      if (route === '/approve') {
        if (!handoff.challenge || handoff.approved_at) return fail(409, 'Volvé a iniciar la confirmación.');
        const expected = { expectedChallenge: handoff.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true };
        let account = null, pending = null, counterUpdate;
        try {
          if (registration) {
            const result = await verifyRegistrationResponse({ ...expected, response: body.response });
            if (!result.verified) return fail(401, 'No se pudo confirmar la clave de acceso.');
            const { id, publicKey, counter } = result.registrationInfo.credential;
            pending = JSON.stringify({ id, key: toBase64(publicKey), counter });
          } else {
            const passkey = await query('SELECT * FROM passkeys WHERE id = ? AND rp_id = ?', body.response?.id ?? '', rpID).first();
            if (!passkey) return fail(401, 'La clave de acceso no pertenece a una cuenta de Renx.');
            const result = await verifyAuthenticationResponse({
              ...expected, response: body.response,
              credential: { id: passkey.id, publicKey: fromBase64(passkey.public_key), counter: passkey.counter },
            });
            if (!result.verified) return fail(401, 'No se pudo confirmar la identidad.');
            account = passkey.account_id;
            counterUpdate = query('UPDATE passkeys SET counter = MAX(counter, ?) WHERE id = ?', result.authenticationInfo.newCounter, passkey.id);
          }
        } catch {
          return fail(401, 'No se pudo confirmar la identidad con el celular.');
        }
        const approve = query(`UPDATE qr_requests SET approved_at = ?, account_id = ?, pending_credential = ?, challenge = NULL
          WHERE id = ? AND challenge = ? AND expires_at > ? AND approved_at IS NULL`,
        now, account, pending, handoff.id, handoff.challenge, now);
        const [result] = await DB.batch(counterUpdate ? [approve, counterUpdate] : [approve]);
        return result.meta.changes === 1 ? json({ approved: true }) : fail(409, 'La solicitud cambió. Volvé a intentarlo.');
      }

      if (!handoff.approved_at) return fail(409, 'Todavía falta confirmar en el celular.');
      const session = token(), sessionHash = await hash(session);
      const commands = [];
      const accountId = registration ? handoff.id : handoff.account_id;
      if (registration) {
        const data = profileFrom(body.profile);
        if (!data) return fail(400, 'Revisá los datos del registro.');
        if (!acceptablePassword(body.password)) return fail(400, 'Elegí una contraseña de 15 a 128 caracteres con variedad.');
        const salt = toBase64(crypto.getRandomValues(new Uint8Array(16)));
        const verifier = toBase64(await derivePassword(body.password, salt, AUTH_PASSWORD_PEPPER));
        commands.push(query(`INSERT INTO accounts (id, email, given_name, family_name, age, sex, nationality, province, locality, created_at, password_salt, password_hash)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM qr_requests WHERE id = ? AND consumed_at IS NULL AND expires_at > ?`,
        accountId, data.email, data.name, data.surname, data.age, data.sex, data.country, data.province, data.city, now, salt, verifier, handoff.id, Date.now()));
      }
      commands.push(query(`UPDATE qr_requests SET consumed_at = ?, redeem_hash = ?, pending_credential = NULL
        WHERE id = ? AND consumed_at IS NULL AND approved_at IS NOT NULL AND expires_at > ?`, now, sessionHash, handoff.id, now));
      commands.push(query(`INSERT INTO sessions (token_hash, account_id, expires_at, device_id, device_name, created_at)
        SELECT ?, ?, ?, ?, ?, ? FROM qr_requests WHERE id = ? AND redeem_hash = ?`,
      sessionHash, accountId, now + 7 * 86_400_000, token(), deviceName(request), now, handoff.id, sessionHash));
      const result = await DB.batch(commands);
      if (result.at(-1).meta.changes !== 1) return fail(410, 'El código venció o ya fue usado.');
      await logEvent(accountId, registration ? 'account_created' : 'signed_in');
      const account = await query('SELECT id, given_name AS name, family_name AS surname, email, (password_hash IS NOT NULL) AS hasPassword FROM accounts WHERE id = ?', accountId).first();
      return json({ session, account });
    } catch (error) {
      if (/UNIQUE constraint failed: accounts.email/i.test(String(error))) return fail(409, 'Ese correo ya está registrado.');
      if (error instanceof SyntaxError) return fail(400, 'Solicitud inválida.');
      return fail(500, 'No se pudo completar la solicitud. Intentá nuevamente.');
    }
  },
};
