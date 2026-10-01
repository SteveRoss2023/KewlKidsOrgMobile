import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

/** Curated FontAwesome icons for expense categories (not grocery emojis). */
export const EXPENSE_ICON_GROUPS: Record<string, { label: string; icons: string[] }> = {
  bills: {
    label: 'Bills & Home',
    icons: [
      'home', 'bolt', 'plug', 'tint', 'fire', 'lightbulb-o', 'wifi', 'tv',
      'phone', 'mobile', 'desktop', 'laptop', 'building', 'wrench',
    ],
  },
  money: {
    label: 'Money & Work',
    icons: [
      'money', 'credit-card', 'bank', 'briefcase', 'file-text-o', 'calendar',
      'calculator', 'percent', 'tag', 'tags', 'shopping-bag', 'shopping-cart',
    ],
  },
  transport: {
    label: 'Travel & Transport',
    icons: [
      'car', 'bus', 'subway', 'bicycle', 'plane', 'train', 'ship', 'taxi',
      'motorcycle', 'road', 'map-marker', 'globe', 'bed',
    ],
  },
  health: {
    label: 'Health & Family',
    icons: [
      'heartbeat', 'medkit', 'stethoscope', 'hospital-o', 'ambulance', 'heart',
      'shield', 'umbrella', 'user', 'users', 'child', 'paw',
    ],
  },
  lifestyle: {
    label: 'Lifestyle',
    icons: [
      'cutlery', 'coffee', 'beer', 'glass', 'film', 'music', 'headphones',
      'gamepad', 'book', 'graduation-cap', 'gift', 'camera', 'picture-o',
      'futbol-o',
    ],
  },
  other: {
    label: 'Other',
    icons: [
      'star', 'check', 'plus', 'ellipsis-h', 'lock', 'key', 'trash',
      'question-circle', 'info-circle', 'exclamation-triangle',
    ],
  },
};

const ICON_COLORS: Record<string, string> = {
  home: '#10b981',
  bolt: '#eab308',
  plug: '#f59e0b',
  tint: '#0ea5e9',
  fire: '#ef4444',
  'lightbulb-o': '#fbbf24',
  wifi: '#8b5cf6',
  tv: '#6366f1',
  phone: '#0ea5e9',
  mobile: '#06b6d4',
  desktop: '#64748b',
  laptop: '#475569',
  building: '#78716c',
  wrench: '#a8a29e',
  money: '#22c55e',
  'credit-card': '#3b82f6',
  bank: '#1d4ed8',
  briefcase: '#7c3aed',
  'file-text-o': '#64748b',
  calendar: '#ec4899',
  calculator: '#6366f1',
  percent: '#14b8a6',
  tag: '#f97316',
  tags: '#fb923c',
  'shopping-bag': '#8b5cf6',
  'shopping-cart': '#a855f7',
  car: '#3b82f6',
  bus: '#2563eb',
  subway: '#1e40af',
  bicycle: '#059669',
  plane: '#6366f1',
  train: '#4338ca',
  ship: '#0284c7',
  taxi: '#eab308',
  motorcycle: '#dc2626',
  road: '#78716c',
  'map-marker': '#ef4444',
  globe: '#0ea5e9',
  bed: '#8b5cf6',
  heartbeat: '#ef4444',
  medkit: '#dc2626',
  stethoscope: '#b91c1c',
  'hospital-o': '#f43f5e',
  ambulance: '#e11d48',
  heart: '#fb7185',
  shield: '#6366f1',
  umbrella: '#4f46e5',
  user: '#f59e0b',
  users: '#d97706',
  child: '#fbbf24',
  paw: '#a16207',
  cutlery: '#f97316',
  coffee: '#92400e',
  beer: '#ca8a04',
  glass: '#db2777',
  film: '#ec4899',
  music: '#d946ef',
  headphones: '#c026d3',
  gamepad: '#7c3aed',
  book: '#06b6d4',
  'graduation-cap': '#0891b2',
  gift: '#f43f5e',
  camera: '#64748b',
  'picture-o': '#94a3b8',
  'futbol-o': '#16a34a',
  star: '#eab308',
  check: '#22c55e',
  plus: '#3b82f6',
  'ellipsis-h': '#94a3b8',
  lock: '#475569',
  key: '#ca8a04',
  trash: '#ef4444',
  'question-circle': '#64748b',
  'info-circle': '#0ea5e9',
  'exclamation-triangle': '#f59e0b',
};

