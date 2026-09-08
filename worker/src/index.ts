/**
 * WanderSync free push server (Cloudflare Workers, no card needed).
 * POST /  { tripId, kind: 'voice'|'siren'|'chat', title, body, voiceUrl?, voicePath?, senderUid? }
 * Reads squad FCM tokens from Firestore, sends high-priority data messages.
 */

interface Env {
  FIREBASE_SERVICE_ACCOUNT: string;
  FIREBASE_API_KEY: string;
}

interface PushBody {
  tripId: string;
  kind: 'voice' | 'siren' | 'chat';
  title: string;
  body: string;
  voiceUrl?: string;
  voicePath?: string;
  senderUid?: string;
}

const PROJECT_ID = 'wandersync-e31dc';

function b64urlEncode(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function accessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64urlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const pem = sa.private_key.replace(/-----.*?-----/gs, '').replace(/\s+/g, '');
  const raw = b64urlDecode(pem);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    raw.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`));
  const jwt = `${header}.${claims}.${b64urlEncode(sig)}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('oauth failed');
  return json.access_token;
}

async function tripTokens(apiKey: string, tripId: string): Promise<{ uid: string; token: string }[]> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents` +
    `/trips/${tripId}/tokens?key=${apiKey}&pageSize=50`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = (await res.json()) as {
    documents?: { name: string; fields?: { token?: { stringValue?: string } } }[];
  };
  return (json.documents || [])
    .map((d) => ({
      uid: d.name.split('/').pop() || '',
      token: d.fields?.token?.stringValue || '',
    }))
    .filter((t) => t.uid && t.token);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method !== 'POST') {
      return new Response('wandersync-push ok', { status: 200 });
    }
    try {
      const body = (await req.json()) as PushBody;
      if (!body.tripId || !body.title) {
        return new Response('bad request', { status: 400 });
      }
      const [token, tokens] = await Promise.all([
        accessToken(env.FIREBASE_SERVICE_ACCOUNT),
        tripTokens(env.FIREBASE_API_KEY, body.tripId),
      ]);
      const targets = tokens.filter((t) => t.uid !== body.senderUid);
      let sent = 0;
      await Promise.all(
        targets.map(async (t) => {
          const data: Record<string, string> = {
            kind: body.kind,
            title: body.title,
            body: body.body,
            tripId: body.tripId,
          };
          if (body.voiceUrl) data.voiceUrl = body.voiceUrl;
          if (body.voicePath) data.voicePath = body.voicePath;
          const res = await fetch(
            `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                message: {
                  token: t.token,
                  data,
                  android: { priority: 'high', ttl: '60s' },
                },
              }),
            }
          );
          if (res.ok) sent++;
        })
      );
      return Response.json({ sent, targets: targets.length });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  },
};
