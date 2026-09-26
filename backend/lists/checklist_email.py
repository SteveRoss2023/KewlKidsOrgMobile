"""
Build professional HTML + plain-text emails for checklist lists.
"""
from __future__ import annotations

import html
from typing import Dict, List as TypingList, Tuple

from django.utils import timezone

from .models import List, ListItem, ListSection


def _walk_items(
    by_parent: Dict[int | None, TypingList[ListItem]],
    parent_id: int | None,
    depth: int,
    on_item,
) -> None:
    for item in by_parent.get(parent_id, []):
        on_item(item, depth)
        _walk_items(by_parent, item.id, depth + 1, on_item)


def _items_by_parent(items: TypingList[ListItem]) -> Dict[int | None, TypingList[ListItem]]:
    by_parent: Dict[int | None, TypingList[ListItem]] = {}
    for it in items:
        by_parent.setdefault(it.parent_id, []).append(it)
    return by_parent


def build_checklist_email(list_obj: List, sent_by_email: str | None = None) -> Tuple[str, str, str]:
    """
    Return (subject, plain_text, html) for the full checklist.
    Includes all sections and nested items (completed and incomplete).
    """
    sections = list(
        ListSection.objects.filter(list=list_obj).order_by('section_date', 'order', 'id')
    )
    all_items = list(
        ListItem.objects.filter(list=list_obj).order_by('order', 'id')
    )
    items_by_section: Dict[int | None, TypingList[ListItem]] = {}
    for it in all_items:
        items_by_section.setdefault(it.section_id, []).append(it)

    total = len(all_items)
    completed_count = sum(1 for it in all_items if it.completed)
    incomplete_count = total - completed_count

    list_name = list_obj.name or 'Checklist'
    subject = f'Checklist: {list_name}'
    sent_at = timezone.localtime(timezone.now())
    sent_at_str = sent_at.strftime('%b %d, %Y at %I:%M %p')

    # --- Plain text ---
    text_lines = [
        list_name,
        '',
        f'{completed_count} of {total} complete ({incomplete_count} remaining)',
        '',
    ]
    if list_obj.description:
        text_lines.extend([list_obj.description, ''])

    for section in sections:
        date_str = section.section_date.strftime('%b %d, %Y') if section.section_date else ''
        header = section.title or 'Section'
        if date_str:
            header = f'{header} — {date_str}'
        text_lines.append(header)
        text_lines.append('-' * min(40, len(header)))
        by_parent = _items_by_parent(items_by_section.get(section.id, []))

        def append_text(item: ListItem, depth: int) -> None:
            indent = '  ' * depth
            mark = '[x]' if item.completed else '[ ]'
            text_lines.append(f'{indent}{mark} {item.name}')

        _walk_items(by_parent, None, 0, append_text)
        text_lines.append('')

    orphan_items = items_by_section.get(None, [])
    if orphan_items and not sections:
        by_parent = _items_by_parent(orphan_items)

        def append_orphan(item: ListItem, depth: int) -> None:
            indent = '  ' * depth
            mark = '[x]' if item.completed else '[ ]'
            text_lines.append(f'{indent}{mark} {item.name}')

        _walk_items(by_parent, None, 0, append_orphan)
        text_lines.append('')

    text_lines.append('—')
    if sent_by_email:
        text_lines.append(f'Sent by {sent_by_email} via KewlKids Organizer')
    else:
        text_lines.append('Sent via KewlKids Organizer')
    text_lines.append(sent_at_str)
    text_message = '\n'.join(text_lines)

    # --- HTML ---
    safe_name = html.escape(list_name)
    safe_desc = html.escape(list_obj.description) if list_obj.description else ''
    safe_sent_by = html.escape(sent_by_email) if sent_by_email else ''

    section_html_parts: TypingList[str] = []
    for section in sections:
        date_str = section.section_date.strftime('%b %d, %Y') if section.section_date else ''
        section_title = html.escape(section.title or 'Section')
        date_html = (
            f'<span style="color:#6b7280;font-weight:400;font-size:13px;"> — {html.escape(date_str)}</span>'
            if date_str
            else ''
        )
        by_parent = _items_by_parent(items_by_section.get(section.id, []))
        item_rows: TypingList[str] = []

        def append_html_row(item: ListItem, depth: int) -> None:
            pad = 12 + depth * 20
            name_escaped = html.escape(item.name or '')
            if item.completed:
                item_rows.append(
                    f'''<tr>
  <td style="padding:8px 12px 8px {pad}px;border-bottom:1px solid #f3f4f6;">
    <span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;
      background-color:#10b981;color:#ffffff;border-radius:4px;font-size:12px;font-weight:700;
      margin-right:10px;vertical-align:middle;">&#10003;</span>
    <span style="color:#6b7280;text-decoration:line-through;font-size:15px;vertical-align:middle;">{name_escaped}</span>
  </td>
</tr>'''
                )
            else:
                item_rows.append(
                    f'''<tr>
  <td style="padding:8px 12px 8px {pad}px;border-bottom:1px solid #f3f4f6;">
    <span style="display:inline-block;width:16px;height:16px;border:2px solid #9ca3af;border-radius:4px;
      margin-right:10px;vertical-align:middle;background-color:#ffffff;"></span>
    <span style="color:#1f2937;font-size:15px;vertical-align:middle;">{name_escaped}</span>
  </td>
</tr>'''
                )

        _walk_items(by_parent, None, 0, append_html_row)
        items_table = (
            f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
{''.join(item_rows) if item_rows else '<tr><td style="padding:12px;color:#9ca3af;font-size:14px;">No items in this section.</td></tr>'}
</table>'''
        )
        section_html_parts.append(
            f'''<div style="margin:0 0 24px 0;">
  <div style="background-color:#f9fafb;border-left:4px solid #3b82f6;padding:12px 16px;margin-bottom:0;border-radius:4px 4px 0 0;">
    <div style="font-size:16px;font-weight:700;color:#1f2937;">{section_title}{date_html}</div>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 4px 4px;overflow:hidden;">
    {items_table}
  </div>
</div>'''
        )

    if orphan_items and not sections:
        by_parent = _items_by_parent(orphan_items)
        item_rows = []

        def append_orphan_html(item: ListItem, depth: int) -> None:
            pad = 12 + depth * 20
            name_escaped = html.escape(item.name or '')
            if item.completed:
                item_rows.append(
                    f'''<tr>
  <td style="padding:8px 12px 8px {pad}px;border-bottom:1px solid #f3f4f6;">
    <span style="display:inline-block;width:18px;height:18px;line-height:18px;text-align:center;
      background-color:#10b981;color:#ffffff;border-radius:4px;font-size:12px;font-weight:700;
      margin-right:10px;vertical-align:middle;">&#10003;</span>
    <span style="color:#6b7280;text-decoration:line-through;font-size:15px;vertical-align:middle;">{name_escaped}</span>
  </td>
</tr>'''
                )
            else:
                item_rows.append(
                    f'''<tr>
  <td style="padding:8px 12px 8px {pad}px;border-bottom:1px solid #f3f4f6;">
    <span style="display:inline-block;width:16px;height:16px;border:2px solid #9ca3af;border-radius:4px;
      margin-right:10px;vertical-align:middle;background-color:#ffffff;"></span>
    <span style="color:#1f2937;font-size:15px;vertical-align:middle;">{name_escaped}</span>
  </td>
</tr>'''
                )

        _walk_items(by_parent, None, 0, append_orphan_html)
        section_html_parts.append(
            f'''<div style="margin:0 0 24px 0;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
{''.join(item_rows)}
  </table>
</div>'''
        )

    if not section_html_parts:
        section_html_parts.append(
            '<p style="color:#6b7280;font-size:15px;">This checklist has no sections or items yet.</p>'
        )

    desc_block = (
        f'<p style="color:#4b5563;font-size:15px;margin:0 0 20px 0;">{safe_desc}</p>'
        if safe_desc
        else ''
    )
    footer_sent = (
        f'Sent by {safe_sent_by}' if safe_sent_by else 'Sent via KewlKids Organizer'
    )

    html_message = f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{safe_name}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.08);">
          <tr>
            <td style="background-color:#3b82f6;padding:20px 32px;text-align:center;">
              <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">KewlKids Organizer</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <h1 style="margin:0 0 8px 0;font-size:22px;color:#1f2937;font-weight:700;">{safe_name}</h1>
              <p style="margin:0 0 20px 0;font-size:14px;color:#6b7280;">Checklist export</p>
              {desc_block}
              <div style="background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:12px 16px;margin-bottom:28px;">
                <span style="font-size:14px;color:#1e40af;font-weight:600;">
                  {completed_count} of {total} complete
                </span>
                <span style="font-size:14px;color:#3b82f6;">
                  &nbsp;&middot;&nbsp;{incomplete_count} remaining
                </span>
              </div>
              {''.join(section_html_parts)}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 32px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">
                {footer_sent}<br>
                {html.escape(sent_at_str)}
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