const ICON_LABELS: Record<string, string> = {
  home: 'Home',
  bolt: 'Utilities / Power',
  plug: 'Electricity',
  tint: 'Water',
  fire: 'Gas / Heating',
  'lightbulb-o': 'Lighting',
  wifi: 'Internet / Wi‑Fi',
  tv: 'TV / Cable',
  phone: 'Phone',
  mobile: 'Mobile phone',
  desktop: 'Computer',
  laptop: 'Laptop',
  building: 'Building / Office',
  wrench: 'Repairs / Tools',
  money: 'Money / Cash',
  'credit-card': 'Credit card',
  bank: 'Bank / Finance',
  briefcase: 'Work / Business',
  'file-text-o': 'Bills / Documents',
  calendar: 'Calendar / Due dates',
  calculator: 'Taxes / Accounting',
  percent: 'Interest / Discount',
  tag: 'Tag / Label',
  tags: 'Tags',
  'shopping-bag': 'Shopping',
  'shopping-cart': 'Groceries / Cart',
  car: 'Car / Driving',
  bus: 'Bus / Transit',
  subway: 'Subway / Metro',
  bicycle: 'Bicycle',
  plane: 'Flights / Travel',
  train: 'Train',
  ship: 'Cruise / Ferry',
  taxi: 'Taxi / Rideshare',
  motorcycle: 'Motorcycle',
  road: 'Road / Tolls',
  'map-marker': 'Location',
  globe: 'International',
  bed: 'Hotel / Lodging',
  heartbeat: 'Health',
  medkit: 'Medical',
  stethoscope: 'Doctor',
  'hospital-o': 'Hospital',
  ambulance: 'Emergency',
  heart: 'Heart / Care',
  shield: 'Insurance / Protection',
  umbrella: 'Coverage / Protection',
  user: 'Personal',
  users: 'Family / People',
  child: 'Kids',
  paw: 'Pets',
  cutlery: 'Food & Dining',
  coffee: 'Coffee / Cafe',
  beer: 'Alcohol / Bars',
  glass: 'Drinks',
  film: 'Movies / Entertainment',
  music: 'Music',
  headphones: 'Audio / Streaming',
  gamepad: 'Games',
  book: 'Books / Reading',
  'graduation-cap': 'Education',
  gift: 'Gifts',
  camera: 'Photos / Camera',
  'picture-o': 'Pictures',
  'futbol-o': 'Sports',
  star: 'Favorite / Other',
  check: 'Paid / Done',
  plus: 'Add / Other',
  'ellipsis-h': 'Other / Misc',
  lock: 'Security',
  key: 'Keys / Access',
  trash: 'Disposal / Waste',
  'question-circle': 'Unknown',
  'info-circle': 'Info',
  'exclamation-triangle': 'Alert / Fees',
};

/** Older FA5 names → FA4 names used by the app. */
const ICON_ALIASES: Record<string, string> = {
  utensils: 'cutlery',
  'file-invoice-dollar': 'file-text-o',
  'file-invoice': 'file-text-o',
};

export function normalizeExpenseIcon(iconName: string | null | undefined): string {
  if (!iconName) return '';
  return ICON_ALIASES[iconName] || iconName;
}

function formatIconLabel(iconName: string): string {
  const normalized = normalizeExpenseIcon(iconName);
  return ICON_LABELS[normalized] || normalized.replace(/-/g, ' ').replace(/\bo\b/g, '').trim();
}

function getIconColor(iconName: string): string {
  return ICON_COLORS[normalizeExpenseIcon(iconName)] || '#64748b';
}

function findGroupForIcon(iconName: string): string | null {
  const normalized = normalizeExpenseIcon(iconName);
  if (!normalized) return null;
  for (const [key, group] of Object.entries(EXPENSE_ICON_GROUPS)) {
    if (group.icons.includes(normalized)) return key;
  }
  return null;
}

