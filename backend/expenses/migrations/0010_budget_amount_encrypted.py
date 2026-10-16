"""Encrypt Budget.amount at rest (same pattern as bill/expense amounts).

Copies Decimal standing amounts into a temporary EncryptedCharField, then
replaces the Decimal column. Existing numbers are preserved.
"""
import encrypted_model_fields.fields
from django.db import migrations, models


def copy_amounts_to_encrypted(apps, schema_editor):
    Budget = apps.get_model('expenses', 'Budget')
    for budget in Budget.objects.all().iterator():
        plain = budget.amount
        if plain is None:
            text = '0.00'
        else:
            text = str(plain)
        budget.amount_enc = text
        budget.save(update_fields=['amount_enc'])


def noop_reverse(apps, schema_editor):
    # Reverse of encrypt is lossy without a second Decimal column; leave encrypted values.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0009_budget_origin_and_unique_active'),
    ]

    operations = [
        migrations.AddField(
            model_name='budget',
            name='amount_enc',
            field=encrypted_model_fields.fields.EncryptedCharField(max_length=20, null=True),
        ),
        migrations.RunPython(copy_amounts_to_encrypted, noop_reverse),
        migrations.RemoveField(
            model_name='budget',
            name='amount',
        ),
        migrations.RenameField(
            model_name='budget',
            old_name='amount_enc',
            new_name='amount',
        ),
        migrations.AlterField(
            model_name='budget',
            name='amount',
            field=encrypted_model_fields.fields.EncryptedCharField(max_length=20),
        ),
    ]
