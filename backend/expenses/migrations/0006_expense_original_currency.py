from django.db import migrations, models
import encrypted_model_fields.fields


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0005_expense_is_paid'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='original_currency',
            field=models.CharField(blank=True, max_length=3, null=True),
        ),
        migrations.AddField(
            model_name='expense',
            name='original_amount',
            field=encrypted_model_fields.fields.EncryptedCharField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='expense',
            name='fx_rate',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='expense',
            name='fx_as_of',
            field=models.DateField(blank=True, null=True),
        ),
    ]
