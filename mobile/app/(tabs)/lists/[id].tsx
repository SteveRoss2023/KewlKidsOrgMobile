import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  Modal,
  FlatList,
  Platform,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';

// Conditionally import DraggableFlatList to handle cases where reanimated isn't initialized
let DraggableFlatList: any = null;
let ScaleDecorator: any = null;
let RenderItemParams: any = null;

if (Platform.OS !== 'web') {
  try {
    const DraggableFlatListModule = require('react-native-draggable-flatlist');
    DraggableFlatList = DraggableFlatListModule.default;
    ScaleDecorator = DraggableFlatListModule.ScaleDecorator;
    RenderItemParams = DraggableFlatListModule.RenderItemParams;
  } catch (error) {
    console.warn('react-native-draggable-flatlist not available (reanimated may not be initialized):', error);
  }
}
import GlobalNavBar from '../../../components/GlobalNavBar';
import { useTheme } from '../../../contexts/ThemeContext';
import { useFamily } from '../../../contexts/FamilyContext';
import ListService from '../../../services/listService';
import oauthService from '../../../services/oauthService';
import { List, ListItem, ListSection, GroceryCategory, CreateListItemData, UpdateListItemData } from '../../../types/lists';
import ListItemComponent from '../../../components/lists/ListItemComponent';
import SectionRow from '../../../components/lists/SectionRow';
import SectionFormModal from '../../../components/lists/SectionFormModal';
import AddSectionForm from '../../../components/lists/AddSectionForm';
import CopyChecklistModal from '../../../components/lists/CopyChecklistModal';
import CategoryGroup from '../../../components/lists/CategoryGroup';
import AddItemForm from '../../../components/lists/AddItemForm';
import AlertModal from '../../../components/AlertModal';
import ConfirmModal from '../../../components/ConfirmModal';
import DraggableListItem from '../../../components/lists/DraggableListItem';
import { APIError } from '../../../services/api';
import apiClient from '../../../services/api';
import { useVoiceRecognition } from '../../../hooks/useVoiceRecognition';
import { speak } from '../../../utils/voiceFeedback';
import {
  parseAddItem,
  parseDeleteItem,
  parseUpdateItem,
  findMatchingItems,
  parseChecklistBareAddItemIntent,
  parseChecklistBareDeleteIntent,
  parseChecklistBareUpdateIntent,
  parseAddSectionCommand,
  findMatchingSections,
  isCancelCommand,
  capitalizeWords,
  parseVoiceSelectionNumber,
  normalizeText,
  stripChecklistVoiceItemQueryForSearch,
  findChecklistVoiceDeleteMatches,
  isAffirmativeResponse,
  isNegativeResponse,
  formatDeleteQueryForSpeech,
} from '../../../utils/voiceCommands';
import VoiceButton from '../../../components/VoiceButton';
import ThemeAwarePicker from '../../../components/lists/ThemeAwarePicker';
import { sortSectionsByDateAndOrder, formatLocalISODate } from '../../../utils/sectionSort';

function formatSectionDateForVoice(sectionDate: string | undefined): string {
  if (!sectionDate || !/^\d{4}-\d{2}-\d{2}$/.test(sectionDate)) return '';
  const [y, m, d] = sectionDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function TooltipButton({
  children,
  tooltip,
  ...props
}: {
  children: React.ReactNode;
  tooltip: string;
  [key: string]: any;
}) {
  const buttonRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS === 'web' && tooltip) {
      const setTitle = () => {
        if (buttonRef?.current) {
          const getDOMNode = (node: any): HTMLElement | null => {
            if (!node) return null;
            if (node.nodeType === 1) return node;
            if (node._nativeNode) return node._nativeNode;
            if (node._internalFiberInstanceHandleDEV) {
              const fiber = node._internalFiberInstanceHandleDEV;
              if (fiber && fiber.stateNode) {
                const stateNode = fiber.stateNode;
                if (stateNode.nodeType === 1) return stateNode;
                if (stateNode._nativeNode) return stateNode._nativeNode;
              }
            }
            return null;
          };
          const domNode = getDOMNode(buttonRef.current);
          if (domNode) {
            domNode.setAttribute('title', tooltip);
          }
        }
      };
      setTitle();
      const timeout = setTimeout(setTitle, 100);
      return () => clearTimeout(timeout);
    }
  }, [tooltip]);

  return (
    <TouchableOpacity ref={buttonRef} accessibilityLabel={tooltip} {...props}>
      {children}
    </TouchableOpacity>
  );
}

// Web-only: makes a checklist section block draggable (reorder accordions)
function DraggableChecklistSection({
  sectionId,
  sectionIndex,
  children,
  isDragging,
  isDragOver,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  sectionId: number;
  sectionIndex: number;
  children: React.ReactNode;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: (id: number) => void;
  onDragOver: (e: any, index: number) => void;
  onDragLeave: () => void;
  onDrop: (e: any, index: number) => void;
  onDragEnd: () => void;
}) {
  const viewRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !viewRef.current) return;
    const getDOMNode = (node: any): HTMLElement | null => {
      if (!node) return null;
      if (node.nodeType === 1) return node;
      if (node._nativeNode) return node._nativeNode;
      if (node._internalFiberInstanceHandleDEV?.stateNode) {
        const s = node._internalFiberInstanceHandleDEV.stateNode;
        return s?.nodeType === 1 ? s : s?._nativeNode ?? null;
      }
      return null;
    };
    const dom = getDOMNode(viewRef.current);
    if (!dom) return;
    dom.setAttribute('draggable', 'true');
    dom.style.cursor = isDragging ? 'grabbing' : 'grab';
    dom.style.userSelect = 'none';
    const handleDragStart = (e: DragEvent) => {
      const t = (e.target as HTMLElement).closest('[data-no-drag="true"], button, [role="button"]');
      if (t) {
        e.preventDefault();
        return;
      }
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', sectionId.toString());
      }
      onDragStart(sectionId);
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      onDragOver(e as any, sectionIndex);
    };
    const handleDragLeave = (e: DragEvent) => {
      const related = e.relatedTarget as HTMLElement;
      if (!related || !dom.contains(related)) onDragLeave();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDrop(e as any, sectionIndex);
    };
    const handleDragEnd = () => onDragEnd();
    dom.addEventListener('dragstart', handleDragStart);
    dom.addEventListener('dragover', handleDragOver);
    dom.addEventListener('dragleave', handleDragLeave);
    dom.addEventListener('drop', handleDrop);
    dom.addEventListener('dragend', handleDragEnd);
    return () => {
      dom.removeAttribute('draggable');
      dom.removeEventListener('dragstart', handleDragStart);
      dom.removeEventListener('dragover', handleDragOver);
      dom.removeEventListener('dragleave', handleDragLeave);
      dom.removeEventListener('drop', handleDrop);
      dom.removeEventListener('dragend', handleDragEnd);
    };
  }, [sectionId, sectionIndex, isDragging, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd]);

  return (
    <View
      ref={viewRef}
      style={[
        { opacity: isDragging ? 0.6 : 1, borderTopWidth: isDragOver ? 3 : 0, borderTopColor: isDragOver ? '#007AFF' : 'transparent' },
        Platform.OS === 'web' && ({ cursor: (isDragging ? 'grabbing' : 'grab') as any, userSelect: 'none' } as any),
      ]}
    >
      {children}
    </View>
  );
}

// Web-only: draggable checklist item row (reorder within section)
function DraggableChecklistItemRow({
  itemId,
  children,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  itemId: number;
  children: React.ReactNode;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (id: number) => void;
  onDragOver: (e: any, id: number) => void;
  onDragLeave: () => void;
  onDrop: (e: any, id: number) => void;
  onDragEnd: () => void;
}) {
  const viewRef = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !viewRef.current) return;
    const getDOMNode = (node: any): HTMLElement | null => {
      if (!node) return null;
      if (node.nodeType === 1) return node;
      if (node._nativeNode) return node._nativeNode;
      if (node._internalFiberInstanceHandleDEV?.stateNode) {
        const s = node._internalFiberInstanceHandleDEV.stateNode;
        return s?.nodeType === 1 ? s : s?._nativeNode ?? null;
      }
      return null;
    };
    const dom = getDOMNode(viewRef.current);
    if (!dom) return;
    dom.setAttribute('draggable', 'true');
    (dom.style as any).cursor = isDragging ? 'grabbing' : 'grab';
    dom.style.userSelect = 'none';
    const handleDragStart = (e: DragEvent) => {
      const t = (e.target as HTMLElement).closest('[data-no-drag="true"], button, [role="button"]');
      if (t) {
        e.preventDefault();
        return;
      }
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', itemId.toString());
      }
      onDragStart(itemId);
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      onDragOver(e as any, itemId);
    };
    const handleDragLeave = (e: DragEvent) => {
      const related = e.relatedTarget as HTMLElement;
      if (!related || !dom.contains(related)) onDragLeave();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDrop(e as any, itemId);
    };
    const handleDragEnd = () => onDragEnd();
    dom.addEventListener('dragstart', handleDragStart);
    dom.addEventListener('dragover', handleDragOver);
    dom.addEventListener('dragleave', handleDragLeave);
    dom.addEventListener('drop', handleDrop);
    dom.addEventListener('dragend', handleDragEnd);
    return () => {
      dom.removeAttribute('draggable');
      dom.removeEventListener('dragstart', handleDragStart);
      dom.removeEventListener('dragover', handleDragOver);
      dom.removeEventListener('dragleave', handleDragLeave);
      dom.removeEventListener('drop', handleDrop);
      dom.removeEventListener('dragend', handleDragEnd);
    };
  }, [itemId, isDragging, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd]);

  return (
    <View
      ref={viewRef}
      style={[
        { opacity: isDragging ? 0.6 : 1, borderTopWidth: isDropTarget ? 3 : 0, borderTopColor: isDropTarget ? '#007AFF' : 'transparent' },
        Platform.OS === 'web' && ({ cursor: (isDragging ? 'grabbing' : 'grab') as any, userSelect: 'none' } as any),
      ]}
    >
      {children}
    </View>
  );
}

const NARROW_VIEWPORT_WIDTH = 480;
const TITLE_FONT_SIZE_MIN = 10;
const TITLE_FONT_SIZE_REGULAR_WEB = 22;
const TITLE_FONT_SIZE_REGULAR_NATIVE = 16;

