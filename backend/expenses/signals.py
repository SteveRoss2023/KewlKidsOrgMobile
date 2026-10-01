"""Expense app signals — keep receipt media files in sync with DB deletes."""
from __future__ import annotations

import logging

from django.db.models.signals import pre_delete
from django.dispatch import receiver

from .models import Receipt

logger = logging.getLogger(__name__)


@receiver(pre_delete, sender=Receipt)
def receipt_pre_delete_remove_file(sender, instance: Receipt, **kwargs):
    """
    Always remove the image from storage when a Receipt row is deleted,
    including CASCADE deletes from Expense (which skip Receipt.delete()).
    """
    if not instance.file:
        return
    try:
        instance.file.delete(save=False)
    except Exception as e:
        logger.warning('Failed to delete receipt file for receipt %s: %s', instance.pk, e)
