# Generated manually for Account.institution

import encrypted_model_fields.fields
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('money', '0004_add_second_last_biz_frequency'),
    ]

    operations = [
        migrations.AddField(
            model_name='account',
            name='institution',
            field=encrypted_model_fields.fields.EncryptedCharField(blank=True, null=True),
        ),
    ]
