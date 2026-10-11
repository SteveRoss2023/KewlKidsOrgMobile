"""Serializers for money app."""
from decimal import Decimal, InvalidOperation
from rest_framework import serializers
from .models import IncomeStream, IncomeOccurrence, Account, AccountSnapshot


def _enc_money_str(value) -> str | None:
    if value is None or value == '':
        return None
    try:
        return str(Decimal(str(value)).quantize(Decimal('0.01')))
    except (InvalidOperation, ValueError):
        raise serializers.ValidationError('Invalid money amount')


def _money_out(value):
    if value is None or value == '':
        return None
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, ValueError):
        return None


class IncomeStreamSerializer(serializers.ModelSerializer):
    default_estimate = serializers.CharField()

    class Meta:
        model = IncomeStream
        fields = [
            'id', 'family', 'created_by', 'name', 'stream_type', 'frequency',
            'default_estimate', 'start_date', 'end_date', 'notes', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'family', 'created_by', 'created_at', 'updated_at']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['default_estimate'] = _money_out(instance.default_estimate)
        return data

    def validate_default_estimate(self, value):
        return _enc_money_str(value)


class IncomeOccurrenceSerializer(serializers.ModelSerializer):
    estimated_amount = serializers.CharField()
    actual_amount = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    stream_name = serializers.SerializerMethodField()

    class Meta:
        model = IncomeOccurrence
        fields = [
            'id', 'stream', 'stream_name', 'family', 'due_date',
            'estimated_amount', 'actual_amount', 'status', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'family', 'created_at', 'updated_at', 'stream_name']

    def get_stream_name(self, obj):
        return obj.stream.name if obj.stream_id else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['estimated_amount'] = _money_out(instance.estimated_amount)
        data['actual_amount'] = _money_out(instance.actual_amount)
        return data

    def validate_estimated_amount(self, value):
        return _enc_money_str(value)

    def validate_actual_amount(self, value):
        if value is None or value == '':
            return None
        return _enc_money_str(value)


class AccountSerializer(serializers.ModelSerializer):
    latest_balance = serializers.SerializerMethodField()
    latest_as_of = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            'id', 'family', 'name', 'institution', 'account_type', 'notes', 'is_active',
            'latest_balance', 'latest_as_of', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'family', 'latest_balance', 'latest_as_of', 'created_at', 'updated_at',
        ]

    def get_latest_balance(self, obj):
        snap = obj.snapshots.order_by('-as_of_date', '-id').first()
        return _money_out(snap.balance) if snap else None

    def get_latest_as_of(self, obj):
        snap = obj.snapshots.order_by('-as_of_date', '-id').first()
        return snap.as_of_date.isoformat() if snap else None


class AccountSnapshotSerializer(serializers.ModelSerializer):
    balance = serializers.CharField()
    account_name = serializers.SerializerMethodField()

    class Meta:
        model = AccountSnapshot
        fields = [
            'id', 'account', 'account_name', 'family', 'as_of_date', 'balance',
            'notes', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'family', 'account_name', 'created_at', 'updated_at']

    def get_account_name(self, obj):
        return obj.account.name if obj.account_id else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data['balance'] = _money_out(instance.balance)
        return data

    def validate_balance(self, value):
        return _enc_money_str(value)
