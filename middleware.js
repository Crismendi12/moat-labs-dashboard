// MOAT Labs Dashboard -- Edge Middleware (server-side auth)
// Runs on Vercel Edge before any static file is served.
// To change password: echo -n "YOUR_PASSWORD" | shasum -a 256 | awk '{print $1}'

const PASSWORD_HASH = '18222a6bd37b4906055b3d0b25b1db70dad786cc649094ec2b4728c03eb8620b';
const SESSION_DAYS = 7;

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const attempts = new Map();

function isRateLimited(ip) {
  var now = Date.now();
  var record = attempts.get(ip);
  if (!record || now - record.first > WINDOW_MS) {
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordAttempt(ip) {
  var now = Date.now();
  var record = attempts.get(ip);
  if (!record || now - record.first > WINDOW_MS) {
    attempts.set(ip, { first: now, count: 1 });
  } else {
    record.count++;
  }
}

function clearAttempts(ip) {
  attempts.delete(ip);
}

function parseCookies(header) {
  var obj = {};
  if (!header) return obj;
  header.split(';').forEach(function (pair) {
    var parts = pair.trim().split('=');
    if (parts.length >= 2) obj[parts[0]] = parts.slice(1).join('=');
  });
  return obj;
}

async function sha256(message) {
  var buf = new TextEncoder().encode(message);
  var hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(function (b) {
    return b.toString(16).padStart(2, '0');
  }).join('');
}

function loginPage(error) {
  return '<!DOCTYPE html>' +
'<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
'<title>MOAT Labs - Login</title>' +
'<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:"Inter",system-ui,sans-serif;background:#F1F5F9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}' +
'.login-card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(15,23,42,0.08);width:100%;max-width:380px;overflow:hidden}' +
'.login-header{background:#0F172A;padding:28px 32px;text-align:center}' +
'.login-brand{font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px}' +
'.login-brand span{color:#2B4B8C}' +
'.login-sub{font-size:11px;color:#94A3B8;margin-top:4px;letter-spacing:0.5px;text-transform:uppercase;font-weight:600}' +
'.login-body{padding:32px}' +
'.login-label{font-size:11px;font-weight:600;color:#475569;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:block}' +
'.login-input{width:100%;padding:10px 14px;border:1.5px solid #E2E8F0;border-radius:8px;font-size:14px;font-family:inherit;outline:none;transition:border-color 150ms}' +
'.login-input:focus{border-color:#2B4B8C;box-shadow:0 0 0 3px rgba(43,75,140,0.1)}' +
'.login-btn{width:100%;padding:11px;margin-top:16px;background:#0F172A;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;font-family:inherit;cursor:pointer;letter-spacing:0.3px;transition:background 150ms}' +
'.login-btn:hover{background:#1E293B}' +
'.login-error{background:#FEF2F2;color:#DC2626;font-size:12px;font-weight:500;padding:8px 12px;border-radius:6px;margin-bottom:16px;text-align:center}' +
'.login-footer{text-align:center;margin-top:20px;font-size:10px;color:#94A3B8;letter-spacing:0.3px}' +
'</style></head><body>' +
'<div class="login-card">' +
'<div class="login-header">' +
'<div class="login-brand">MOAT<span>LABS</span></div>' +
'<div class="login-sub">Sales Command Center</div>' +
'</div>' +
'<div class="login-body">' +
(error ? '<div class="login-error">' + error + '</div>' : '') +
'<form method="POST" action="/login">' +
'<label class="login-label" for="password">Password</label>' +
'<input class="login-input" type="password" id="password" name="password" placeholder="Enter your password" autofocus required>' +
'<button class="login-btn" type="submit">Sign In</button>' +
'</form>' +
'<div class="login-footer">Protected access</div>' +
'</div></div></body></html>';
}

export default async function middleware(request) {
  var url = new URL(request.url);

  // Handle logout
  if (url.pathname === '/logout') {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': '/',
        'Set-Cookie': 'moat_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
      }
    });
  }

  // Handle login POST
  if (request.method === 'POST' && url.pathname === '/login') {
    var ip = request.headers.get('x-forwarded-for') || 'unknown';

    if (isRateLimited(ip)) {
      return new Response(loginPage('Too many attempts. Try again in 15 minutes.'), {
        status: 429,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    try {
      var formData = await request.formData();
      var password = formData.get('password') || '';
      var hash = await sha256(password);

      if (hash === PASSWORD_HASH) {
        clearAttempts(ip);
        var maxAge = 60 * 60 * 24 * SESSION_DAYS;
        return new Response(null, {
          status: 302,
          headers: {
            'Location': '/',
            'Set-Cookie': 'moat_session=' + hash + '; Path=/; Max-Age=' + maxAge + '; HttpOnly; Secure; SameSite=Lax'
          }
        });
      }

      recordAttempt(ip);
      return new Response(loginPage('Invalid password. Try again.'), {
        status: 401,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    } catch (e) {
      return new Response(loginPage('Something went wrong. Try again.'), {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
  }

  // Check session cookie
  var cookies = parseCookies(request.headers.get('cookie'));
  if (cookies.moat_session === PASSWORD_HASH) {
    return; // Authenticated -- pass through to static files
  }

  // Not authenticated -- show login page
  return new Response(loginPage(), {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

export const config = {
  matcher: '/((?!favicon.ico|robots.txt).*)'
};
