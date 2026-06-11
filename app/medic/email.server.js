// email.server.js
//
// Drift-alert email via Resend's HTTP API (no SDK dependency — just fetch). Gated on
// RESEND_API_KEY: when unset (local dev), it logs the email instead of sending, so the
// monitor pipeline is fully testable offline.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function alertHtml(shop, diff) {
  const row = (a, note) =>
    `<li><strong>${a.name}</strong> — ${a.findingCount} finding(s), ${(a.bytes / 1024).toFixed(1)} KB${note ? ` <em>(${note})</em>` : ""}</li>`;
  const blocks = [];
  if (diff.newApps.length) {
    blocks.push(
      `<p><strong>New leftover code detected:</strong></p><ul>${diff.newApps.map((a) => row(a, "newly appeared")).join("")}</ul>`,
    );
  }
  if (diff.grewApps.length) {
    blocks.push(
      `<p><strong>Existing leftovers got worse:</strong></p><ul>${diff.grewApps.map((a) => row(a, a.reason)).join("")}</ul>`,
    );
  }
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px">
      <h2 style="margin:0 0 4px">Theme Medic — store health alert</h2>
      <p style="color:#555;margin:0 0 16px">${shop}</p>
      <p>${diff.summary}</p>
      ${blocks.join("")}
      <p style="margin-top:20px">Open Theme Medic to review and clean it up.</p>
      <p style="color:#999;font-size:12px">You're getting this because daily monitoring is on for your store. Manage it in the app.</p>
    </div>`;
}

export function buildAlert(shop, diff) {
  return {
    subject: `Theme Medic: ${diff.summary}`,
    html: alertHtml(shop, diff),
    text: `${shop}\n\n${diff.summary}\n\nOpen Theme Medic to review.`,
  };
}

/**
 * Send a drift alert. Returns { sent: boolean, reason?, id? }.
 * No-ops (logs) when RESEND_API_KEY or a from-address isn't configured.
 */
export async function sendAlertEmail(to, shop, diff) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.ALERT_FROM_EMAIL; // e.g. "Theme Medic <alerts@thememedic.app>"
  const msg = buildAlert(shop, diff);

  if (!key || !from) {
    console.log(`[medic][email] (not configured) would send to ${to}: ${msg.subject}`);
    return { sent: false, reason: "email not configured" };
  }
  if (!to) return { sent: false, reason: "no recipient" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[medic][email] send failed ${res.status}: ${body.slice(0, 200)}`);
      return { sent: false, reason: `resend ${res.status}` };
    }
    const json = await res.json().catch(() => ({}));
    return { sent: true, id: json.id };
  } catch (err) {
    console.error("[medic][email] error:", err.message);
    return { sent: false, reason: err.message };
  }
}
