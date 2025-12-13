import apiClient, { APIError, handleAPIError } from './api';
import {
  List,
  ListItem,
  GroceryCategory,
  CreateListData,
  UpdateListData,
  CreateListItemData,
  UpdateListItemData,
  CreateGroceryCategoryData,
  UpdateGroceryCategoryData,
  ListType,
} from '../types/lists';

/**
 * List Service
 */
class ListService {
  /**
   * Get all lists for a family (optionally filtered by type)
   */
  async getLists(familyId?: number, listType?: ListType): Promise<List[]> {
    try {
      const params: any = {};
      if (familyId) {
        params.family = familyId;
      }
      if (listType) {
        params.list_type = listType;
      }

      const response = await apiClient.get('/lists/', { params });
      // Handle pagination
      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
    } catch (error) {
      console.error('Error fetching lists:', error);
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get a specific list by ID
   */
  async getList(listId: number): Promise<List> {
    try {
      const response = await apiClient.get<List>(`/lists/${listId}/`);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Create a new list
   */
  async createList(data: CreateListData): Promise<List> {
    try {
      const response = await apiClient.post<List>('/lists/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update a list
   */
  async updateList(listId: number, data: UpdateListData): Promise<List> {
    try {
      const response = await apiClient.patch<List>(`/lists/${listId}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete a list
   */
  async deleteList(listId: number): Promise<void> {
    try {
      await apiClient.delete(`/lists/${listId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get all items for a list
   */
  async getListItems(listId: number): Promise<ListItem[]> {
    try {
      const response = await apiClient.get('/list-items/', {
        params: { list: listId },
      });
      // Handle pagination - fetch all pages
      let items: ListItem[] = [];
      if (response.data && Array.isArray(response.data.results)) {
        items = response.data.results;
        // If there are more pages, fetch them
        if (response.data.next) {
          let nextUrl = response.data.next;
          while (nextUrl) {
            try {
              // Extract path from full URL
              let path = nextUrl;
              if (nextUrl.startsWith('http://') || nextUrl.startsWith('https://')) {
                const url = new URL(nextUrl);
                path = url.pathname + url.search;
                // Remove /api prefix if present
                if (path.startsWith('/api')) {
                  path = path.substring(4);
                }
              } else if (nextUrl.startsWith('/api')) {
                path = nextUrl.substring(4);
              } else if (!nextUrl.startsWith('/')) {
                path = '/' + nextUrl;
              }

              const nextResponse = await apiClient.get(path);
              if (nextResponse.data && Array.isArray(nextResponse.data.results)) {
                items = [...items, ...nextResponse.data.results];
                nextUrl = nextResponse.data.next;
              } else {
                break;
              }
            } catch (err) {
              console.error('Error fetching next page of list items:', err);
              break;
            }
          }
        }
      } else if (Array.isArray(response.data)) {
        items = response.data;
      }
      return items;
    } catch (error) {
      console.error('Error fetching list items:', error);
      throw handleAPIError(error as any);
    }
  }

  /**
   * Create a new list item
   */
  async createListItem(data: CreateListItemData): Promise<ListItem> {
    try {
      const response = await apiClient.post<ListItem>('/list-items/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update a list item
   */
  async updateListItem(itemId: number, data: UpdateListItemData): Promise<ListItem> {
    try {
      const response = await apiClient.patch<ListItem>(`/list-items/${itemId}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete a list item
   */
  async deleteListItem(itemId: number): Promise<void> {
    try {
      await apiClient.delete(`/list-items/${itemId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Toggle item completion status
   */
  async toggleItemComplete(itemId: number, completed: boolean): Promise<ListItem> {
    try {
      const response = await apiClient.patch<ListItem>(`/list-items/${itemId}/`, { completed });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get all grocery categories for a family
   */
  async getGroceryCategories(familyId: number): Promise<GroceryCategory[]> {
    try {
      const response = await apiClient.get('/grocery-categories/', {
        params: { family: familyId },
      });
      // Handle pagination
      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      if (Array.isArray(response.data)) {
        return response.data;
      }
      return [];
    } catch (error) {
      console.error('Error fetching grocery categories:', error);
      throw handleAPIError(error as any);
    }
  }

  /**
   * Create a new grocery category
   */
  async createGroceryCategory(data: CreateGroceryCategoryData): Promise<GroceryCategory> {
    try {
      const response = await apiClient.post<GroceryCategory>('/grocery-categories/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update a grocery category
   */
  async updateGroceryCategory(categoryId: number, data: UpdateGroceryCategoryData): Promise<GroceryCategory> {
    try {
      const response = await apiClient.patch<GroceryCategory>(`/grocery-categories/${categoryId}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete a grocery category
   */
  async deleteGroceryCategory(categoryId: number): Promise<void> {
    try {
      await apiClient.delete(`/grocery-categories/${categoryId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }
}

export default new ListService();