function TooltipIconButton({
  tooltip,
  children,
  ...props
}: {
  tooltip: string;
  children: React.ReactNode;
  [key: string]: any;
}) {
  const buttonRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !tooltip) return;
    const apply = () => {
      const node = buttonRef.current;
      if (!node) return;
      const el =
        node.nodeType === 1
          ? node
          : node._nativeNode ||
            node._internalFiberInstanceHandleDEV?.stateNode?._nativeNode ||
            node._internalFiberInstanceHandleDEV?.stateNode;
      if (el && el.setAttribute) {
        el.setAttribute('title', tooltip);
      }
    };
    apply();
    const t = setTimeout(apply, 50);
    return () => clearTimeout(t);
  }, [tooltip]);

  return (
    <TouchableOpacity ref={buttonRef} accessibilityLabel={tooltip} {...props}>
      {children}
    </TouchableOpacity>
  );
}

interface ExpenseCategoryIconPickerProps {
  value: string;
  onChange: (iconName: string) => void;
  /** Selected category color — used for preview / selected highlight. */
  accentColor?: string;
  disabled?: boolean;
}

export default function ExpenseCategoryIconPicker({
  value,
  onChange,
  accentColor,
  disabled = false,
}: ExpenseCategoryIconPickerProps) {
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const groupKeys = Object.keys(EXPENSE_ICON_GROUPS);
  const normalizedValue = normalizeExpenseIcon(value);
  const [activeGroup, setActiveGroup] = useState(
    () => findGroupForIcon(normalizedValue) || groupKeys[0]
  );

  // Jump to the tab that contains the currently saved icon
  useEffect(() => {
    const group = findGroupForIcon(normalizedValue);
    if (group) {
      setActiveGroup(group);
      setSearch('');
    }
  }, [normalizedValue]);

  const icons = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) {
      const all = Object.values(EXPENSE_ICON_GROUPS).flatMap((g) => g.icons);
      return Array.from(new Set(all)).filter((name) => {
        const label = formatIconLabel(name).toLowerCase();
        return name.toLowerCase().includes(q) || label.includes(q);
      });
    }
    return EXPENSE_ICON_GROUPS[activeGroup]?.icons ?? [];
  }, [search, activeGroup]);

  const selectedColor = accentColor || (normalizedValue ? getIconColor(normalizedValue) : colors.primary);

  return (
    <View style={styles.wrap}>
      {normalizedValue ? (
        <View style={[styles.preview, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <View style={[styles.previewBadge, { backgroundColor: selectedColor }]}>
            <FontAwesome name={normalizedValue as any} size={18} color="#fff" />
          </View>
          <Text style={[styles.previewLabel, { color: colors.text }]} numberOfLines={1}>
            {formatIconLabel(normalizedValue)}
          </Text>
          <TouchableOpacity
            onPress={() => onChange('')}
            disabled={disabled}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Clear</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <TextInput
        style={[
          styles.search,
          { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
        ]}
        value={search}
        onChangeText={setSearch}
        placeholder="Search icons..."
        placeholderTextColor={colors.textSecondary}
        editable={!disabled}
      />

      {!search.trim() ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {groupKeys.map((key) => {
            const selected = key === activeGroup;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.tab,
                  {
                    backgroundColor: selected ? colors.primary : colors.background,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setActiveGroup(key)}
                disabled={disabled}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: selected ? '#fff' : colors.text },
                  ]}
                >
                  {EXPENSE_ICON_GROUPS[key].label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.grid}>
        {icons.map((iconName) => {
          const selected = normalizedValue === iconName;
          const iconColor = getIconColor(iconName);
          const label = formatIconLabel(iconName);
          return (
            <TooltipIconButton
              key={iconName}
              tooltip={label}
              style={[
                styles.cell,
                {
                  backgroundColor: selected ? iconColor : `${iconColor}18`,
                  borderColor: selected ? iconColor : `${iconColor}55`,
                },
              ]}
              onPress={() => onChange(selected ? '' : iconName)}
              disabled={disabled}
            >
              <FontAwesome
                name={iconName as any}
                size={20}
                color={selected ? '#fff' : iconColor}
              />
            </TooltipIconButton>
          );
        })}
      </View>
      {icons.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>No icons match</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewBadge: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  search: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  tabs: {
    flexGrow: 0,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
