"""
Money app: income streams (estimate → actual) and investment account snapshots.
Manual entry only — no bank/brokerage sync.
"""
from django.db import models
from encrypted_model_fields.fields import EncryptedCharField, EncryptedTextField
from families.models import Family, Member


class IncomeStream(models.Model):
    """Named income source with a schedule and optional end date (e.g. paycheck, pension)."""

    STREAM_TYPE_CHOICES = [
        ('employment', 'Employment'),
        ('pension', 'Pension'),
        ('other', 'Other'),
    ]
    FREQUENCY_CHOICES = [
        ('biweekly', 'Every 2 weeks'),
        ('monthly', 'Monthly'),
        ('third_last_biz', 'Monthly (CPP/OAS)'),
        ('second_last_biz', 'Monthly (LAPP)'),
        ('one_time', 'One-time'),
    ]

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='income_streams')
    created_by = models.ForeignKey(
        Member, on_delete=models.SET_NULL, null=True, blank=True, related_name='created_income_streams'
    )
    name = EncryptedCharField(max_length=200)
    stream_type = models.CharField(max_length=20, choices=STREAM_TYPE_CHOICES, default='employment')
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='biweekly')
    default_estimate = EncryptedCharField(max_length=20)  # decimal string
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    notes = EncryptedTextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['start_date', 'id']
        indexes = [
            models.Index(fields=['family', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.family_id})"


class IncomeOccurrence(models.Model):
    """A single scheduled payment for a stream — estimate, then actual when deposited."""

    STATUS_CHOICES = [
        ('estimated', 'Estimated'),
        ('received', 'Received'),
        ('skipped', 'Skipped'),
    ]

    stream = models.ForeignKey(IncomeStream, on_delete=models.CASCADE, related_name='occurrences')
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='income_occurrences')
    due_date = models.DateField()
    estimated_amount = EncryptedCharField(max_length=20)
    actual_amount = EncryptedCharField(max_length=20, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='estimated')
    notes = EncryptedTextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['due_date', 'id']
        unique_together = [('stream', 'due_date')]
        indexes = [
            models.Index(fields=['family', 'due_date']),
            models.Index(fields=['stream', 'due_date']),
        ]

    def __str__(self):
        return f"{self.stream_id} @ {self.due_date}"


class Account(models.Model):
    """Investment or cash account (RRSP, TFSA, etc.)."""

    ACCOUNT_TYPE_CHOICES = [
        ('rrsp', 'RRSP'),
        ('tfsa', 'TFSA'),
        ('non_reg', 'Non-registered'),
        ('cash', 'Cash / savings'),
        ('other', 'Other'),
    ]

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='money_accounts')
    name = EncryptedCharField(max_length=200)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPE_CHOICES, default='other')
    notes = EncryptedTextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['account_type', 'id']
        indexes = [
            models.Index(fields=['family', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.family_id})"


class AccountSnapshot(models.Model):
    """Manual balance as of a date (monthly actuals)."""

    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='snapshots')
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='account_snapshots')
    as_of_date = models.DateField()
    balance = EncryptedCharField(max_length=20)
    notes = EncryptedTextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-as_of_date', '-id']
        unique_together = [('account', 'as_of_date')]
        indexes = [
            models.Index(fields=['family', 'as_of_date']),
            models.Index(fields=['account', 'as_of_date']),
        ]

    def __str__(self):
        return f"{self.account_id} @ {self.as_of_date}"
