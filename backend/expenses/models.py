"""
Expense tracking models with encrypted fields.
"""
from django.db import models
from encrypted_model_fields.fields import EncryptedCharField, EncryptedTextField
from families.models import Family, Member


class ExpenseCategory(models.Model):
    """Category for organizing expenses."""
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='expense_categories')
    name = EncryptedCharField(max_length=100)
    description = EncryptedTextField(blank=True, null=True)
    icon = models.CharField(max_length=50, blank=True, null=True, help_text="FontAwesome icon name (e.g., 'utensils', 'car', 'home')")
    color = models.CharField(max_length=7, default='#3b82f6')  # Hex color code
    order = models.IntegerField(default=0)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'name']
        verbose_name_plural = "expense categories"
        indexes = [
            models.Index(fields=['family', 'order']),
        ]

    def __str__(self):
        return f"{self.name} ({self.family.name})"


class ExpenseTag(models.Model):
    """Tag for additional expense categorization."""
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='expense_tags')
    name = EncryptedCharField(max_length=100)
    color = models.CharField(max_length=7, blank=True, null=True, help_text="Hex color code")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']
        indexes = [
            models.Index(fields=['family']),
        ]

    def __str__(self):
        return f"{self.name} ({self.family.name})"


class Budget(models.Model):
    """Budget for expense categories."""
    PERIOD_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('yearly', 'Yearly'),
    ]

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='budgets')
    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE, related_name='budgets')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    period = models.CharField(max_length=20, choices=PERIOD_CHOICES, default='monthly')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    alert_threshold = models.IntegerField(default=80, help_text="Alert when this percentage of budget is used")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date', 'category']
        indexes = [
            models.Index(fields=['family', 'is_active']),
            models.Index(fields=['category', 'start_date']),
        ]

    def __str__(self):
        return f"{self.category.name} - {self.get_period_display()} - ${self.amount}"


class RecurringExpense(models.Model):
    """Template for recurring expenses."""
    FREQUENCY_CHOICES = [
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
        ('monthly', 'Monthly'),
        ('yearly', 'Yearly'),
    ]

    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('credit_card', 'Credit Card'),
        ('debit_card', 'Debit Card'),
        ('bank_transfer', 'Bank Transfer'),
        ('e_transfer', 'E-Transfer'),
        ('check', 'Check'),
        ('other', 'Other'),
    ]

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='recurring_expenses')
    created_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='created_recurring_expenses')
    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE, related_name='recurring_expenses')
    amount = EncryptedCharField(max_length=20)  # Store as string, convert to Decimal when needed
    description = EncryptedCharField(max_length=200)
    notes = EncryptedTextField(blank=True, null=True)
    frequency = models.CharField(max_length=20, choices=FREQUENCY_CHOICES, default='monthly')
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    next_due_date = models.DateField()
    is_active = models.BooleanField(default=True)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='credit_card')
    tags = models.ManyToManyField(ExpenseTag, blank=True, related_name='recurring_expenses')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['next_due_date', 'category']
        indexes = [
            models.Index(fields=['family', 'is_active']),
            models.Index(fields=['next_due_date', 'is_active']),
        ]

    def __str__(self):
        return f"{self.description} - {self.get_frequency_display()}"


def receipt_upload_path(instance, filename):
    """Generate upload path for receipt files."""
    return f'receipts/family_{instance.family.id}/{filename}'


class Receipt(models.Model):
    """Receipt file attached to an expense."""
    expense = models.OneToOneField('Expense', on_delete=models.CASCADE, related_name='receipt_file', null=True, blank=True)
    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='receipts')
    file = models.FileField(upload_to=receipt_upload_path)
    file_size = models.BigIntegerField(help_text="File size in bytes")
    mime_type = models.CharField(max_length=255, blank=True, null=True)
    uploaded_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='uploaded_receipts')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['family', 'created_at']),
        ]

    def __str__(self):
        return f"Receipt for {self.expense.description if self.expense else 'Unattached'}"

    def delete(self, *args, **kwargs):
        """Override delete to also delete the file."""
        if self.file:
            self.file.delete(save=False)
        super().delete(*args, **kwargs)


class Expense(models.Model):
    """Individual expense entry."""
    PAYMENT_METHOD_CHOICES = [
        ('cash', 'Cash'),
        ('credit_card', 'Credit Card'),
        ('debit_card', 'Debit Card'),
        ('bank_transfer', 'Bank Transfer'),
        ('e_transfer', 'E-Transfer'),
        ('check', 'Check'),
        ('other', 'Other'),
    ]

    family = models.ForeignKey(Family, on_delete=models.CASCADE, related_name='expenses')
    created_by = models.ForeignKey(Member, on_delete=models.SET_NULL, null=True, related_name='created_expenses')
    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE, related_name='expenses')
    amount = EncryptedCharField(max_length=20)  # Store as string, convert to Decimal when needed
    description = EncryptedCharField(max_length=200)
    notes = EncryptedTextField(blank=True, null=True)
    expense_date = models.DateField()
    payment_method = models.CharField(max_length=20, choices=PAYMENT_METHOD_CHOICES, default='credit_card')
    tags = models.ManyToManyField(ExpenseTag, blank=True, related_name='expenses')
    is_recurring = models.BooleanField(default=False)
    recurring_expense = models.ForeignKey(RecurringExpense, on_delete=models.CASCADE, null=True, blank=True, related_name='generated_expenses')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-expense_date', '-created_at']
        indexes = [
            models.Index(fields=['family', 'expense_date']),
            models.Index(fields=['category', 'expense_date']),
            models.Index(fields=['expense_date']),
        ]

    def __str__(self):
        return f"{self.description} - ${self.amount} - {self.expense_date}"