export default function ListDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const listId = params.id ? parseInt(params.id as string, 10) : null;
  const listIdRef = useRef(listId);
  listIdRef.current = listId;
  const { width: windowWidth } = useWindowDimensions();
  const { colors, theme } = useTheme();
  const { selectedFamily } = useFamily();
  const isNarrowViewport = Platform.OS === 'web' && windowWidth < NARROW_VIEWPORT_WIDTH;
  const [titleContainerWidth, setTitleContainerWidth] = useState(0);
  const [titleFontSize, setTitleFontSize] = useState(
    Platform.OS === 'web' ? TITLE_FONT_SIZE_REGULAR_WEB : TITLE_FONT_SIZE_REGULAR_NATIVE
  );
  const [list, setList] = useState<List | null>(null);
  const [listItems, setListItems] = useState<ListItem[]>([]);
  const [sections, setSections] = useState<ListSection[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [showAddSection, setShowAddSection] = useState(false);
  const [editSection, setEditSection] = useState<ListSection | null>(null);
  const [sectionFormSaving, setSectionFormSaving] = useState(false);
  const [copyChecklistModalOpen, setCopyChecklistModalOpen] = useState(false);
  const [copyChecklistSaving, setCopyChecklistSaving] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [outlookPushLoading, setOutlookPushLoading] = useState(false);
  const [categories, setCategories] = useState<GroceryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddItem, setShowAddItem] = useState(false);
  const [editingItem, setEditingItem] = useState<ListItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [updatingItem, setUpdatingItem] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    itemId: number | null;
    itemName: string;
  }>({
    isOpen: false,
    itemId: null,
    itemName: '',
  });
  const [deleteRecipeConfirm, setDeleteRecipeConfirm] = useState<{
    isOpen: boolean;
    recipeName: string;
    itemCount: number;
  }>({
    isOpen: false,
    recipeName: '',
    itemCount: 0,
  });
  const [deletingRecipeItems, setDeletingRecipeItems] = useState(false);
  const [moveItemModal, setMoveItemModal] = useState<{
    isOpen: boolean;
    item: ListItem | null;
  }>({
    isOpen: false,
    item: null,
  });
  const [availableLists, setAvailableLists] = useState<List[]>([]);
  const [selectedTargetListId, setSelectedTargetListId] = useState<number | null>(null);
  const [movingItem, setMovingItem] = useState(false);
  const [moveItemResultModal, setMoveItemResultModal] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'error';
  }>({
    visible: false,
    message: '',
    type: 'success',
  });
  const [selectedRecipeFilter, setSelectedRecipeFilter] = useState<string>('');
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Checklist section drag (reorder accordions)
  const [draggedSectionId, setDraggedSectionId] = useState<number | null>(null);
  const [dragOverSectionIndex, setDragOverSectionIndex] = useState<number | null>(null);
  const [reorderingSections, setReorderingSections] = useState(false);
  // Checklist item drag (reorder within section, web only)
  const [draggedChecklistItemId, setDraggedChecklistItemId] = useState<number | null>(null);
  const [dropTargetChecklistItemId, setDropTargetChecklistItemId] = useState<number | null>(null);
  const { isListening, transcript, start, stop, reset, isSupported } = useVoiceRecognition();
  const lastProcessedTranscriptRef = useRef('');
  const deleteConfirmFromVoicePickRef = useRef(false);
  const [awaitingNumberSelection, setAwaitingNumberSelection] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<ListItem[]>([]);
  const [pendingAction, setPendingAction] = useState<
    'delete' | 'update' | 'checklist_update_multi' | null
  >(null);
  const [showVoiceHelpModal, setShowVoiceHelpModal] = useState(false);
  const [checklistVoicePhase, setChecklistVoicePhase] = useState<
    | 'idle'
    | 'add_section_or_item'
    | 'pick_section'
    | 'item_name'
    | 'section_title'
    | 'delete_section_or_item'
    | 'delete_pick_item'
    | 'update_section_or_item'
    | 'update_pick_item'
    | 'update_new_name'
    | 'delete_confirm'
  >('idle');
  const [pendingSectionsForVoice, setPendingSectionsForVoice] = useState<ListSection[]>([]);
  const [pendingItemsForVoice, setPendingItemsForVoice] = useState<ListItem[]>([]);
  const [pendingChecklistItemName, setPendingChecklistItemName] = useState<string | null>(null);
  const [checklistTargetSectionId, setChecklistTargetSectionId] = useState<number | null>(null);
  const [checklistSectionPickKind, setChecklistSectionPickKind] = useState<
    'add' | 'delete' | 'update' | null
  >(null);
  const [checklistUpdateTargetItemId, setChecklistUpdateTargetItemId] = useState<number | null>(null);
  const [checklistDeleteConfirmItemId, setChecklistDeleteConfirmItemId] = useState<number | null>(null);
  const [voiceDeletePickModalOpen, setVoiceDeletePickModalOpen] = useState(false);
  const [voiceDeletePickCandidates, setVoiceDeletePickCandidates] = useState<ListItem[]>([]);

  const needTitleShrink =
    (Platform.OS === 'android' || isNarrowViewport) && !!list?.name;

  const isGroceryList = list?.list_type === 'grocery';
  const isChecklistList = list?.list_type === 'checklist';
  const isShoppingList = list?.list_type === 'shopping';
  const isTodoList = list?.list_type === 'todo';
  const isIdeasList = list?.list_type === 'ideas';
  const isOtherList = list?.list_type === 'other';
  // Lists that support drag and drop, reordering, and move item features
  const supportsDragAndDrop = isTodoList || isIdeasList || isOtherList;

  const fetchListSections = async (forListId?: number) => {
    const targetId = forListId ?? listId;
    if (!targetId) return;
    const rid = targetId;
    try {
      const fetched = await ListService.getListSections(rid);
      if (listIdRef.current !== rid) return;
      setSections(sortSectionsByDateAndOrder(fetched));
    } catch (err) {
      console.error('Error fetching list sections:', err);
    }
  };

  // Load list, items, and sections in parallel when screen focuses (items no longer wait on list metadata).
  useFocusEffect(
    useCallback(() => {
      if (!listId || !selectedFamily) return;
      fetchList();
      fetchListItems(false, listId);
      fetchListSections(listId);
    }, [listId, selectedFamily])
  );

  // Grocery categories are only needed for grocery lists (skip for checklists, todos, etc.).
  useEffect(() => {
    if (list?.list_type === 'grocery' && selectedFamily) {
      fetchCategories();
    }
  }, [list?.id, list?.list_type, selectedFamily?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!isChecklistList) {
        setOutlookConnected(false);
        return undefined;
      }
      let cancelled = false;
      (async () => {
        try {
          const status = await oauthService.checkConnection('outlook');
          if (!cancelled) {
            setOutlookConnected(!!status.connected);
          }
        } catch {
          if (!cancelled) setOutlookConnected(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [isChecklistList])
  );

  // Reset title font size when list changes
  useEffect(() => {
    setTitleFontSize(
      Platform.OS === 'web' ? TITLE_FONT_SIZE_REGULAR_WEB : TITLE_FONT_SIZE_REGULAR_NATIVE
    );
  }, [list?.id]);

  // Initialize collapsed categories only when list changes (new list loaded)
  // Preserve accordion state when items are added/removed
  const lastListIdRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (isGroceryList && listItems.length > 0) {
      const currentListId = list?.id;

      // Only reset collapsed categories if this is a new list
      if (currentListId !== lastListIdRef.current) {
        lastListIdRef.current = currentListId || null;
        // Compute categories from listItems and collapse all for new list
        const categoryIds = new Set<string>();
        listItems.forEach((item) => {
          const categoryId = item.category ? String(item.category) : 'uncategorized';
          categoryIds.add(categoryId);
        });
        setCollapsedCategories(categoryIds);
      } else {
        // For the same list, just clean up categories that no longer exist
        setCollapsedCategories((prev) => {
          const currentCategoryIds = new Set<string>();
          listItems.forEach((item) => {
            const categoryId = item.category ? String(item.category) : 'uncategorized';
            currentCategoryIds.add(categoryId);
          });

          // Remove categories that no longer exist, but keep the rest
          const newSet = new Set(prev);
          prev.forEach((categoryId) => {
            if (!currentCategoryIds.has(categoryId)) {
              newSet.delete(categoryId);
            }
          });
          return newSet;
        });
      }
    }
  }, [list?.id, isGroceryList, listItems]); // Include listItems to clean up removed categories, but preserve state

  // Handle voice commands
  useEffect(() => {
    if (!transcript || !isSupported || !list) return;

    // Prevent duplicate processing of the same transcript
    if (transcript === lastProcessedTranscriptRef.current) return;
    lastProcessedTranscriptRef.current = transcript;

    const rawTrimmed = transcript.trim();

    const clearChecklistVoice = () => {
      setChecklistVoicePhase('idle');
      setPendingSectionsForVoice([]);
      setPendingItemsForVoice([]);
      setPendingChecklistItemName(null);
      setChecklistTargetSectionId(null);
      setChecklistSectionPickKind(null);
      setChecklistUpdateTargetItemId(null);
      setChecklistDeleteConfirmItemId(null);
      setVoiceDeletePickModalOpen(false);
      setVoiceDeletePickCandidates([]);
      deleteConfirmFromVoicePickRef.current = false;
    };

    const handleVoiceCommand = async () => {
      const text = transcript.toLowerCase().trim();
      const stripLeadingThe = (s: string) => s.replace(/^the\s+/i, '').trim();

      try {
        if (isChecklistList && checklistVoicePhase !== 'idle' && isCancelCommand(transcript)) {
          stop();
          clearChecklistVoice();
          lastProcessedTranscriptRef.current = '';
          reset();
          speak('Cancelled.');
          return;
        }

        // Handle number selection for multiple matches
        if (awaitingNumberSelection) {
          if (isCancelCommand(transcript)) {
            stop();
            setAwaitingNumberSelection(false);
            setPendingMatches([]);
            setPendingAction(null);
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('Cancelled.');
            return;
          }

          const number = parseVoiceSelectionNumber(transcript, pendingMatches.length);
          if (number != null) {
            const selected = pendingMatches[number - 1];
            stop();

            if (pendingAction === 'checklist_update_multi') {
              setAwaitingNumberSelection(false);
              setPendingMatches([]);
              setPendingAction(null);
              setChecklistUpdateTargetItemId(selected.id);
              setChecklistVoicePhase('update_new_name');
              lastProcessedTranscriptRef.current = '';
              reset();
              speak('What should the new name be?', () => {
                setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
              });
              return;
            }

            if (pendingAction === 'delete') {
              try {
                await ListService.deleteListItem(selected.id);
                await fetchListItems();
                speak(`Deleted ${selected.name}.`);
              } catch (err) {
                console.error('Error deleting item:', err);
                speak('Sorry, I could not delete the item.');
              }
            } else if (pendingAction === 'update') {
              speak('Please use the update command with both old and new names.');
            }
            setAwaitingNumberSelection(false);
            setPendingMatches([]);
            setPendingAction(null);
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }

          speak(
            `Please say which item, 1 through ${pendingMatches.length}. For example, 1, 2, one, or two.`,
            () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            }
          );
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'delete_confirm') {
          stop();
          if (isNegativeResponse(transcript)) {
            clearChecklistVoice();
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('Okay, not deleting.');
            return;
          }
          if (isAffirmativeResponse(transcript)) {
            const delId = checklistDeleteConfirmItemId;
            if (delId == null) {
              clearChecklistVoice();
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            const toDelete = listItems.find((i) => i.id === delId);
            try {
              await ListService.deleteListItem(delId);
              await fetchListItems();
              speak(toDelete ? `Deleted ${toDelete.name}.` : 'Item deleted.');
            } catch (err) {
              console.error('Error deleting item:', err);
              speak('Sorry, I could not delete the item.');
            }
            clearChecklistVoice();
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
          speak('Say yes to delete, or no to cancel.', () => {
            setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
          });
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'add_section_or_item') {
          stop();
          const nAdd = parseVoiceSelectionNumber(transcript, sections.length);
          if (nAdd != null) {
            const section = sections[nAdd - 1];
            setChecklistTargetSectionId(section.id);
            setChecklistVoicePhase('item_name');
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('What should the item be called?', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          const secAddMatches = findMatchingSections(sections, stripLeadingThe(rawTrimmed));
          if (secAddMatches.length === 1) {
            setChecklistTargetSectionId(secAddMatches[0].id);
            setChecklistVoicePhase('item_name');
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('What should the item be called?', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          if (secAddMatches.length > 1) {
            setPendingSectionsForVoice(secAddMatches);
            setChecklistSectionPickKind('add');
            setChecklistVoicePhase('pick_section');
            let amsg = 'Which section? ';
            secAddMatches.forEach((s, i) => {
              const dateLbl = formatSectionDateForVoice(s.section_date);
              amsg += `${i + 1}: ${s.title}${dateLbl ? ', ' + dateLbl : ''}. `;
            });
            amsg += 'Say the number.';
            lastProcessedTranscriptRef.current = '';
            reset();
            speak(amsg, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          const guessedName =
            normalizeText(capitalizeWords(rawTrimmed)) === 'add' ? null : capitalizeWords(rawTrimmed);
          if (!rawTrimmed || !guessedName) {
            speak('Say the section number or name, or the item name first.', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
          setPendingChecklistItemName(guessedName);
          setPendingSectionsForVoice(sections);
          setChecklistSectionPickKind('add');
          setChecklistVoicePhase('pick_section');
          let imsg = `Which section for ${guessedName}? `;
          sections.forEach((s, i) => {
            const dateLbl = formatSectionDateForVoice(s.section_date);
            imsg += `${i + 1}: ${s.title}${dateLbl ? ', ' + dateLbl : ''}. `;
          });
          imsg += 'Say the number.';
          lastProcessedTranscriptRef.current = '';
          reset();
          speak(imsg, () => {
            setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
          });
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'pick_section') {
          stop();
          const n = parseVoiceSelectionNumber(transcript, pendingSectionsForVoice.length);
          if (n != null) {
            const section = pendingSectionsForVoice[n - 1];
            setPendingSectionsForVoice([]);
            const kind = checklistSectionPickKind ?? 'add';
            setChecklistSectionPickKind(null);

            if (kind === 'delete') {
              const inDel = listItems
                .filter((i) => i.section === section.id)
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
              if (inDel.length === 0) {
                speak('No items in that section to delete.', () => {
                  lastProcessedTranscriptRef.current = '';
                  reset();
                });
                clearChecklistVoice();
                lastProcessedTranscriptRef.current = '';
                reset();
                return;
              }
              setPendingItemsForVoice(inDel);
              setChecklistVoicePhase('delete_pick_item');
              let dmsg = 'Which item to delete? ';
              inDel.forEach((it, i) => {
                dmsg += `${i + 1}: ${it.name}. `;
              });
              dmsg += 'Say the number.';
              lastProcessedTranscriptRef.current = '';
              reset();
              speak(dmsg, () => {
                setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
              });
              return;
            }

            if (kind === 'update') {
              const inUpd = listItems
                .filter((i) => i.section === section.id)
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
              if (inUpd.length === 0) {
                speak('No items in that section to update.', () => {
                  lastProcessedTranscriptRef.current = '';
                  reset();
                });
                clearChecklistVoice();
                lastProcessedTranscriptRef.current = '';
                reset();
                return;
              }
              setPendingItemsForVoice(inUpd);
              setChecklistVoicePhase('update_pick_item');
              let umsg = 'Which item to update? ';
              inUpd.forEach((it, i) => {
                umsg += `${i + 1}: ${it.name}. `;
              });
              umsg += 'Say the number.';
              lastProcessedTranscriptRef.current = '';
              reset();
              speak(umsg, () => {
                setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
              });
              return;
            }

            const nameSnapshot = pendingChecklistItemName;
            setPendingChecklistItemName(null);

            if (nameSnapshot) {
              setChecklistVoicePhase('idle');
              try {
                await ListService.createListItem({
                  list: list.id,
                  name: nameSnapshot,
                  section: section.id,
                });
                await fetchListItems();
                speak('Item added successfully.');
              } catch (err) {
                console.error('Error adding checklist item:', err);
                speak('Sorry, I could not add the item. Please try again.');
              }
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }

            setChecklistTargetSectionId(section.id);
            setChecklistVoicePhase('item_name');
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('What should the item be called?', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }

          speak(
            `Please say a number from 1 to ${pendingSectionsForVoice.length}. For example, 1, 2, one, or two.`,
            () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2000 }), 400);
            }
          );
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'delete_pick_item') {
          stop();
          const dn = parseVoiceSelectionNumber(transcript, pendingItemsForVoice.length);
          if (dn != null) {
            const delIt = pendingItemsForVoice[dn - 1];
            try {
              await ListService.deleteListItem(delIt.id);
              await fetchListItems();
              speak(`Deleted ${delIt.name}.`);
            } catch (err) {
              console.error('Error deleting item:', err);
              speak('Sorry, I could not delete the item.');
            }
            clearChecklistVoice();
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
          speak(
            `Please say which item, 1 through ${pendingItemsForVoice.length}. For example, 1, 2, one, or two.`,
            () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            }
          );
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'update_pick_item') {
          stop();
          const un = parseVoiceSelectionNumber(transcript, pendingItemsForVoice.length);
          if (un != null) {
            const upIt = pendingItemsForVoice[un - 1];
            setPendingItemsForVoice([]);
            setChecklistUpdateTargetItemId(upIt.id);
            setChecklistVoicePhase('update_new_name');
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('What should the new name be?', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          speak(
            `Please say which item, 1 through ${pendingItemsForVoice.length}. For example, 1, 2, one, or two.`,
            () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            }
          );
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'update_new_name') {
          stop();
          if (!rawTrimmed) {
            speak("I didn't catch that. What should the new name be?", () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2000 }), 400);
            });
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
          const newNm = capitalizeWords(rawTrimmed);
          const upId = checklistUpdateTargetItemId;
          if (upId == null) {
            clearChecklistVoice();
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
          try {
            await ListService.updateListItem(upId, { name: newNm });
            await fetchListItems();
            speak('Item updated successfully.');
          } catch (err) {
            console.error('Error updating item:', err);
            speak('Sorry, I could not update the item. Please try again.');
          }
          clearChecklistVoice();
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'delete_section_or_item') {
          stop();
          const nd = parseVoiceSelectionNumber(transcript, sections.length);
          if (nd != null) {
            const s = sections[nd - 1];
            const inD = listItems
              .filter((i) => i.section === s.id)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            if (inD.length === 0) {
              speak('No items in that section to delete.', () => {
                lastProcessedTranscriptRef.current = '';
                reset();
              });
              clearChecklistVoice();
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            setPendingItemsForVoice(inD);
            setChecklistVoicePhase('delete_pick_item');
            let dm = 'Which item to delete? ';
            inD.forEach((it, i) => {
              dm += `${i + 1}: ${it.name}. `;
            });
            dm += 'Say the number.';
            lastProcessedTranscriptRef.current = '';
            reset();
            speak(dm, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          const secDM = findMatchingSections(sections, stripLeadingThe(rawTrimmed));
          if (secDM.length === 1) {
            const s1 = secDM[0];
            const inD1 = listItems
              .filter((i) => i.section === s1.id)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            if (inD1.length === 0) {
              speak('No items in that section to delete.', () => {
                lastProcessedTranscriptRef.current = '';
                reset();
              });
              clearChecklistVoice();
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            setPendingItemsForVoice(inD1);
            setChecklistVoicePhase('delete_pick_item');
            let dm1 = 'Which item to delete? ';
            inD1.forEach((it, i) => {
              dm1 += `${i + 1}: ${it.name}. `;
            });
            dm1 += 'Say the number.';
            lastProcessedTranscriptRef.current = '';
            reset();
            speak(dm1, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          if (secDM.length > 1) {
            setPendingSectionsForVoice(secDM);
            setChecklistSectionPickKind('delete');
            setChecklistVoicePhase('pick_section');
            let sm = 'Which section? ';
            secDM.forEach((s, i) => {
              const dateLbl = formatSectionDateForVoice(s.section_date);
              sm += `${i + 1}: ${s.title}${dateLbl ? ', ' + dateLbl : ''}. `;
            });
            sm += 'Say the number.';
            lastProcessedTranscriptRef.current = '';
            reset();
            speak(sm, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          const itemDM = findMatchingItems(listItems, stripLeadingThe(rawTrimmed), (i) => i.name);
          if (itemDM.length === 1) {
            try {
              await ListService.deleteListItem(itemDM[0].id);
              await fetchListItems();
              speak(`Deleted ${itemDM[0].name}.`);
            } catch (err) {
              console.error('Error deleting item:', err);
              speak('Sorry, I could not delete the item.');
            }
            clearChecklistVoice();
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
          if (itemDM.length > 1) {
            setPendingMatches(itemDM);
            setPendingAction('delete');
            setAwaitingNumberSelection(true);
            clearChecklistVoice();
            lastProcessedTranscriptRef.current = '';
            reset();
            let m = 'I found multiple matching items. Please specify which one to delete: ';
            itemDM.forEach((item, index) => {
              m += `${index + 1}: ${item.name}. `;
            });
            speak(m, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2000 }), 500);
            });
            return;
          }
          speak('No matching section or item. Say the section number or name, or the item name to delete.', () => {
            setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
          });
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'update_section_or_item') {
          stop();
          const nu = parseVoiceSelectionNumber(transcript, sections.length);
          if (nu != null) {
            const su = sections[nu - 1];
            const inU = listItems
              .filter((i) => i.section === su.id)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            if (inU.length === 0) {
              speak('No items in that section to update.', () => {
                lastProcessedTranscriptRef.current = '';
                reset();
              });
              clearChecklistVoice();
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            setPendingItemsForVoice(inU);
            setChecklistVoicePhase('update_pick_item');
            let um = 'Which item to update? ';
            inU.forEach((it, i) => {
              um += `${i + 1}: ${it.name}. `;
            });
            um += 'Say the number.';
            lastProcessedTranscriptRef.current = '';
            reset();
            speak(um, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          const secUM = findMatchingSections(sections, stripLeadingThe(rawTrimmed));
          if (secUM.length === 1) {
            const s1u = secUM[0];
            const inU1 = listItems
              .filter((i) => i.section === s1u.id)
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            if (inU1.length === 0) {
              speak('No items in that section to update.', () => {
                lastProcessedTranscriptRef.current = '';
                reset();
              });
              clearChecklistVoice();
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            setPendingItemsForVoice(inU1);
            setChecklistVoicePhase('update_pick_item');
            let um1 = 'Which item to update? ';
            inU1.forEach((it, i) => {
              um1 += `${i + 1}: ${it.name}. `;
            });
            um1 += 'Say the number.';
            lastProcessedTranscriptRef.current = '';
            reset();
            speak(um1, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          if (secUM.length > 1) {
            setPendingSectionsForVoice(secUM);
            setChecklistSectionPickKind('update');
            setChecklistVoicePhase('pick_section');
            let smu = 'Which section? ';
            secUM.forEach((s, i) => {
              const dateLbl = formatSectionDateForVoice(s.section_date);
              smu += `${i + 1}: ${s.title}${dateLbl ? ', ' + dateLbl : ''}. `;
            });
            smu += 'Say the number.';
            lastProcessedTranscriptRef.current = '';
            reset();
            speak(smu, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          const itemUM = findMatchingItems(listItems, stripLeadingThe(rawTrimmed), (i) => i.name);
          if (itemUM.length === 1) {
            setChecklistUpdateTargetItemId(itemUM[0].id);
            setChecklistVoicePhase('update_new_name');
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('What should the new name be?', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
          if (itemUM.length > 1) {
            setPendingMatches(itemUM);
            setPendingAction('checklist_update_multi');
            setAwaitingNumberSelection(true);
            clearChecklistVoice();
            lastProcessedTranscriptRef.current = '';
            reset();
            let m = 'I found multiple matching items. Please specify which one to update: ';
            itemUM.forEach((item, index) => {
              m += `${index + 1}: ${item.name}. `;
            });
            speak(m, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2000 }), 500);
            });
            return;
          }
          speak('No matching section or item. Say the section number or name, or the item to update.', () => {
            setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
          });
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'item_name') {
          stop();
          if (!rawTrimmed) {
            speak("I didn't catch a name. Try again.", () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2000 }), 400);
            });
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
          const name = capitalizeWords(rawTrimmed);
          const sid = checklistTargetSectionId;
          if (sid == null) {
            clearChecklistVoice();
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
          try {
            await ListService.createListItem({
              list: list.id,
              name,
              section: sid,
            });
            await fetchListItems();
            speak('Item added successfully.');
          } catch (err) {
            console.error('Error adding checklist item:', err);
            speak('Sorry, I could not add the item. Please try again.');
          }
          clearChecklistVoice();
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList && checklistVoicePhase === 'section_title') {
          stop();
          if (!rawTrimmed) {
            speak('What should the section be called?', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2000 }), 400);
            });
            lastProcessedTranscriptRef.current = '';
            reset();
            return;
          }
          const title = capitalizeWords(rawTrimmed);
          try {
            const created = await ListService.createListSection({
              list: list.id,
              order: sections.length,
              title,
              section_date: formatLocalISODate(),
            });
            await fetchListSections();
            if (created.calendar_updated) {
              speak('Section added. Calendar updated.');
            } else {
              speak('Section added successfully.');
            }
          } catch (err) {
            console.error('Error adding section:', err);
            speak('Sorry, I could not add the section. Please try again.');
          }
          clearChecklistVoice();
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        // Ignore transcripts that look like feedback messages
        const feedbackPatterns = [
          'added successfully',
          'deleted successfully',
          'updated successfully',
          'could not add',
          'could not delete',
          'could not update',
          'could not find',
          'please use',
          'sorry',
          'error',
          'try again',
          'please specify',
          'cancelled',
          'calendar updated',
        ];
        if (feedbackPatterns.some((pattern) => text.includes(pattern))) {
          console.log('🎤 [LIST DETAIL] Ignoring feedback message:', text);
          lastProcessedTranscriptRef.current = '';
          reset();
          stop();
          return;
        }

        if (isChecklistList) {
          const addSec = parseAddSectionCommand(text);
          if (addSec) {
            stop();
            if (addSec.title) {
              try {
                const created = await ListService.createListSection({
                  list: list.id,
                  order: sections.length,
                  title: addSec.title,
                  section_date: formatLocalISODate(),
                });
                await fetchListSections();
                if (created.calendar_updated) {
                  speak('Section added. Calendar updated.');
                } else {
                  speak('Section added successfully.');
                }
              } catch (err) {
                console.error('Error adding section:', err);
                speak('Sorry, I could not add the section. Please try again.');
              }
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            setChecklistVoicePhase('section_title');
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('What should the section be called?', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }

          if (parseChecklistBareAddItemIntent(text)) {
            stop();
            if (sections.length === 0) {
              speak(
                'This checklist has no sections yet. Say add section to create one first.',
                () => {
                  lastProcessedTranscriptRef.current = '';
                  reset();
                }
              );
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            setPendingChecklistItemName(null);
            setChecklistVoicePhase('add_section_or_item');
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('Say the section number or name, or the item name first.', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }

          const addNamed = parseAddItem(text);
          if (addNamed) {
            stop();
            if (sections.length === 0) {
              speak(
                'This checklist has no sections yet. Say add section to create one first.',
                () => {
                  lastProcessedTranscriptRef.current = '';
                  reset();
                }
              );
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            // "add add" / echo → name "Add" is not a real item; prompt for name after section
            const itemNameForPending =
              normalizeText(addNamed.name) === 'add' ? null : addNamed.name;
            setPendingChecklistItemName(itemNameForPending);
            setPendingSectionsForVoice(sections);
            setChecklistSectionPickKind('add');
            setChecklistVoicePhase('pick_section');
            let msg = 'Which section? ';
            sections.forEach((s, i) => {
              const dateLbl = formatSectionDateForVoice(s.section_date);
              msg += `${i + 1}: ${s.title}${dateLbl ? ', ' + dateLbl : ''}. `;
            });
            msg += 'Say the number.';
            lastProcessedTranscriptRef.current = '';
            reset();
            speak(msg, () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }

          if (parseChecklistBareDeleteIntent(text)) {
            stop();
            if (sections.length === 0) {
              clearChecklistVoice();
              speak('This checklist has no sections yet. Add a section first.', () => {
                lastProcessedTranscriptRef.current = '';
                reset();
              });
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            setChecklistVoicePhase('delete_section_or_item');
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('Say the section number or name, or the item name to delete.', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }

          if (parseChecklistBareUpdateIntent(text)) {
            stop();
            if (sections.length === 0) {
              clearChecklistVoice();
              speak('This checklist has no sections yet. Add a section first.', () => {
                lastProcessedTranscriptRef.current = '';
                reset();
              });
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            setChecklistVoicePhase('update_section_or_item');
            lastProcessedTranscriptRef.current = '';
            reset();
            speak('Say the section number or name, or the item to update.', () => {
              setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
            });
            return;
          }
        } else {
          const addItemCmd = parseAddItem(text);
          if (addItemCmd) {
            stop();

            try {
              await ListService.createListItem({
                list: list.id,
                name: addItemCmd.name,
              });
              await fetchListItems();
              speak('Item added successfully.');
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            } catch (err) {
              console.error('Error adding item:', err);
              speak('Sorry, I could not add the item. Please try again.');
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
          }
        }

        // Parse delete item command
        const deleteItemCmd = parseDeleteItem(text);
        if (deleteItemCmd) {
          stop();

          if (isChecklistList) {
            const searchNorm = stripChecklistVoiceItemQueryForSearch(deleteItemCmd.name);
            const spokenQuery = formatDeleteQueryForSpeech(deleteItemCmd.name);
            const matches = findChecklistVoiceDeleteMatches(listItems, searchNorm);
            if (matches.length === 0) {
              const noneMsg = spokenQuery
                ? `No item found for ${spokenQuery}. Check the name and try again.`
                : 'No item found. Check the name and try again.';
              speak(noneMsg, () => {
                lastProcessedTranscriptRef.current = '';
                reset();
              });
              lastProcessedTranscriptRef.current = '';
              reset();
              return;
            }
            if (matches.length === 1) {
              const it = matches[0];
              const sec = sections.find((s) => s.id === it.section);
              const secLabel = sec?.title ?? 'an unknown section';
              setChecklistDeleteConfirmItemId(it.id);
              setChecklistVoicePhase('delete_confirm');
              lastProcessedTranscriptRef.current = '';
              reset();
              speak(
                `${it.name} was found in section ${secLabel}. Would you like to delete it? Say yes or no.`,
                () => {
                  setTimeout(() => start({ ignoreTranscriptsForMs: 2500 }), 400);
                }
              );
              return;
            }
            setVoiceDeletePickCandidates(matches);
            setVoiceDeletePickModalOpen(true);
            lastProcessedTranscriptRef.current = '';
            reset();
            speak(
              'Several items matched your delete request. Tap the correct one on the screen to delete it.',
              () => {
                setTimeout(() => start({ ignoreTranscriptsForMs: 2800 }), 400);
              }
            );
            return;
          }

          const matches = findMatchingItems(
            listItems,
            stripLeadingThe(deleteItemCmd.name),
            (item) => item.name
          );
          if (matches.length === 0) {
            speak('No items with that name found. Please try again.');
          } else if (matches.length === 1) {
            try {
              await ListService.deleteListItem(matches[0].id);
              await fetchListItems();
              speak(`Deleted ${matches[0].name}.`);
            } catch (err) {
              console.error('Error deleting item:', err);
              speak('Sorry, I could not delete the item.');
            }
          } else {
            let message = 'I found multiple matching items. Please specify which one to delete: ';
            matches.forEach((item, index) => {
              message += `${index + 1}: ${item.name}. `;
            });
            setPendingMatches(matches);
            setPendingAction('delete');
            setAwaitingNumberSelection(true);
            lastProcessedTranscriptRef.current = '';
            speak(message, () => {
              setTimeout(() => {
                start({ ignoreTranscriptsForMs: 2000 });
              }, 500);
            });
            return;
          }
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        // Parse update item command
        const updateItemCmd = parseUpdateItem(text);
        if (updateItemCmd) {
          stop();

          const matches = findMatchingItems(
            listItems,
            stripLeadingThe(updateItemCmd.oldName),
            (item) => item.name
          );
          if (matches.length === 0) {
            speak('Sorry, I could not find that item.');
          } else if (matches.length === 1) {
            try {
              await ListService.updateListItem(matches[0].id, {
                name: updateItemCmd.newName,
              });
              await fetchListItems();
              speak('Item updated successfully.');
            } catch (err) {
              console.error('Error updating item:', err);
              speak('Sorry, I could not update the item. Please try again.');
            }
          } else {
            // Multiple matches - ask for clarification
            let message = 'I found multiple matching items. Please specify which one to update: ';
            matches.forEach((item, index) => {
              message += `${index + 1}: ${item.name}. `;
            });
            setPendingMatches(matches);
            setPendingAction('update');
            setAwaitingNumberSelection(true);
            lastProcessedTranscriptRef.current = '';
            speak(message, () => {
              setTimeout(() => {
                start({ ignoreTranscriptsForMs: 2000 });
              }, 500);
            });
            return;
          }
          lastProcessedTranscriptRef.current = '';
          reset();
          return;
        }

        if (isChecklistList) {
          speak(
            'Try: add, delete, update, add section, add with an item name, delete item name, or update old name to new name.'
          );
        } else {
          speak('Please use one of these commands: add item name, delete item name, or update item name to new name');
        }
        lastProcessedTranscriptRef.current = '';
        reset();
      } catch (error) {
        console.error('Error processing voice command:', error);
        speak('Sorry, there was an error. Please try again.');
        reset();
      }
    };

    handleVoiceCommand();
  }, [
    transcript,
    list,
    listItems,
    sections,
    awaitingNumberSelection,
    pendingMatches,
    pendingAction,
    isSupported,
    isChecklistList,
    checklistVoicePhase,
    pendingSectionsForVoice,
    pendingChecklistItemName,
    checklistTargetSectionId,
    pendingItemsForVoice,
    checklistSectionPickKind,
    checklistUpdateTargetItemId,
    checklistDeleteConfirmItemId,
  ]);

  const handleVoiceClick = () => {
    if (isListening) {
      stop();
      reset();
      setAwaitingNumberSelection(false);
      setPendingMatches([]);
      setPendingAction(null);
      setChecklistVoicePhase('idle');
      setPendingSectionsForVoice([]);
      setPendingChecklistItemName(null);
      setChecklistTargetSectionId(null);
      setPendingItemsForVoice([]);
      setChecklistSectionPickKind(null);
      setChecklistUpdateTargetItemId(null);
      setChecklistDeleteConfirmItemId(null);
      setVoiceDeletePickModalOpen(false);
      setVoiceDeletePickCandidates([]);
      deleteConfirmFromVoicePickRef.current = false;
      return;
    }

    if (Platform.OS === 'web' && !isSupported) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    // Reset state
    reset();
    setAwaitingNumberSelection(false);
    setPendingMatches([]);
    setPendingAction(null);
    setChecklistVoicePhase('idle');
    setPendingSectionsForVoice([]);
    setPendingItemsForVoice([]);
    setPendingChecklistItemName(null);
    setChecklistTargetSectionId(null);
    setChecklistSectionPickKind(null);
    setChecklistUpdateTargetItemId(null);
    setChecklistDeleteConfirmItemId(null);
    setVoiceDeletePickModalOpen(false);
    setVoiceDeletePickCandidates([]);
    deleteConfirmFromVoicePickRef.current = false;

    // Start recognition briefly to capture user gesture (required for permission)
    // Then stop it, speak instruction, and restart after instruction finishes
    try {
      start();
      setTimeout(() => {
        stop();
        speak(
          isChecklistList
            ? 'What would you like to do? Add an item, add a section, delete, or update.'
            : 'What would you like to do',
          () => {
            setTimeout(() => {
              start({ ignoreTranscriptsForMs: 2000 });
            }, 100);
          }
        );
      }, 50);
    } catch (err) {
      console.error('Error starting recognition:', err);
      alert('Unable to start voice recognition. Please check your microphone permissions.');
    }
  };


  const fetchList = async (skipLoading = false) => {
    if (!listId) return;
    const rid = listId;

    try {
      if (!skipLoading) {
        setLoading(true);
      }
      const fetchedList = await ListService.getList(rid);
      if (listIdRef.current !== rid) return;
      setList(fetchedList);
    } catch (err) {
      console.error('Error fetching list:', err);
      if (!skipLoading && listIdRef.current === rid) {
        router.back();
      }
    } finally {
      if (!skipLoading && listIdRef.current === rid) {
        setLoading(false);
      }
    }
  };

  const fetchListItems = async (skipLoading = false, targetListId?: number | null) => {
    const id = targetListId ?? list?.id;
    if (!id) return;
    const rid = id;

    try {
      if (!skipLoading) {
        setLoadingItems(true);
      }
      const items = await ListService.getListItems(rid);
      if (listIdRef.current !== rid) return;
      setListItems(items);
    } catch (err) {
      console.error('Error fetching list items:', err);
    } finally {
      if (!skipLoading && listIdRef.current === rid) {
        setLoadingItems(false);
      }
    }
  };

  const fetchCategories = async () => {
    if (!selectedFamily) return;

    try {
      const fetchedCategories = await ListService.getGroceryCategories(selectedFamily.id);
      setCategories(fetchedCategories);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const handleRefresh = useCallback(async () => {
    if (!listId || !selectedFamily) return;

    setRefreshing(true);
    try {
      const promises: Promise<any>[] = [
        fetchList(true),
        ListService.getListItems(listId).then(items => setListItems(items)),
      ];
      if (list?.list_type === 'checklist') {
        promises.push(
          ListService.getListSections(listId).then((s) => setSections(sortSectionsByDateAndOrder(s)))
        );
      }
      if (list?.list_type === 'grocery') {
        promises.push(fetchCategories());
      }
      await Promise.all(promises);
    } catch (err) {
      console.error('Error refreshing list detail:', err);
    } finally {
      setRefreshing(false);
    }
  }, [listId, selectedFamily, list?.list_type]);

  // Extract unique recipe names from items
  const availableRecipes = useMemo(() => {
    const recipes = new Set<string>();
    listItems.forEach((item) => {
      if (item.notes && item.notes.startsWith('From recipe: ')) {
        const recipeName = item.notes.replace('From recipe: ', '');
        if (recipeName) {
          recipes.add(recipeName);
        }
      }
    });
    return Array.from(recipes).sort();
  }, [listItems]);

  // Filter items by selected recipe and exclude editing item (for non-draggable lists)
  const filteredItems = useMemo(() => {
    let items = listItems;

    // Filter by recipe if selected
    if (selectedRecipeFilter) {
      items = items.filter(
        (item) => item.notes && item.notes === `From recipe: ${selectedRecipeFilter}`
      );
    }

    // Filter out editing item when using the main edit form (not inline in draggable list)
    if (editingItem && (Platform.OS === 'web' || !supportsDragAndDrop)) {
      items = items.filter((item) => item.id !== editingItem.id);
    }

    return items;
  }, [listItems, selectedRecipeFilter, editingItem, supportsDragAndDrop, Platform.OS]);

  // Group items by category
  const groupedItems = useMemo(() => {
    if (!isGroceryList) {
      return { uncategorized: filteredItems };
    }

    const grouped: Record<string, ListItem[]> = {};
    filteredItems.forEach((item) => {
      const categoryId = item.category ? String(item.category) : 'uncategorized';
      if (!grouped[categoryId]) {
        grouped[categoryId] = [];
      }
      grouped[categoryId].push(item);
    });

    return grouped;
  }, [filteredItems, isGroceryList]);

  // Compute sorted category IDs - memoized and called before early returns
  const sortedCategoryIds = useMemo(() => {
    if (!isGroceryList) return [];
    return Object.keys(groupedItems).sort((a, b) => {
      if (a === 'uncategorized') return 1;
      if (b === 'uncategorized') return -1;
      const categoryA = categories.find((c) => c.id === parseInt(a, 10));
      const categoryB = categories.find((c) => c.id === parseInt(b, 10));
      if (!categoryA && !categoryB) return 0;
      if (!categoryA) return 1;
      if (!categoryB) return -1;
      if (categoryA.order !== categoryB.order) {
        return (categoryA.order || 0) - (categoryB.order || 0);
      }
      return (categoryA.name || '').localeCompare(categoryB.name || '');
    });
  }, [isGroceryList, groupedItems, categories]);

  // Compute areAllCollapsed - memoized and called before early returns
  const areAllCollapsed = useMemo(() => {
    if (!isGroceryList || sortedCategoryIds.length === 0) return true;
    return sortedCategoryIds.every((categoryId) => collapsedCategories.has(categoryId));
  }, [isGroceryList, sortedCategoryIds, collapsedCategories]);

  // Memoize list color to prevent flashing during re-renders
  const listColor = useMemo(() => {
    return list?.color || undefined;
  }, [list?.color]);

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const expandAllCategories = () => {
    setCollapsedCategories(new Set());
  };

  const collapseAllCategories = () => {
    if (isGroceryList && listItems.length > 0) {
      const categoryIds = new Set<string>();
      listItems.forEach((item) => {
        const categoryId = item.category ? String(item.category) : 'uncategorized';
        categoryIds.add(categoryId);
      });
      setCollapsedCategories(categoryIds);
    }
  };

  const getCategoryName = (categoryId: string) => {
    if (categoryId === 'uncategorized') return 'Uncategorized';
    const categoryIdNum = parseInt(categoryId, 10);
    const category = categories.find((c) => c.id === categoryIdNum);
    return category ? category.name : 'Unknown';
  };

  // Checklist: expand / collapse all sections
  const areAllSectionsCollapsed = useMemo(() => {
    if (!isChecklistList || sections.length === 0) return true;
    return sections.every((s) => collapsedSections.has(s.id));
  }, [isChecklistList, sections, collapsedSections]);

  const expandAllSections = () => setCollapsedSections(new Set());

  const collapseAllSections = () => {
    setCollapsedSections(new Set(sections.map((s) => s.id)));
  };

  // Checklist: group items by section, sorted by order
  const checklistItemsBySection = useMemo(() => {
    if (!isChecklistList) return new Map<number, ListItem[]>();
    const bySection = new Map<number, ListItem[]>();
    listItems.forEach((item) => {
      const sid = item.section ?? 0;
      if (!bySection.has(sid)) bySection.set(sid, []);
      bySection.get(sid)!.push(item);
    });
    bySection.forEach((arr) => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
    return bySection;
  }, [isChecklistList, listItems]);

  const isSectionAllCompleted = useCallback((sectionId: number) => {
    const items = checklistItemsBySection.get(sectionId) ?? [];
    return items.length > 0 && items.every((i) => i.completed);
  }, [checklistItemsBySection]);

  const handlePushChecklistToOutlook = async () => {
    if (!list || outlookPushLoading) return;
    setOutlookPushLoading(true);
    try {
      const r = await ListService.pushChecklistEventsToOutlook(list.id);
      if (r.failed === 0) {
        alert(`Outlook updated (${r.created} created, ${r.updated} updated).`);
      } else {
        const hint = r.errors?.[0] ? ` ${r.errors[0]}` : '';
        alert(`Outlook sync finished with ${r.failed} error(s).${hint}`);
      }
    } catch (err) {
      alert((err as APIError)?.message || 'Could not sync to Outlook.');
    } finally {
      setOutlookPushLoading(false);
    }
  };

  const handleSectionToggleComplete = async (section: ListSection) => {
    const targetCompleted = !isSectionAllCompleted(section.id);
    const sectionItemIds = (checklistItemsBySection.get(section.id) ?? []).map((i) => i.id);
    const previousState = listItems.map((i) => ({ ...i }));
    setListItems((prevItems) =>
      prevItems.map((i) =>
        sectionItemIds.includes(i.id) ? { ...i, completed: targetCompleted } : i
      )
    );
    try {
      await ListService.setSectionAllCompleted(section.id, targetCompleted);
    } catch (err) {
      console.error('Error toggling section complete:', err);
      setListItems(previousState);
      alert((err as APIError)?.message || 'Failed to update section. Try again.');
    }
  };

  const submitAddSection = async (payload: { title: string; section_date: string }) => {
    if (!list) return;
    const { title, section_date } = payload;
    setSectionFormSaving(true);
    try {
      const created = await ListService.createListSection({
        list: list.id,
        order: sections.length,
        title,
        section_date,
      });
      if (created.calendar_updated) {
        alert('Calendar updated');
      }
      await fetchListSections();
      setShowAddSection(false);
    } catch (err) {
      console.error('Error creating section:', err);
      alert((err as APIError)?.message || 'Failed to create section. Try again.');
    } finally {
      setSectionFormSaving(false);
    }
  };

  const submitEditSection = async (payload: { title: string; section_date: string }) => {
    if (!editSection || !list) return;
    const { title, section_date } = payload;
    const s = editSection;
    setSectionFormSaving(true);
    try {
      const previousSections = sections.map((x) => ({ ...x }));
      setSections((prev) =>
        sortSectionsByDateAndOrder(
          prev.map((x) => (x.id === s.id ? { ...x, title, section_date } : x))
        )
      );
      try {
        const updated = await ListService.updateListSection(s.id, { title, section_date });
        if (updated.calendar_updated) {
          alert('Calendar updated');
        }
      } catch (err) {
        setSections(previousSections);
        throw err;
      }
      setEditSection(null);
    } catch (err) {
      console.error('Error updating section:', err);
      alert((err as APIError)?.message || 'Failed to update section. Try again.');
    } finally {
      setSectionFormSaving(false);
    }
  };

  const confirmCopyChecklist = async (name: string) => {
    if (!list || list.list_type !== 'checklist') return;
    setCopyChecklistSaving(true);
    try {
      const newList = await ListService.copyChecklist(list.id, { name });
      if (newList.calendar_updated) {
        alert('Calendar events added');
      }
      setCopyChecklistModalOpen(false);
      router.push(`/(tabs)/lists/${newList.id}`);
    } catch (err) {
      console.error('Error copying checklist:', err);
      alert((err as APIError)?.message || 'Failed to copy checklist. Try again.');
    } finally {
      setCopyChecklistSaving(false);
    }
  };

  const [deleteSectionConfirm, setDeleteSectionConfirm] = useState<{
    isOpen: boolean;
    section: ListSection | null;
  }>({ isOpen: false, section: null });

  const confirmDeleteSection = async () => {
    if (!deleteSectionConfirm.section) return;
    const sectionId = deleteSectionConfirm.section.id;
    const previousSections = [...sections];
    const previousItems = [...listItems];
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    setListItems((prev) => prev.filter((i) => i.section !== sectionId));
    setDeleteSectionConfirm({ isOpen: false, section: null });
    try {
      await ListService.deleteListSection(sectionId);
    } catch (err) {
      console.error('Error deleting section:', err);
      setSections(previousSections);
      setListItems(previousItems);
      alert((err as APIError)?.message || 'Failed to delete section. Try again.');
    }
  };

  const handleIndent = async (item: ListItem) => {
    if (!list || list.list_type !== 'checklist') return;
    const currentLevel = item.indent_level ?? 0;
    if (currentLevel >= 10) return;
    const newLevel = currentLevel + 1;
    const previousState = listItems.map((i) => ({ ...i }));
    setListItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, indent_level: newLevel } : i))
    );
    try {
      await ListService.updateListItem(item.id, { indent_level: newLevel });
    } catch (err) {
      console.error('Error indenting item:', err);
      setListItems(previousState);
      alert((err as APIError)?.message || 'Failed to indent. Try again.');
    }
  };

  const handleOutdent = async (item: ListItem) => {
    if (!list || list.list_type !== 'checklist') return;
    const currentLevel = item.indent_level ?? 0;
    if (currentLevel <= 0) return;
    const newLevel = currentLevel - 1;
    const previousState = listItems.map((i) => ({ ...i }));
    setListItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, indent_level: newLevel } : i))
    );
    try {
      await ListService.updateListItem(item.id, { indent_level: newLevel });
    } catch (err) {
      console.error('Error outdenting item:', err);
      setListItems(previousState);
      alert((err as APIError)?.message || 'Failed to outdent. Try again.');
    }
  };

  const handleMoveItemUpInSection = async (item: ListItem) => {
    if (!item.section) return;
    const sectionItems = (checklistItemsBySection.get(item.section) ?? []).slice();
    const idx = sectionItems.findIndex((i) => i.id === item.id);
    if (idx <= 0) return;
    const prevItem = sectionItems[idx - 1];
    const prevOrder = item.order;
    const newOrder = prevItem.order;
    const previousState = listItems.map((i) => ({ ...i }));
    setListItems((prev) =>
      prev.map((i) => {
        if (i.id === item.id) return { ...i, order: newOrder };
        if (i.id === prevItem.id) return { ...i, order: prevOrder };
        return i;
      })
    );
    try {
      await ListService.updateListItem(item.id, { order: newOrder });
      await ListService.updateListItem(prevItem.id, { order: prevOrder });
    } catch (err) {
      console.error('Error moving item up:', err);
      setListItems(previousState);
    }
  };

  const handleMoveItemDownInSection = async (item: ListItem) => {
    if (!item.section) return;
    const sectionItems = (checklistItemsBySection.get(item.section) ?? []).slice();
    const idx = sectionItems.findIndex((i) => i.id === item.id);
    if (idx < 0 || idx >= sectionItems.length - 1) return;
    const nextItem = sectionItems[idx + 1];
    const prevOrder = item.order;
    const newOrder = nextItem.order;
    const previousState = listItems.map((i) => ({ ...i }));
    setListItems((prev) =>
      prev.map((i) => {
        if (i.id === item.id) return { ...i, order: newOrder };
        if (i.id === nextItem.id) return { ...i, order: prevOrder };
        return i;
      })
    );
    try {
      await ListService.updateListItem(item.id, { order: newOrder });
      await ListService.updateListItem(nextItem.id, { order: prevOrder });
    } catch (err) {
      console.error('Error moving item down:', err);
      setListItems(previousState);
    }
  };

  const handleIndentAllInSection = async (sectionId: number) => {
    if (!list || list.list_type !== 'checklist') return;
    const sectionItems = (checklistItemsBySection.get(sectionId) ?? [])
      .filter((i) => (i.indent_level ?? 0) < 10);
    if (sectionItems.length === 0) return;
    const previousState = listItems.map((i) => ({ ...i }));
    setListItems((prev) =>
      prev.map((i) => {
        if (i.section === sectionId && (i.indent_level ?? 0) < 10) {
          return { ...i, indent_level: (i.indent_level ?? 0) + 1 };
        }
        return i;
      })
    );
    try {
      await Promise.all(
        sectionItems.map((i) =>
          ListService.updateListItem(i.id, { indent_level: (i.indent_level ?? 0) + 1 })
        )
      );
    } catch (err) {
      console.error('Error indenting all items in section:', err);
      setListItems(previousState);
      alert((err as APIError)?.message || 'Failed to indent all. Try again.');
    }
  };

  const handleOutdentAllInSection = async (sectionId: number) => {
    if (!list || list.list_type !== 'checklist') return;
    const sectionItems = (checklistItemsBySection.get(sectionId) ?? [])
      .filter((i) => (i.indent_level ?? 0) > 0);
    if (sectionItems.length === 0) return;
    const previousState = listItems.map((i) => ({ ...i }));
    setListItems((prev) =>
      prev.map((i) => {
        if (i.section === sectionId && (i.indent_level ?? 0) > 0) {
          return { ...i, indent_level: (i.indent_level ?? 0) - 1 };
        }
        return i;
      })
    );
    try {
      await Promise.all(
        sectionItems.map((i) =>
          ListService.updateListItem(i.id, { indent_level: (i.indent_level ?? 0) - 1 })
        )
      );
    } catch (err) {
      console.error('Error outdenting all items in section:', err);
      setListItems(previousState);
      alert((err as APIError)?.message || 'Failed to outdent all. Try again.');
    }
  };

  const toggleItemComplete = async (item: ListItem) => {
    if (!list) return;

    // Checklist: backend returns updated item; we update in place (no delete)
    if (list.list_type === 'checklist') {
      const newCompleted = !item.completed;
      setListItems((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, completed: newCompleted } : p))
      );
      try {
        const updated = await ListService.toggleItemComplete(item.id, newCompleted);
        if (updated) {
          setListItems((prev) =>
            prev.map((p) => (p.id === item.id ? updated : p))
          );
        }
      } catch (err) {
        console.error('Error toggling item:', err);
        setListItems((prev) =>
          prev.map((p) => (p.id === item.id ? { ...p, completed: item.completed } : p))
        );
      }
      return;
    }

    // For all other list types, completing an item will delete it and save to history
    if (!item.completed) {
      // Optimistic update - remove item immediately
      setListItems((prevItems) => prevItems.filter((prevItem) => prevItem.id !== item.id));

      try {
        await ListService.toggleItemComplete(item.id, true);
        // Refresh list items to ensure sync
        await fetchListItems(true);
      } catch (err) {
        console.error('Error completing item:', err);
        // Revert on error - re-add the item
        setListItems((prevItems) => {
          const newItems = [...prevItems, item];
          // Sort by order to maintain position
          return newItems.sort((a, b) => (a.order || 0) - (b.order || 0));
        });
      }
    } else {
      // For uncompleting items, use normal toggle
      // Optimistic update
      setListItems((prevItems) =>
        prevItems.map((prevItem) =>
          prevItem.id === item.id ? { ...prevItem, completed: !prevItem.completed } : prevItem
        )
      );

      try {
        await ListService.toggleItemComplete(item.id, !item.completed);
      } catch (err) {
        console.error('Error updating item:', err);
        // Revert on error
        setListItems((prevItems) =>
          prevItems.map((prevItem) =>
            prevItem.id === item.id ? { ...prevItem, completed: item.completed } : prevItem
          )
        );
      }
    }
  };

  const handleAddItem = async (data: CreateListItemData) => {
    try {
      setAdding(true);
      if (list?.list_type === 'checklist' && sections.length > 0 && !data.section) {
        (data as CreateListItemData).section = sections[0].id;
      }
      const newItem = await ListService.createListItem(data);
      await fetchListItems();
      setShowAddItem(false);
    } catch (err) {
      console.error('Error adding item:', err);
      const apiError = err as APIError;
      alert(apiError.message || 'Failed to add item. Please try again.');
    } finally {
      setAdding(false);
    }
  };

  const handleUpdateItem = async (data: UpdateListItemData) => {
    if (!editingItem) {
      return;
    }

    try {
      setUpdatingItem(true);
      await ListService.updateListItem(editingItem.id, data);
      // Close the modal immediately to prevent showing stale data
      setEditingItem(null);
      await fetchListItems();
    } catch (err) {
      console.error('Error updating item:', err);
      const apiError = err as APIError;
      alert(apiError.message || 'Failed to update item. Please try again.');
    } finally {
      setUpdatingItem(false);
    }
  };

  const handleDeleteItem = (item: ListItem, options?: { fromVoiceDeletePick?: boolean }) => {
    deleteConfirmFromVoicePickRef.current = !!options?.fromVoiceDeletePick;
    setDeleteConfirm({
      isOpen: true,
      itemId: item.id,
      itemName: item.name,
    });
  };

  const confirmDeleteItem = async () => {
    if (!deleteConfirm.itemId) return;

    const fromVoicePick = deleteConfirmFromVoicePickRef.current;
    const deletedName = deleteConfirm.itemName;

    try {
      await ListService.deleteListItem(deleteConfirm.itemId);
      await fetchListItems();
      setDeleteConfirm({ isOpen: false, itemId: null, itemName: '' });
      deleteConfirmFromVoicePickRef.current = false;
      if (fromVoicePick) {
        stop();
        reset();
        lastProcessedTranscriptRef.current = '';
        speak(deletedName ? `${deletedName} was deleted.` : 'Item was deleted.');
      }
    } catch (err) {
      console.error('Error deleting item:', err);
      deleteConfirmFromVoicePickRef.current = false;
      setDeleteConfirm({ isOpen: false, itemId: null, itemName: '' });
      alert('Failed to delete item. Please try again.');
    }
  };

  const handleDeleteRecipeItems = () => {
    if (!selectedRecipeFilter) return;

    // Count items that match the recipe filter
    const recipeItems = listItems.filter(
      (item) => item.notes && item.notes === `From recipe: ${selectedRecipeFilter}`
    );

    setDeleteRecipeConfirm({
      isOpen: true,
      recipeName: selectedRecipeFilter,
      itemCount: recipeItems.length,
    });
  };

  const confirmDeleteRecipeItems = async () => {
    if (!selectedRecipeFilter) return;

    try {
      setDeletingRecipeItems(true);

      // Get all items that match the recipe filter
      const recipeItems = listItems.filter(
        (item) => item.notes && item.notes === `From recipe: ${selectedRecipeFilter}`
      );

      // Delete all items in parallel
      await Promise.all(
        recipeItems.map((item) => ListService.deleteListItem(item.id))
      );

      // Refresh the list and clear the filter
      await fetchListItems();
      setSelectedRecipeFilter('');
      setDeleteRecipeConfirm({ isOpen: false, recipeName: '', itemCount: 0 });
    } catch (err) {
      console.error('Error deleting recipe items:', err);
      alert('Failed to delete some items. Please try again.');
    } finally {
      setDeletingRecipeItems(false);
    }
  };

  const handleDragEnd = async (draggedId: string, droppedId: string) => {
    if (!supportsDragAndDrop) return;

    const sortedItems = [...filteredItems].sort((a, b) => {
      if (a.order !== b.order) {
        return (a.order || 0) - (b.order || 0);
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const draggedIndex = sortedItems.findIndex((item) => item.id.toString() === draggedId);
    const droppedIndex = sortedItems.findIndex((item) => item.id.toString() === droppedId);

    if (draggedIndex === -1 || droppedIndex === -1) return;

    // Reorder items
    const newItems = [...sortedItems];
    const [movedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(droppedIndex, 0, movedItem);

    // Update order values
    const updatePromises = newItems.map((item, index) =>
      ListService.updateListItem(item.id, { order: index })
    );

    try {
      await Promise.all(updatePromises);
      await fetchListItems();
    } catch (err) {
      console.error('Error reordering items:', err);
      await fetchListItems(); // Revert by refetching
    }
  };

  // Mobile drag-and-drop handler for DraggableFlatList
  const handleMobileDragEnd = async (data: ListItem[]) => {
    if (!supportsDragAndDrop) return;

    // Update order values based on new positions
    const updatePromises = data.map((item, index) =>
      ListService.updateListItem(item.id, { order: index })
    );

    try {
      await Promise.all(updatePromises);
      await fetchListItems();
    } catch (err) {
      console.error('Error reordering items:', err);
      await fetchListItems(); // Revert by refetching
    }
  };

  // Web drag-and-drop handlers
  const handleWebDragStart = (itemId: number) => {
    setDraggedItemId(itemId);
  };

  const handleWebDragOver = (e: any, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleWebDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleWebDrop = async (e: any, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);

    if (draggedItemId === null) {
      return;
    }

    const sortedItems = [...filteredItems].sort((a, b) => {
      if (a.order !== b.order) {
        return (a.order || 0) - (b.order || 0);
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const draggedItem = sortedItems.find((item) => item.id === draggedItemId);
    if (!draggedItem) return;

    const dragIndex = sortedItems.findIndex((item) => item.id === draggedItemId);
    if (dragIndex === -1 || dragIndex === dropIndex) {
      setDraggedItemId(null);
      return;
    }

    // Reorder items
    const newItems = [...sortedItems];
    newItems.splice(dragIndex, 1);
    newItems.splice(dropIndex, 0, draggedItem);

    // Update order values
    const updatePromises = newItems.map((item, index) =>
      ListService.updateListItem(item.id, { order: index })
    );

    try {
      await Promise.all(updatePromises);
      setListItems(newItems);
      await fetchListItems();
    } catch (err) {
      console.error('Error reordering items:', err);
      await fetchListItems(); // Revert by refetching
    }

    setDraggedItemId(null);
  };

  const handleWebDragEnd = () => {
    setDraggedItemId(null);
    setDragOverIndex(null);
  };

  // Checklist section reorder (accordion drag)
  const handleChecklistSectionDragStart = (sectionId: number) => {
    setDraggedSectionId(sectionId);
  };

  const handleChecklistSectionDragOver = (e: any, sectionIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverSectionIndex !== sectionIndex) {
      setDragOverSectionIndex(sectionIndex);
    }
  };

  const handleChecklistSectionDragLeave = () => {
    setDragOverSectionIndex(null);
  };

  const handleChecklistSectionDrop = async (e: any, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSectionIndex(null);
    if (draggedSectionId == null) return;
    const dragIndex = sections.findIndex((s) => s.id === draggedSectionId);
    if (dragIndex === -1 || dragIndex === dropIndex) {
      setDraggedSectionId(null);
      return;
    }
    const sortedByKey = sortSectionsByDateAndOrder(sections);
    const datesSequence = sortedByKey.map((s) => s.section_date);
    const newSections = [...sections];
    const [moved] = newSections.splice(dragIndex, 1);
    newSections.splice(dropIndex, 0, moved);
    const updated = newSections.map((s, i) => ({
      ...s,
      order: i,
      section_date: datesSequence[i] ?? s.section_date,
    }));
    setSections(sortSectionsByDateAndOrder(updated));
    setReorderingSections(true);
    try {
      await Promise.all(
        updated.map((s, i) =>
          ListService.updateListSection(s.id, { order: i, section_date: datesSequence[i] })
        )
      );
    } catch (err) {
      console.error('Error reordering sections:', err);
      await fetchListSections();
    } finally {
      setReorderingSections(false);
      setDraggedSectionId(null);
    }
  };

  const handleChecklistSectionDragEnd = () => {
    setDraggedSectionId(null);
    setDragOverSectionIndex(null);
  };

  const handleChecklistSectionDragEndMobile = async (data: ListSection[]) => {
    const sortedByKey = sortSectionsByDateAndOrder(sections);
    const datesSequence = sortedByKey.map((s) => s.section_date);
    const updated = data.map((s, i) => ({
      ...s,
      order: i,
      section_date: datesSequence[i] ?? s.section_date,
    }));
    setSections(sortSectionsByDateAndOrder(updated));
    setReorderingSections(true);
    try {
      await Promise.all(
        updated.map((s, i) =>
          ListService.updateListSection(s.id, { order: i, section_date: datesSequence[i] })
        )
      );
    } catch (err) {
      console.error('Error reordering sections:', err);
      await fetchListSections();
    } finally {
      setReorderingSections(false);
    }
  };

  // Checklist item reorder within section (web drag-drop)
  const handleChecklistItemDragStart = (itemId: number) => {
    setDraggedChecklistItemId(itemId);
  };

  const handleChecklistItemDragOver = (e: any, itemId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    setDropTargetChecklistItemId(itemId);
  };

  const handleChecklistItemDragLeave = () => {
    setDropTargetChecklistItemId(null);
  };

  const handleChecklistItemDrop = async (e: any, dropTargetId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetChecklistItemId(null);
    const draggedId = draggedChecklistItemId;
    setDraggedChecklistItemId(null);
    if (draggedId == null || draggedId === dropTargetId) return;
    const draggedItem = listItems.find((i) => i.id === draggedId);
    const dropItem = listItems.find((i) => i.id === dropTargetId);
    if (!draggedItem || !dropItem || draggedItem.section !== dropItem.section) return;
    const sectionId = draggedItem.section!;
    const sectionItems = (checklistItemsBySection.get(sectionId) ?? []).slice();
    const fromIdx = sectionItems.findIndex((i) => i.id === draggedId);
    const toIdx = sectionItems.findIndex((i) => i.id === dropTargetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = sectionItems.slice();
    const [removed] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, removed);
    const previousState = listItems.map((i) => ({ ...i }));
    setListItems((prev) =>
      prev.map((i) => {
        const newOrder = reordered.findIndex((r) => r.id === i.id);
        if (newOrder === -1) return i;
        return { ...i, order: newOrder };
      })
    );
    try {
      await Promise.all(reordered.map((item, index) => ListService.updateListItem(item.id, { order: index })));
    } catch (err) {
      console.error('Error reordering checklist item:', err);
      setListItems(previousState);
    }
  };

  const handleChecklistItemDragEnd = () => {
    setDraggedChecklistItemId(null);
    setDropTargetChecklistItemId(null);
  };

  // Simple move functions for mobile when DraggableFlatList is not available
  const handleOpenMoveModal = async (item: ListItem) => {
    if (!selectedFamily) return;

    try {
      // Fetch all lists for the family (excluding the current list)
      const allLists = await ListService.getLists(selectedFamily.id);
      const otherLists = allLists.filter((l) => l.id !== list?.id);
      setAvailableLists(otherLists);
      setSelectedTargetListId(null);
      setMoveItemModal({ isOpen: true, item });
    } catch (err) {
      console.error('Error fetching lists for move:', err);
      setMoveItemResultModal({
        visible: true,
        message: 'Failed to load lists. Please try again.',
        type: 'error',
      });
    }
  };

  const handleMoveItemToList = async () => {
    if (!moveItemModal.item || !selectedTargetListId) return;

    setMovingItem(true);
    try {
      // Update the item's list property - backend serializer includes 'list' in fields
      await apiClient.patch(`/list-items/${moveItemModal.item.id}/`, {
        list: selectedTargetListId,
      });

      // Refresh list items to remove the moved item
      await fetchListItems();

      // Get the target list name for the success message
      const targetList = availableLists.find((l) => l.id === selectedTargetListId);
      const targetListName = targetList?.name || 'the selected list';

      // Close move modal
      setMoveItemModal({ isOpen: false, item: null });
      setSelectedTargetListId(null);

      // Show success message in modal
      setMoveItemResultModal({
        visible: true,
        message: `"${moveItemModal.item.name}" has been moved to "${targetListName}" successfully.`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('Error moving item:', err);
      setMoveItemResultModal({
        visible: true,
        message: err?.message || 'Failed to move item. Please try again.',
        type: 'error',
      });
    } finally {
      setMovingItem(false);
    }
  };

  const handleMoveItem = async (itemId: number, direction: 'up' | 'down') => {
    const sortedItems = [...filteredItems].sort((a, b) => {
      if (a.order !== b.order) {
        return (a.order || 0) - (b.order || 0);
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const currentIndex = sortedItems.findIndex((item) => item.id === itemId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= sortedItems.length) return;

    // Swap items
    const newItems = [...sortedItems];
    [newItems[currentIndex], newItems[newIndex]] = [newItems[newIndex], newItems[currentIndex]];

    // Update order values
    const updatePromises = newItems.map((item, index) =>
      ListService.updateListItem(item.id, { order: index })
    );

    try {
      await Promise.all(updatePromises);
      await fetchListItems();
    } catch (err) {
      console.error('Error moving item:', err);
      await fetchListItems(); // Revert by refetching
    }
  };

  const renderItem = ({ item, index, useDraxView = false }: { item: ListItem; index: number; useDraxView?: boolean }) => {
    // On web, use modal instead of inline editing
    if (editingItem && editingItem.id === item.id && Platform.OS !== 'web') {
      return (
        <View style={[styles.itemContainer, { backgroundColor: colors.surface }]}>
          <AddItemForm
            editingItem={editingItem}
            onSubmit={handleUpdateItem}
            onCancel={() => setEditingItem(null)}
            listId={list!.id}
            categories={categories}
            isGroceryList={isGroceryList}
            isShoppingList={isShoppingList}
            isTodoList={isTodoList}
            isChecklistList={isChecklistList}
            sections={sections}
            loading={updatingItem}
          />
        </View>
      );
    }

    return (
      <ListItemComponent
        item={item}
        onToggleComplete={() => toggleItemComplete(item)}
        onEdit={() => {
          setEditingItem(item);
        }}
        onDelete={() => handleDeleteItem(item)}
        onMove={() => handleOpenMoveModal(item)}
        isGroceryList={isGroceryList}
        isTodoList={isTodoList}
        showDragHandle={useDraxView}
        onMoveUp={!useDraxView && Platform.OS !== 'web' && supportsDragAndDrop ? () => {
          handleMoveItem(item.id, 'up');
        } : undefined}
        onMoveDown={!useDraxView && Platform.OS !== 'web' && supportsDragAndDrop ? () => {
          handleMoveItem(item.id, 'down');
        } : undefined}
      />
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!list) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>List not found</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/lists')} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: colors.primary }]}>← Back to Lists</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <GlobalNavBar />
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            borderLeftWidth: 4,
            borderLeftColor: list.color || colors.primary,
          },
        ]}
      >
        <TouchableOpacity onPress={() => router.push('/(tabs)/lists')} style={styles.backButton}>
          <FontAwesome name="arrow-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <View
          style={styles.headerContent}
          onLayout={
            needTitleShrink
              ? (e) => setTitleContainerWidth(e.nativeEvent.layout.width)
              : undefined
          }
        >
          {needTitleShrink && titleContainerWidth > 0 && (
            <View style={styles.titleMeasureWrap} pointerEvents="none">
              <Text
                style={[
                  styles.listTitle,
                  {
                    color: list.color || colors.primary,
                    fontSize: titleFontSize,
                    alignSelf: 'flex-start',
                  },
                ]}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > titleContainerWidth && titleFontSize > TITLE_FONT_SIZE_MIN) {
                    setTitleFontSize((prev) => Math.max(TITLE_FONT_SIZE_MIN, prev - 2));
                  }
                }}
              >
                {list.name}
              </Text>
            </View>
          )}
          <Text
            style={[
              styles.listTitle,
              {
                color: list.color || colors.primary,
                ...(needTitleShrink && { fontSize: titleFontSize }),
              },
            ]}
            numberOfLines={1}
          >
            {list.name}
          </Text>
          {list.description && (
            <Text style={[styles.listDescription, { color: colors.textSecondary }]} numberOfLines={2}>
              {list.description}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.actionsBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.actionsBarTop}>
          <View style={styles.actionButtonsPrimary}>
            {isSupported && !showAddItem && !showAddSection && !editingItem && !copyChecklistModalOpen && (
              <VoiceButton
                onPress={handleVoiceClick}
                isListening={isListening}
                disabled={adding || updatingItem || copyChecklistSaving}
              />
            )}
            {!showAddItem && !showAddSection && !editingItem && !copyChecklistModalOpen ? (
              <>
                {isChecklistList && (
                  <TouchableOpacity
                    onPress={() => {
                      setCopyChecklistModalOpen(true);
                      setShowAddSection(false);
                      setShowAddItem(false);
                      setEditSection(null);
                    }}
                    style={[styles.addButton, { backgroundColor: colors.primary }]}
                    accessibilityLabel="Copy checklist"
                    accessibilityHint="Creates a duplicate list with section dates set to today"
                  >
                    <FontAwesome name="copy" size={16} color="#fff" />
                    <Text style={styles.addButtonText}>
                      {Platform.OS === 'web' ? 'Copy list' : 'Copy'}
                    </Text>
                  </TouchableOpacity>
                )}
                {isChecklistList && (
                  <TouchableOpacity
                    onPress={() => {
                      setShowAddSection(true);
                      setShowAddItem(false);
                      setEditSection(null);
                      setCopyChecklistModalOpen(false);
                    }}
                    style={[styles.addButton, { backgroundColor: colors.primary }]}
                  >
                    <FontAwesome name="plus" size={16} color="#fff" />
                    <Text style={styles.addButtonText}>
                      {Platform.OS === 'web' ? 'Add Section' : 'Section'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => {
                    setShowAddItem(true);
                    setShowAddSection(false);
                    setEditSection(null);
                    setCopyChecklistModalOpen(false);
                  }}
                  style={[styles.addButton, { backgroundColor: colors.primary }]}
                >
                  <FontAwesome name="plus" size={16} color="#fff" />
                  <Text style={styles.addButtonText}>
                    {Platform.OS === 'web' ? 'Add Item' : 'Item'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : editingItem && !supportsDragAndDrop ? (
              <TouchableOpacity
                onPress={() => setEditingItem(null)}
                style={[styles.cancelButton, { backgroundColor: colors.textSecondary }]}
              >
                <FontAwesome name="times" size={16} color="#fff" />
                <Text style={styles.cancelButtonText}>Cancel Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {!showAddItem && !showAddSection && !editingItem && !copyChecklistModalOpen && (
            <View style={styles.actionButtonsSecondary}>
              {isSupported && (
                <TooltipButton
                  tooltip="Voice commands — view phrases you can say with the mic"
                  onPress={() => setShowVoiceHelpModal(true)}
                  style={[styles.voiceHelpButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  accessibilityHint="Shows list of voice commands you can say"
                >
                  <FontAwesome name="question-circle" size={20} color={colors.textSecondary} />
                </TooltipButton>
              )}
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/lists/completed')}
                style={[styles.historyButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                accessibilityLabel="View completed items history"
                accessibilityHint="Opens the history of completed items"
              >
                <FontAwesome name="history" size={16} color={colors.primary} />
                <Text style={[styles.historyButtonText, { color: colors.textSecondary }]}>History</Text>
              </TouchableOpacity>
              {isChecklistList && (
                <TouchableOpacity
                  onPress={handlePushChecklistToOutlook}
                  disabled={!outlookConnected || outlookPushLoading}
                  style={[
                    styles.historyButton,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      opacity: !outlookConnected || outlookPushLoading ? 0.45 : 1,
                    },
                  ]}
                  accessibilityLabel="Sync checklist events to Outlook"
                  accessibilityHint={
                    outlookConnected
                      ? 'Creates or updates Outlook calendar events for this checklist'
                      : 'Connect Outlook in Settings to enable sync'
                  }
                >
                  {outlookPushLoading ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <FontAwesome name="calendar" size={16} color={colors.primary} />
                  )}
                  <Text style={[styles.historyButtonText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {Platform.OS === 'web' ? 'Sync to Outlook' : 'Outlook'}
                  </Text>
                </TouchableOpacity>
              )}
              {isChecklistList && sections.length > 0 && (
                <TouchableOpacity
                  onPress={areAllSectionsCollapsed ? expandAllSections : collapseAllSections}
                  style={[styles.expandCollapseButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <FontAwesome
                    name={areAllSectionsCollapsed ? 'chevron-down' : 'chevron-up'}
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[styles.expandCollapseButtonText, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {areAllSectionsCollapsed ? 'Expand All' : 'Collapse All'}
                  </Text>
                </TouchableOpacity>
              )}
              {isGroceryList && sortedCategoryIds.length > 0 && (
                <TouchableOpacity
                  onPress={areAllCollapsed ? expandAllCategories : collapseAllCategories}
                  style={[styles.expandCollapseButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                >
                  <FontAwesome
                    name={areAllCollapsed ? 'chevron-down' : 'chevron-up'}
                    size={14}
                    color={colors.textSecondary}
                  />
                  <Text
                    style={[styles.expandCollapseButtonText, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {areAllCollapsed ? 'Expand' : 'Collapse'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
        {isGroceryList && availableRecipes.length > 0 && (
          <View style={styles.recipeFilterRow}>
            <FontAwesome name="filter" size={16} color={colors.textSecondary} />
            <View style={styles.pickerWrapper}>
              <ThemeAwarePicker
                selectedValue={selectedRecipeFilter}
                onValueChange={(value) => setSelectedRecipeFilter(value as string)}
                options={[
                  { label: 'All items', value: '' },
                  ...availableRecipes.map(recipe => ({ label: recipe, value: recipe })),
                ]}
                placeholder="All items"
              />
            </View>
            {selectedRecipeFilter && (
              <View style={styles.deleteButtonWrapper}>
                <TouchableOpacity
                  onPress={handleDeleteRecipeItems}
                  style={[styles.deleteRecipeButton, { backgroundColor: '#E06C75' }]}
                  disabled={deletingRecipeItems}
                >
                  {deletingRecipeItems ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <FontAwesome name="trash" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Divider after filter */}
      {isGroceryList && availableRecipes.length > 0 && (
        <View style={[styles.filterDivider, { borderBottomColor: colors.border }]} />
      )}

      {showAddItem && !editingItem && (
        <ScrollView
          style={[styles.addItemFormContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          keyboardShouldPersistTaps="handled"
        >
          <AddItemForm
            onSubmit={(data) => {
              handleAddItem(data as CreateListItemData);
            }}
            onCancel={() => {
              setShowAddItem(false);
            }}
            listId={list.id}
            categories={categories}
            isGroceryList={isGroceryList}
            isShoppingList={isShoppingList}
            isTodoList={isTodoList}
            isChecklistList={isChecklistList}
            sections={sections}
            loading={adding}
          />
        </ScrollView>
      )}

      {isChecklistList && showAddSection && !editingItem && (
        <ScrollView
          style={[styles.addItemFormContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
          keyboardShouldPersistTaps="handled"
        >
          <AddSectionForm
            onSubmit={submitAddSection}
            onCancel={() => setShowAddSection(false)}
            loading={sectionFormSaving}
          />
        </ScrollView>
      )}

      {editingItem && (
        <Modal
          visible={true}
          animationType="fade"
          presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : Platform.OS === 'web' ? 'overFullScreen' : 'fullScreen'}
          onRequestClose={() => setEditingItem(null)}
          transparent={Platform.OS === 'web'}
        >
          {Platform.OS === 'web' ? (
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setEditingItem(null)}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
                style={[styles.modalContainer, { backgroundColor: colors.surface }]}
              >
                <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Item</Text>
                  <TouchableOpacity
                    onPress={() => setEditingItem(null)}
                    style={styles.modalCloseButton}
                  >
                    <FontAwesome name="times" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={styles.modalContentScroll}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.modalContentContainer}
                >
                  <AddItemForm
                    editingItem={editingItem}
                    onSubmit={(data) => {
                      handleUpdateItem(data as UpdateListItemData);
                    }}
                    onCancel={() => {
                      setEditingItem(null);
                    }}
                    listId={list.id}
                    categories={categories}
                    isGroceryList={isGroceryList}
                    isShoppingList={isShoppingList}
                    isTodoList={isTodoList}
                    isChecklistList={isChecklistList}
                    sections={sections}
                    loading={updatingItem}
                  />
                </ScrollView>
              </TouchableOpacity>
            </TouchableOpacity>
          ) : (
            <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Edit Item</Text>
                <TouchableOpacity
                  onPress={() => setEditingItem(null)}
                  style={styles.modalCloseButton}
                >
                  <FontAwesome name="times" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={styles.modalContentScroll}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalContentContainer}
              >
                <AddItemForm
                  editingItem={editingItem}
                  onSubmit={(data) => {
                    handleUpdateItem(data as UpdateListItemData);
                  }}
                  onCancel={() => {
                    setEditingItem(null);
                  }}
                  listId={list.id}
                  categories={categories}
                  isGroceryList={isGroceryList}
                  isTodoList={isTodoList}
                  isChecklistList={isChecklistList}
                  sections={sections}
                  loading={updatingItem}
                />
              </ScrollView>
            </View>
          )}
        </Modal>
      )}

      {loadingItems ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading items...</Text>
        </View>
      ) : filteredItems.length === 0 && !isChecklistList ? (
        <View style={styles.emptyState}>
          <FontAwesome name="list-ul" size={48} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {selectedRecipeFilter ? `No items found for recipe "${selectedRecipeFilter}".` : 'No items yet. Add your first item!'}
          </Text>
        </View>
      ) : isChecklistList ? (
        Platform.OS === 'web' ? (
          <ScrollView
            style={styles.scrollView}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {sections.map((section, sectionIndex) => {
              const sectionItems = checklistItemsBySection.get(section.id) ?? [];
              const allCompleted = isSectionAllCompleted(section.id);
              const isCollapsed = collapsedSections.has(section.id);
              return (
                <DraggableChecklistSection
                  key={section.id}
                  sectionId={section.id}
                  sectionIndex={sectionIndex}
                  isDragging={draggedSectionId === section.id}
                  isDragOver={dragOverSectionIndex === sectionIndex}
                  onDragStart={handleChecklistSectionDragStart}
                  onDragOver={handleChecklistSectionDragOver}
                  onDragLeave={handleChecklistSectionDragLeave}
                  onDrop={handleChecklistSectionDrop}
                  onDragEnd={handleChecklistSectionDragEnd}
                >
                  <View style={[styles.sectionGroup, { borderColor: colors.border }]}>
                    <SectionRow
                      section={section}
                      allCompleted={allCompleted}
                      listColor={listColor}
                      onToggleComplete={() => handleSectionToggleComplete(section)}
                      onEditSection={() => {
                        setShowAddSection(false);
                        setCopyChecklistModalOpen(false);
                        setEditSection(section);
                      }}
                      onDeleteSection={() => setDeleteSectionConfirm({ isOpen: true, section })}
                      collapsed={isCollapsed}
                      onToggleCollapse={() => {
                        setCollapsedSections((prev) => {
                          const next = new Set(prev);
                          if (next.has(section.id)) next.delete(section.id);
                          else next.add(section.id);
                          return next;
                        });
                      }}
                      onIndentAll={() => handleIndentAllInSection(section.id)}
                      onOutdentAll={() => handleOutdentAllInSection(section.id)}
                      itemCount={sectionItems.length}
                      showSectionDragHandle
                    />
                    {!isCollapsed && (
                      <View style={styles.checklistItemsContainer}>
                        {sectionItems.map((item) => {
                      const depth = item.indent_level ?? 0;
                      const canIndent = depth < 10;
                      const canOutdent = depth > 0;
                      const itemIndex = sectionItems.findIndex((i) => i.id === item.id);
                      const canMoveUp = itemIndex > 0;
                      const canMoveDown = itemIndex >= 0 && itemIndex < sectionItems.length - 1;
                      const row = (
                        <View
                          key={item.id}
                          style={[
                            styles.checklistItemRow,
                            { paddingLeft: 16 + depth * 32, backgroundColor: colors.surface, borderColor: colors.borderStrong },
                          ]}
                        >
                          <View style={{ flex: 1 }} collapsable={false}>
                            <ListItemComponent
                              item={item}
                              onToggleComplete={() => toggleItemComplete(item)}
                              onEdit={() => setEditingItem(item)}
                              onDelete={() => handleDeleteItem(item)}
                              isTodoList={false}
                              onIndent={() => handleIndent(item)}
                              onOutdent={() => handleOutdent(item)}
                              canIndent={canIndent}
                              canOutdent={canOutdent}
                              onMoveUp={Platform.OS !== 'web' && canMoveUp ? () => handleMoveItemUpInSection(item) : undefined}
                              onMoveDown={Platform.OS !== 'web' && canMoveDown ? () => handleMoveItemDownInSection(item) : undefined}
                              showDragHandle
                            />
                          </View>
                        </View>
                      );
                      return Platform.OS === 'web' ? (
                        <DraggableChecklistItemRow
                          key={item.id}
                          itemId={item.id}
                          isDragging={draggedChecklistItemId === item.id}
                          isDropTarget={dropTargetChecklistItemId === item.id}
                          onDragStart={handleChecklistItemDragStart}
                          onDragOver={handleChecklistItemDragOver}
                          onDragLeave={handleChecklistItemDragLeave}
                          onDrop={handleChecklistItemDrop}
                          onDragEnd={handleChecklistItemDragEnd}
                        >
                          {row}
                        </DraggableChecklistItemRow>
                      ) : (
                        row
                      );
                    })}
                      </View>
                    )}
                  </View>
                </DraggableChecklistSection>
              );
            })}
            {sections.length === 0 && listItems.filter((i) => i.section == null).length === 0 && (
              <View style={[styles.emptyState, { paddingVertical: 24 }]}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No sections yet. Use the "Add Section" button above to get started.</Text>
              </View>
            )}
          </ScrollView>
        ) : DraggableFlatList ? (
          <DraggableFlatList
            data={sections}
            keyExtractor={(s: ListSection) => s.id.toString()}
            onDragEnd={({ data }: { data: ListSection[] }) => handleChecklistSectionDragEndMobile(data)}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
            renderItem={({ item: section, drag }: any) => {
              const sectionItems = checklistItemsBySection.get(section.id) ?? [];
              const allCompleted = isSectionAllCompleted(section.id);
              const isCollapsed = collapsedSections.has(section.id);
              return (
                <ScaleDecorator>
                  <View style={[styles.sectionGroup, { borderColor: colors.border }]}>
                    <SectionRow
                      section={section}
                      allCompleted={allCompleted}
                      listColor={listColor}
                      onToggleComplete={() => handleSectionToggleComplete(section)}
                      onEditSection={() => {
                        setShowAddSection(false);
                        setCopyChecklistModalOpen(false);
                        setEditSection(section);
                      }}
                      onDeleteSection={() => setDeleteSectionConfirm({ isOpen: true, section })}
                      collapsed={isCollapsed}
                      onToggleCollapse={() => {
                        setCollapsedSections((prev) => {
                          const next = new Set(prev);
                          if (next.has(section.id)) next.delete(section.id);
                          else next.add(section.id);
                          return next;
                        });
                      }}
                      onIndentAll={() => handleIndentAllInSection(section.id)}
                      onOutdentAll={() => handleOutdentAllInSection(section.id)}
                      itemCount={sectionItems.length}
                      onSectionDrag={drag}
                    />
                    {!isCollapsed && (
                      <View style={styles.checklistItemsContainer}>
                        {sectionItems.map((item) => {
                      const depth = item.indent_level ?? 0;
                      const canIndent = depth < 10;
                      const canOutdent = depth > 0;
                      const itemIndex = sectionItems.findIndex((i) => i.id === item.id);
                      const canMoveUp = itemIndex > 0;
                      const canMoveDown = itemIndex >= 0 && itemIndex < sectionItems.length - 1;
                      return (
                        <View
                          key={item.id}
                          style={[
                            styles.checklistItemRow,
                            { paddingLeft: 16 + depth * 32, backgroundColor: colors.surface, borderColor: colors.borderStrong },
                          ]}
                        >
                          <View style={{ flex: 1 }} collapsable={false}>
                            <ListItemComponent
                              item={item}
                              onToggleComplete={() => toggleItemComplete(item)}
                              onEdit={() => setEditingItem(item)}
                              onDelete={() => handleDeleteItem(item)}
                              isTodoList={false}
                              onIndent={() => handleIndent(item)}
                              onOutdent={() => handleOutdent(item)}
                              canIndent={canIndent}
                              canOutdent={canOutdent}
                              onMoveUp={Platform.OS !== 'web' && canMoveUp ? () => handleMoveItemUpInSection(item) : undefined}
                              onMoveDown={Platform.OS !== 'web' && canMoveDown ? () => handleMoveItemDownInSection(item) : undefined}
                              showDragHandle
                            />
                          </View>
                        </View>
                      );
                    })}
                      </View>
                    )}
                  </View>
                </ScaleDecorator>
              );
            }}
            contentContainerStyle={styles.checklistContent}
          />
        ) : (
          <ScrollView
            style={styles.scrollView}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {sections.map((section) => {
              const sectionItems = checklistItemsBySection.get(section.id) ?? [];
              const allCompleted = isSectionAllCompleted(section.id);
              const isCollapsed = collapsedSections.has(section.id);
              return (
                <View key={section.id} style={[styles.sectionGroup, { borderColor: colors.border }]}>
                  <SectionRow
                    section={section}
                    allCompleted={allCompleted}
                    listColor={listColor}
                    onToggleComplete={() => handleSectionToggleComplete(section)}
                    onEditSection={() => {
                      setShowAddSection(false);
                      setCopyChecklistModalOpen(false);
                      setEditSection(section);
                    }}
                    onDeleteSection={() => setDeleteSectionConfirm({ isOpen: true, section })}
                    collapsed={isCollapsed}
                    onToggleCollapse={() => {
                      setCollapsedSections((prev) => {
                        const next = new Set(prev);
                        if (next.has(section.id)) next.delete(section.id);
                        else next.add(section.id);
                        return next;
                      });
                    }}
                    onIndentAll={() => handleIndentAllInSection(section.id)}
                    onOutdentAll={() => handleOutdentAllInSection(section.id)}
                    itemCount={sectionItems.length}
                    showSectionDragHandle
                  />
                  {!isCollapsed && (
                    <View style={styles.checklistItemsContainer}>
                      {sectionItems.map((item) => {
                    const depth = item.indent_level ?? 0;
                    const canIndent = depth < 10;
                    const canOutdent = depth > 0;
                    const itemIndex = sectionItems.findIndex((i) => i.id === item.id);
                    const canMoveUp = itemIndex > 0;
                    const canMoveDown = itemIndex >= 0 && itemIndex < sectionItems.length - 1;
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.checklistItemRow,
                          { paddingLeft: 16 + depth * 32, backgroundColor: colors.surface, borderColor: colors.borderStrong },
                        ]}
                      >
                        <View style={{ flex: 1 }} collapsable={false}>
                          <ListItemComponent
                            item={item}
                            onToggleComplete={() => toggleItemComplete(item)}
                            onEdit={() => setEditingItem(item)}
                            onDelete={() => handleDeleteItem(item)}
                            isTodoList={false}
                            onIndent={() => handleIndent(item)}
                            onOutdent={() => handleOutdent(item)}
                            canIndent={canIndent}
                            canOutdent={canOutdent}
                            onMoveUp={Platform.OS !== 'web' && canMoveUp ? () => handleMoveItemUpInSection(item) : undefined}
                            onMoveDown={Platform.OS !== 'web' && canMoveDown ? () => handleMoveItemDownInSection(item) : undefined}
                          showDragHandle
                          />
                        </View>
                      </View>
                    );
                  })}
                    </View>
                  )}
                </View>
              );
            })}
            {sections.length === 0 && listItems.filter((i) => i.section == null).length === 0 && (
              <View style={[styles.emptyState, { paddingVertical: 24 }]}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No sections yet. Use the "Add Section" button above to get started.</Text>
              </View>
            )}
          </ScrollView>
        )
      ) : isGroceryList && listColor ? (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {sortedCategoryIds.map((categoryId) => {
            const categoryItems = groupedItems[categoryId];
            const categoryName = getCategoryName(categoryId);
            const isCollapsed = collapsedCategories.has(categoryId);
            const isUncategorized = categoryId === 'uncategorized';

            // Only render if we have a valid listColor to prevent flashing
            if (!listColor) return null;

            return (
              <CategoryGroup
                key={categoryId}
                categoryId={categoryId}
                categoryName={categoryName}
                items={categoryItems}
                isCollapsed={isCollapsed}
                listColor={listColor}
                onToggleCollapse={() => toggleCategory(categoryId)}
                onToggleItemComplete={toggleItemComplete}
                onEditItem={(item) => {
                  setEditingItem(item);
                }}
                onDeleteItem={handleDeleteItem}
                onMoveItem={handleOpenMoveModal}
                isUncategorized={isUncategorized}
              />
            );
          })}
        </ScrollView>
      ) : Platform.OS === 'web' && supportsDragAndDrop ? (
        // Web drag-and-drop: Use FlatList with DraggableListItem
        <FlatList
          data={[...filteredItems].sort((a, b) => {
            if (a.order !== b.order) {
              return (a.order || 0) - (b.order || 0);
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          renderItem={({ item, index }) => (
            <DraggableListItem
              item={item}
              index={index}
              draggedItemId={draggedItemId}
              dragOverIndex={dragOverIndex}
              onDragStart={handleWebDragStart}
              onDragOver={handleWebDragOver}
              onDragLeave={handleWebDragLeave}
              onDrop={handleWebDrop}
              onDragEnd={handleWebDragEnd}
              onToggleComplete={() => toggleItemComplete(item)}
              onEdit={() => {
                setEditingItem(item);
              }}
              onDelete={() => handleDeleteItem(item)}
              onMove={() => handleOpenMoveModal(item)}
              isGroceryList={isGroceryList}
              isTodoList={isTodoList}
            />
          )}
          contentContainerStyle={styles.itemsContainer}
        />
      ) : Platform.OS !== 'web' && supportsDragAndDrop && DraggableFlatList ? (
        // Mobile drag-and-drop: Use DraggableFlatList (if available)
        <DraggableFlatList
          data={[...filteredItems].sort((a, b) => {
            if (a.order !== b.order) {
              return (a.order || 0) - (b.order || 0);
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })}
          keyExtractor={(item: ListItem) => item.id.toString()}
          onDragEnd={({ data }: { data: ListItem[] }) => handleMobileDragEnd(data)}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          renderItem={({ item, drag }: any) => (
            <ScaleDecorator>
              <ListItemComponent
                item={item}
                onToggleComplete={() => toggleItemComplete(item)}
                onEdit={() => {
                  setEditingItem(item);
                }}
                onDelete={() => handleDeleteItem(item)}
                onMove={() => handleOpenMoveModal(item)}
                isGroceryList={isGroceryList}
                isTodoList={isTodoList}
                onDrag={drag}
                showDragHandle={true}
              />
            </ScaleDecorator>
          )}
          contentContainerStyle={styles.itemsContainer}
        />
      ) : (
        // Mobile without drag-and-drop: Use regular FlatList (for Grocery/Shopping lists)
        <FlatList
          data={[...filteredItems].sort((a, b) => {
            if (a.order !== b.order) {
              return (a.order || 0) - (b.order || 0);
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          })}
          keyExtractor={(item) => item.id.toString()}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          renderItem={({ item }) => (
            <ListItemComponent
              item={item}
              onToggleComplete={() => toggleItemComplete(item)}
              onEdit={() => {
                setEditingItem(item);
              }}
              onDelete={() => handleDeleteItem(item)}
              isGroceryList={isGroceryList}
              isTodoList={isTodoList}
            />
          )}
          contentContainerStyle={styles.itemsContainer}
        />
      )}

      <AlertModal
        visible={deleteConfirm.isOpen}
        title="Delete Item"
        message={`Are you sure you want to delete "${deleteConfirm.itemName}"? This action cannot be undone.`}
        type="error"
        onClose={() => {
          deleteConfirmFromVoicePickRef.current = false;
          setDeleteConfirm({ isOpen: false, itemId: null, itemName: '' });
        }}
        onConfirm={confirmDeleteItem}
        confirmText="Delete"
        cancelText="Cancel"
        showCancel={true}
      />
      <AlertModal
        visible={deleteSectionConfirm.isOpen}
        title="Delete Section"
        message={`Are you sure you want to delete "${deleteSectionConfirm.section?.title}"? All items in this section will also be deleted. This cannot be undone.`}
        type="error"
        onClose={() => setDeleteSectionConfirm({ isOpen: false, section: null })}
        onConfirm={confirmDeleteSection}
        confirmText="Delete"
        cancelText="Cancel"
        showCancel={true}
      />
      {isChecklistList && (
        <SectionFormModal
          visible={editSection !== null}
          section={editSection}
          saving={sectionFormSaving}
          onDismiss={() => {
            if (!sectionFormSaving) setEditSection(null);
          }}
          onSave={submitEditSection}
        />
      )}
      {isChecklistList && list && (
        <CopyChecklistModal
          visible={copyChecklistModalOpen}
          sourceListName={list.name}
          saving={copyChecklistSaving}
          onCancel={() => {
            if (!copyChecklistSaving) setCopyChecklistModalOpen(false);
          }}
          onConfirm={confirmCopyChecklist}
        />
      )}
      {isChecklistList && (
        <Modal
          visible={voiceDeletePickModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => {
            setVoiceDeletePickModalOpen(false);
            setVoiceDeletePickCandidates([]);
            stop();
            reset();
            lastProcessedTranscriptRef.current = '';
          }}
        >
          <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
            <View style={[styles.modalContentSecondary, { backgroundColor: colors.surface }]}>
              <View style={styles.modalHeaderSecondary}>
                <Text style={[styles.modalTitleSecondary, { color: colors.text }]}>Which item?</Text>
                <TouchableOpacity
                  onPress={() => {
                    setVoiceDeletePickModalOpen(false);
                    setVoiceDeletePickCandidates([]);
                    stop();
                    reset();
                    lastProcessedTranscriptRef.current = '';
                  }}
                  style={styles.modalCloseButtonSecondary}
                  accessibilityLabel="Close"
                >
                  <FontAwesome name="times" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <Text style={[styles.voiceDeletePickHint, { color: colors.textSecondary }]}>
                Tap the row you want to delete. You will be asked to confirm.
              </Text>
              <ScrollView
                style={styles.voiceDeletePickList}
                keyboardShouldPersistTaps="handled"
              >
                {voiceDeletePickCandidates.map((cand) => {
                  const sec = sections.find((s) => s.id === cand.section);
                  const secLabel = sec?.title ?? 'Section';
                  return (
                    <TouchableOpacity
                      key={cand.id}
                      style={[
                        styles.voiceDeletePickRow,
                        { borderColor: colors.border, backgroundColor: colors.background },
                      ]}
                      onPress={() => {
                        setVoiceDeletePickModalOpen(false);
                        setVoiceDeletePickCandidates([]);
                        stop();
                        reset();
                        lastProcessedTranscriptRef.current = '';
                        handleDeleteItem(cand, { fromVoiceDeletePick: true });
                      }}
                    >
                      <Text style={[styles.voiceDeletePickItemName, { color: colors.text }]}>{cand.name}</Text>
                      <Text style={[styles.voiceDeletePickSectionLabel, { color: colors.textSecondary }]}>
                        {secLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
      <ConfirmModal
        visible={deleteRecipeConfirm.isOpen}
        title="Delete Recipe Items"
        message={`Are you sure you want to delete all ${deleteRecipeConfirm.itemCount} item(s) from "${deleteRecipeConfirm.recipeName}"? This action cannot be undone.`}
        type="danger"
        onClose={() => setDeleteRecipeConfirm({ isOpen: false, recipeName: '', itemCount: 0 })}
        onConfirm={confirmDeleteRecipeItems}
        confirmText="Delete All"
        cancelText="Cancel"
      />
      <Modal
        visible={moveItemModal.isOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMoveItemModal({ isOpen: false, item: null })}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
          <View style={[styles.modalContentSecondary, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeaderSecondary}>
              <Text style={[styles.modalTitleSecondary, { color: colors.text }]}>Move Item</Text>
              <TouchableOpacity
                onPress={() => setMoveItemModal({ isOpen: false, item: null })}
                style={styles.modalCloseButtonSecondary}
              >
                <FontAwesome name="times" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {moveItemModal.item && (
              <>
                <View style={[styles.itemPreview, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <Text style={[styles.itemPreviewName, { color: colors.text }]}>
                    {moveItemModal.item.name}
                  </Text>
                  {moveItemModal.item.quantity && (
                    <Text style={[styles.itemPreviewQuantity, { color: colors.textSecondary }]}>
                      Quantity: {moveItemModal.item.quantity}
                    </Text>
                  )}
                  {moveItemModal.item.notes && !moveItemModal.item.notes.startsWith('From recipe:') && (
                    <Text style={[styles.itemPreviewNotes, { color: colors.textSecondary }]}>
                      {moveItemModal.item.notes}
                    </Text>
                  )}
                </View>

                <View style={styles.pickerContainer}>
                  <Text style={[styles.pickerLabel, { color: colors.text }]}>Move to list:</Text>
                  <ThemeAwarePicker
                    selectedValue={selectedTargetListId}
                    onValueChange={(value) => {
                      if (value === null || value === '') {
                        setSelectedTargetListId(null);
                      } else {
                        setSelectedTargetListId(Number(value));
                      }
                    }}
                    options={availableLists.map((l) => ({
                      label: l.name,
                      value: l.id,
                    }))}
                    placeholder="Select a list"
                    enabled={true}
                  />
                </View>

                <View style={[styles.modalButtons, { marginTop: 24 }]}>
                  <TouchableOpacity
                    onPress={() => setMoveItemModal({ isOpen: false, item: null })}
                    style={[styles.modalButton, styles.cancelButtonSecondary, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.modalButtonText, { color: colors.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleMoveItemToList}
                    disabled={!selectedTargetListId || movingItem}
                    style={[
                      styles.modalButton,
                      styles.confirmButton,
                      { backgroundColor: colors.primary },
                      (!selectedTargetListId || movingItem) && styles.disabledButton,
                    ]}
                  >
                    {movingItem ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.modalButtonTextWhite}>Move</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
      <AlertModal
        visible={moveItemResultModal.visible}
        title={moveItemResultModal.type === 'success' ? 'Item Moved' : 'Error'}
        message={moveItemResultModal.message}
        type={moveItemResultModal.type}
        onClose={() => setMoveItemResultModal({ visible: false, message: '', type: 'success' })}
        confirmText="OK"
      />
      <AlertModal
        visible={showVoiceHelpModal}
        title="Voice commands"
        message="Use these phrases when the mic is listening:"
        type="info"
        onClose={() => setShowVoiceHelpModal(false)}
        confirmText="OK"
        details={
          isChecklistList
            ? [
                {
                  label: 'Add item',
                  items: [
                    'add — say section number or name, or item name first',
                    'add [item name] — then pick section',
                  ],
                },
                { label: 'Add section', items: ['add section', 'add section [title]'] },
                {
                  label: 'Delete item',
                  items: [
                    'delete — say section or item name',
                    'delete [item name] — confirms with section before deleting',
                  ],
                },
                {
                  label: 'Update item',
                  items: [
                    'update — say section or item, then new name',
                    'update [old name] to [new name]',
                  ],
                },
              ]
            : [
                { label: 'Add item', items: ['add [item name]'] },
                { label: 'Delete item', items: ['delete [item name]'] },
                { label: 'Update item', items: ['update [old name] to [new name]'] },
              ]
        }
      />
    </View>
  );
}

// @ts-ignore - Web-specific styles cause type conflicts
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 16,
    marginTop: 8,
  },
  backButton: {
    padding: 8,
  },
  headerContent: {
    flex: 1,
  },
  titleMeasureWrap: {
    position: 'absolute',
    left: -9999,
    width: 9999,
  },
  listTitle: {
    fontSize: Platform.select({ ios: TITLE_FONT_SIZE_REGULAR_NATIVE, android: TITLE_FONT_SIZE_REGULAR_NATIVE, default: TITLE_FONT_SIZE_REGULAR_WEB }),
    fontWeight: 'bold',
    letterSpacing: 0.3,
    flex: 1,
    minWidth: 0,
  },
  listDescription: {
    fontSize: 14,
    marginTop: 4,
  },
  actionsBar: {
    flexDirection: 'column',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'web' ? 16 : 0, // No bottom padding on mobile
    borderBottomWidth: 1,
    gap: 0,
  },
  actionsBarTop: {
    flexDirection: 'column',
    width: '100%',
    marginBottom: Platform.OS === 'web' ? 12 : 8,
    gap: 8,
  },
  recipeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.OS === 'web' ? 12 : 8,
    width: '100%',
    paddingHorizontal: Platform.OS === 'web' ? 0 : 0, // No horizontal padding since actionsBar has it
    marginTop: 0, // No top margin - actionsBarTop marginBottom handles spacing
    marginBottom: 0, // No bottom margin
    flexWrap: 'nowrap',
  },
  filterDivider: {
    borderBottomWidth: 1,
    marginHorizontal: Platform.OS === 'web' ? 0 : 16,
    marginVertical: 0, // No vertical margin
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web'
      ? { minWidth: 120, flexShrink: 0 }
      : {
        width: '100%',
        marginBottom: 4,
      }
    ),
  },
  pickerWrapper: {
    ...(Platform.OS === 'web'
      ? { flex: 1, minWidth: 150 }
      : {
        flex: 2, // Give more flex space to dropdown
        minWidth: 200, // Increased width to prevent text wrapping
        minHeight: 40, // Smaller height for mobile
        marginRight: 8, // Add spacing before delete button if present
        marginBottom: 0, // No bottom margin
        flexShrink: 1,
      }
    ),
  },
  spacer: {
    ...(Platform.OS === 'web'
      ? {}
      : {
        height: 16, // Explicit spacer to push delete button down
        width: '100%',
      }
    ),
  },
  deleteButtonWrapper: {
    ...(Platform.OS === 'web'
      ? {}
      : {
        flexShrink: 0, // Don't shrink delete button
        marginLeft: 8, // Add spacing from dropdown
        alignItems: 'flex-start', // Align button to left, not full width
      }
    ),
  },
  deleteRecipeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    ...(Platform.OS === 'web'
      ? { flexShrink: 0 }
      : {
        alignSelf: 'flex-start', // Don't stretch to full width
        marginTop: 0,
      }
    ),
  },
  deleteRecipeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    flex: Platform.OS === 'web' ? 1 : 0,
    ...(Platform.OS !== 'web' ? { minWidth: 0 } : {}),
  },
  actionButtonsPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonsSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  voiceHelpButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    gap: 6,
    flexShrink: 0,
  },
  addButtonText: {
    color: '#fff',
    fontSize: Platform.OS === 'web' ? 14 : 13,
    fontWeight: '600',
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    gap: 6,
    flexShrink: 0,
    borderWidth: 1,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
      },
    }),
  },
  historyButtonText: {
    fontSize: Platform.OS === 'web' ? 14 : 13,
    fontWeight: '600',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: Platform.OS === 'web' ? 16 : 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    gap: 6,
    flexShrink: 0,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: Platform.OS === 'web' ? 14 : 13,
    fontWeight: '600',
  },
  // @ts-ignore - Web-specific styles in Platform.select
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    // @ts-ignore - Web-specific styles
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        width: '100vw',
        height: '100vh',
        display: 'flex',
      },
    }),
  },
  // @ts-ignore - Web-specific styles in Platform.select
  modalContainer: {
    // @ts-ignore - Web-specific styles
    ...Platform.select({
      web: {
        borderRadius: 12,
        width: '100%',
        maxWidth: 600,
        maxHeight: '90vh',
        minHeight: 200,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#fff',
        position: 'relative',
        zIndex: 1001,
      },
      default: {
        flex: 1,
        backgroundColor: '#fff',
      },
    }),
  },
  modalContainerWeb: {
    // Additional web-specific styles if needed
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalCloseButton: {
    padding: 8,
  },
  // @ts-ignore - Web-specific styles in Platform.select
  modalContentScroll: {
    // @ts-ignore - Web-specific styles
    ...Platform.select({
      web: {
        maxHeight: 'calc(90vh - 80px)',
        overflowY: 'auto',
      },
      default: {
        flex: 1,
      },
    }),
  },
  modalContentContainer: {
    padding: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  editFormTitle: {
    fontSize: 18,
    fontWeight: '600',
    padding: 16,
    paddingBottom: 8,
  },
  addItemFormContainer: {
    padding: 16,
    borderBottomWidth: 1,
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS !== 'web' ? {
      zIndex: 200,
      position: 'relative',
    } : {}),
  },
  itemsContainer: {
    padding: 16,
    ...(Platform.OS !== 'web' ? {
      zIndex: 200,
    } : {}),
  },
  sectionGroup: {
    marginBottom: 16,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  checklistItemsContainer: {
    padding: 8,
  },
  checklistContent: {
    paddingBottom: 24,
  },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
  },
  indentOutdentRow: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: 8,
    minWidth: 72,
  },
  indentButton: {
    padding: 8,
    borderRadius: 4,
    minWidth: 36,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContainer: {
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  backButtonText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  draggingItem: {
    opacity: 0.5,
    // @ts-ignore - web-specific cursor style
    ...(Platform.OS === 'web' && { cursor: 'grabbing' }),
  },
  dragOverItem: {
    borderTopWidth: 2,
    borderTopColor: '#007AFF',
    // @ts-ignore - web-specific border style
    ...(Platform.OS === 'web' && { borderTopStyle: 'solid' }),
  },
  expandCollapseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    flexShrink: 0,
    flexWrap: 'nowrap',
  },
  expandCollapseButtonText: {
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 0,
  },
  modalOverlaySecondary: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContentSecondary: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    ...Platform.select({
      web: {
        // @ts-ignore - web-specific boxShadow
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.25)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
  },
  modalHeaderSecondary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitleSecondary: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalCloseButtonSecondary: {
    padding: 4,
  },
  voiceDeletePickHint: {
    fontSize: 14,
    marginBottom: 12,
  },
  voiceDeletePickList: {
    maxHeight: 360,
  },
  voiceDeletePickRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  voiceDeletePickItemName: {
    fontSize: 16,
    fontWeight: '600',
  },
  voiceDeletePickSectionLabel: {
    fontSize: 13,
    marginTop: 4,
  },
  itemPreview: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 20,
  },
  itemPreviewName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemPreviewQuantity: {
    fontSize: 14,
    marginTop: 4,
  },
  itemPreviewNotes: {
    fontSize: 14,
    marginTop: 4,
  },
  pickerContainer: {
    marginBottom: 20,
  },
  pickerLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelButtonSecondary: {
    borderWidth: 1,
  },
  confirmButton: {
    // backgroundColor set inline
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextWhite: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
}) as any; // Type assertion to bypass web-specific style type errors

