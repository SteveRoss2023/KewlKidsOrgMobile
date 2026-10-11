"""HTML + text email reminding users to update Money account balances on the 1st."""
from __future__ import annotations

import html
import os
from datetime import date


def web_app_base_url() -> str:
    url = (os.getenv('WEB_APP_URL') or '').strip().rstrip('/')
    if url:
        return url
    domain = (os.getenv('PUBLIC_WEB_APP_DOMAIN') or 'kewlkids.ca').strip()
    if domain.startswith('http'):
        return domain.rstrip('/')
    return f'https://{domain}'


def build_balance_reminder_email(
    *,
    display_name: str,
    family_blocks: list[dict],
    as_of: date | None = None,
) -> tuple[str, str, str]:
    """
    family_blocks: [{ 'family_name': str, 'accounts': [str, ...] }, ...]
    Returns (subject, text_body, html_body). Amounts are never included.
    """
    as_of = as_of or date.today().replace(day=1)
    month_label = as_of.strftime('%B %Y')
    safe_name = html.escape(display_name or 'there')
    money_url = f"{web_app_base_url()}/money?tab=accounts&updateBalances=1"

    account_count = sum(len(b.get('accounts') or []) for b in family_blocks)
    subject = f'Update your account balances · {month_label}'

    text_lines = [
        f'Hi {display_name or "there"},',
        '',
        f"It's the 1st — time for your monthly Money balance check-in ({month_label}).",
        '',
        'Update each account after month-end deposits have cleared.',
        '',
    ]
    for block in family_blocks:
        text_lines.append(f"{block.get('family_name') or 'Family'}:")
        for name in block.get('accounts') or []:
            text_lines.append(f'  • {name}')
        text_lines.append('')
    text_lines.extend(
        [
            f'Open Money and tap Update balances:',
            money_url,
            '',
            '— KewlKids Organizer',
        ]
    )
    text_message = '\n'.join(text_lines)

    family_html_parts = []
    for block in family_blocks:
        fname = html.escape(block.get('family_name') or 'Family')
        items = block.get('accounts') or []
        lis = ''.join(
            f'<li style="margin:0 0 6px 0;color:#374151;font-size:15px;">{html.escape(n)}</li>'
            for n in items
        )
        family_html_parts.append(
            f'''
            <div style="margin:0 0 18px 0;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
              <div style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">{fname}</div>
              <ul style="margin:0;padding-left:18px;">{lis or '<li style="color:#94a3b8;">No accounts</li>'}</ul>
            </div>
            '''
        )

    html_message = f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{html.escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f766e 0%,#0d9488 55%,#14b8a6 100%);padding:28px 32px;text-align:center;">
              <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">KewlKids Money</div>
              <div style="font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;">Monthly balance check-in</div>
              <div style="font-size:15px;color:rgba(255,255,255,0.9);margin-top:8px;">{html.escape(month_label)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <p style="margin:0 0 16px 0;font-size:16px;color:#0f172a;line-height:1.5;">
                Hi {safe_name},
              </p>
              <p style="margin:0 0 20px 0;font-size:15px;color:#475569;line-height:1.55;">
                It’s the 1st of the month — a good day to record balances after pensions and paycheques
                have cleared. You’ll update <strong style="color:#0f172a;">{account_count}</strong> account
                {('' if account_count == 1 else 's')} as of <strong style="color:#0f172a;">{html.escape(as_of.isoformat())}</strong>.
              </p>
              <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 16px;margin:0 0 24px 0;">
                <p style="margin:0;font-size:14px;color:#065f46;line-height:1.45;">
                  Tip: use <strong>Update balances</strong> in Money → Accounts to enter every account in one step.
                  Amounts stay in the app — this email never includes them.
                </p>
              </div>
              {''.join(family_html_parts)}
              <div style="text-align:center;margin:28px 0 8px 0;">
                <a href="{html.escape(money_url)}"
                   style="display:inline-block;padding:14px 28px;background-color:#0d9488;color:#ffffff !important;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px;">
                  Update balances
                </a>
              </div>
              <p style="margin:16px 0 0 0;font-size:12px;color:#94a3b8;text-align:center;word-break:break-all;">
                {html.escape(money_url)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px 32px;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">
                KewlKids Organizer · Money reminder<br>
                You’re receiving this because your family has Money accounts.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'''

    return subject, text_message, html_message
