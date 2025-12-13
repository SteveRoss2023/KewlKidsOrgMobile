/**
 * TypeScript types for Lists feature
 */

export type ListType = 'shopping' | 'grocery' | 'todo' | 'other';

export interface List {
  id: number;
  family: number;
  created_by: number | null;
  created_by_username: string | null;
  name: string;
  description: string | null;
  list_type: ListType;
  color: string;
  created_at: string;
  updated_at: string;
  archived: boolean;
  item_count: number;
}

export interface ListItem {
  id: number;
  list: number;
  created_by: number | null;
  created_by_username: string | null;
  assigned_to: number | null;
  assigned_to_username: string | null;
  name: string;
  notes: string | null;
  quantity: string | null;
  category: number | null;
  category_name: string | null;
  completed: boolean;
  completed_at: string | null;
  completed_by: number | null;
  order: number;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroceryCategory {
  id: number;
  family: number;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  is_default: boolean;
  keywords: string[];
  created_at: string;
  updated_at: string;
}

export interface CreateListData {
  name: string;
  description?: string;
  list_type: ListType;
  color: string;
  family: number;
}

export interface UpdateListData {
  name?: string;
  description?: string;
  list_type?: ListType;
  color?: string;
}

export interface CreateListItemData {
  list: number;
  name: string;
  notes?: string;
  quantity?: string;
  category?: number | null;
  due_date?: string | null;
}

export interface UpdateListItemData {
  name?: string;
  notes?: string;
  quantity?: string;
  category?: number | null;
  completed?: boolean;
  order?: number;
  due_date?: string | null;
}

export interface CreateGroceryCategoryData {
  family: number;
  name: string;
  description?: string;
  icon?: string;
  order?: number;
  keywords?: string[];
}

export interface UpdateGroceryCategoryData {
  name?: string;
  description?: string;
  icon?: string;
  order?: number;
  keywords?: string[];
}



