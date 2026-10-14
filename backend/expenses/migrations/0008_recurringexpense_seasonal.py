from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0007_expenselineitem_originals'),
    ]

    operations = [
        migrations.AddField(
            model_name='recurringexpense',
            name='is_seasonal',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='recurringexpense',
            name='season_start_month',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='recurringexpense',
            name='season_end_month',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
