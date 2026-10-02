from django.db import migrations, models


def backfill_generated_unpaid(apps, schema_editor):
    Expense = apps.get_model('expenses', 'Expense')
    Expense.objects.filter(is_recurring=True).update(is_paid=False)


def reverse_backfill(apps, schema_editor):
    Expense = apps.get_model('expenses', 'Expense')
    Expense.objects.filter(is_recurring=True).update(is_paid=True)


class Migration(migrations.Migration):

    dependencies = [
        ('expenses', '0004_expense_line_item'),
    ]

    operations = [
        migrations.AddField(
            model_name='expense',
            name='is_paid',
            field=models.BooleanField(default=True),
        ),
        migrations.RunPython(backfill_generated_unpaid, reverse_backfill),
    ]
