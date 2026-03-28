import datetime

from django.db import migrations, models


def set_section_date_today(apps, schema_editor):
    ListSection = apps.get_model('lists', 'ListSection')
    today = datetime.date.today()
    ListSection.objects.all().update(section_date=today)


class Migration(migrations.Migration):

    dependencies = [
        ('lists', '0007_populate_indent_level'),
    ]

    operations = [
        migrations.AddField(
            model_name='listsection',
            name='section_date',
            field=models.DateField(null=True, blank=True),
        ),
        migrations.RunPython(set_section_date_today, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='listsection',
            name='section_date',
            field=models.DateField(default=datetime.date.today),
            preserve_default=False,
        ),
        migrations.AlterModelOptions(
            name='listsection',
            options={'ordering': ['section_date', 'order']},
        ),
        migrations.AddIndex(
            model_name='listsection',
            index=models.Index(fields=['list', 'section_date', 'order'], name='lists_lissect_list_dt_ord'),
        ),
    ]
