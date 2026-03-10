"""Data migration: compute indent_level from parent chain for existing checklist items."""
from django.db import migrations


def populate_indent_level(apps, schema_editor):
    ListItem = apps.get_model('lists', 'ListItem')
    items_with_parent = ListItem.objects.filter(parent__isnull=False)
    for item in items_with_parent:
        depth = 0
        current = item.parent
        while current is not None:
            depth += 1
            current = current.parent
        if depth > 0:
            item.indent_level = depth
            item.save(update_fields=['indent_level'])


class Migration(migrations.Migration):

    dependencies = [
        ('lists', '0006_add_indent_level_to_listitem'),
    ]

    operations = [
        migrations.RunPython(populate_indent_level, migrations.RunPython.noop),
    ]
