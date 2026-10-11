# Generated manually for LAPP pay cadence

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('money', '0003_add_third_last_biz_frequency'),
    ]

    operations = [
        migrations.AlterField(
            model_name='incomestream',
            name='frequency',
            field=models.CharField(
                choices=[
                    ('biweekly', 'Every 2 weeks'),
                    ('monthly', 'Monthly'),
                    ('third_last_biz', 'Monthly (CPP/OAS)'),
                    ('second_last_biz', 'Monthly (LAPP)'),
                    ('one_time', 'One-time'),
                ],
                default='biweekly',
                max_length=20,
            ),
        ),
    ]
