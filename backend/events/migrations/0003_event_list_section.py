# Generated manually for checklist calendar integration

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('events', '0002_event'),
        ('lists', '0009_rename_lists_lissect_list_dt_ord_lists_lists_list_id_5e41f6_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='event',
            name='list_section',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='calendar_event',
                to='lists.listsection',
            ),
        ),
    ]
