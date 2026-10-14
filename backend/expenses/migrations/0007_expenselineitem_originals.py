from django.db import migrations
import encrypted_model_fields.fields


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0006_expense_original_currency'),
    ]

    operations = [
        migrations.AddField(
            model_name='expenselineitem',
            name='original_name',
            field=encrypted_model_fields.fields.EncryptedCharField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='expenselineitem',
            name='original_unit_price',
            field=encrypted_model_fields.fields.EncryptedCharField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='expenselineitem',
            name='original_line_total',
            field=encrypted_model_fields.fields.EncryptedCharField(blank=True, null=True),
        ),
    ]
