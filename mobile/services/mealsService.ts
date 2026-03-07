import { Platform } from 'react-native';
import apiClient, { handleAPIError, APIError } from './api';
import { tokenStorage } from '../utils/storage';

/**
 * Recipe data
 */
export interface Recipe {
  id: number;
  family: number;
  created_by: number;
  created_by_username?: string;
  title: string;
  notes?: string;
  ingredients: string[];
  instructions: string[];
  servings?: number;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  image_url?: string;
  source_url?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Meal Plan data
 */
export interface MealPlan {
  id: number;
  family: number;
  created_by: number;
  created_by_username?: string;
  notes?: string;
  week_start_date: string;
  meals: {
    [day: string]: {
      [mealType: string]: (number | string)[];
    };
  };
  created_at: string;
  updated_at: string;
}

/**
 * Picked image asset for recipe photo (from expo-image-picker or similar)
 */
export interface RecipeImageAsset {
  uri: string;
  type?: string;
  fileName?: string;
}

/**
 * Create Recipe data
 */
export interface CreateRecipeData {
  family: number;
  title: string;
  notes?: string;
  ingredients: string[];
  instructions: string[];
  servings?: number;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  image_url?: string;
  source_url?: string;
  /** Picked image file (library/camera); when set, create uses FormData */
  image?: RecipeImageAsset | null;
}

/**
 * Update Recipe data
 */
export interface UpdateRecipeData {
  title?: string;
  notes?: string;
  ingredients?: string[];
  instructions?: string[];
  servings?: number;
  prep_time_minutes?: number;
  cook_time_minutes?: number;
  image_url?: string;
  source_url?: string;
  /** New image file; when set, update uses FormData. Use clear_image: true to remove photo. */
  image?: RecipeImageAsset | null;
  clear_image?: boolean;
}

/**
 * Create Meal Plan data
 */
export interface CreateMealPlanData {
  family: number;
  week_start_date: string;
  notes?: string;
  meals?: {
    [day: string]: {
      [mealType: string]: (number | string)[];
    };
  };
}

/**
 * Update Meal Plan data
 */
export interface UpdateMealPlanData {
  notes?: string;
  meals?: {
    [day: string]: {
      [mealType: string]: (number | string)[];
    };
  };
}

/**
 * Recipe import response
 */
export interface RecipeImportResponse {
  error?: string;
  detail?: string;
  suggestion?: string;
}

/**
 * Add to list response
 */
export interface AddToListResponse {
  added_count: number;
  skipped_count: number;
  added_items: number[];
  skipped_items?: string[];
  categorized_items?: number[];
  uncategorized_items?: number[];
  uncategorized_item_names?: string[];
  message: string;
}

/**
 * Append recipe image to FormData (web: File from blob; native: { uri, type, name })
 */
async function appendRecipeImage(formData: FormData, fieldName: string, image: RecipeImageAsset): Promise<void> {
  let uri = image.uri || (image as any).uri;
  const photoType = image.type || 'image/jpeg';
  const photoName = image.fileName || (image as any).fileName || 'recipe.jpg';

  if (Platform.OS === 'web') {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const file = new File([blob], photoName, { type: photoType });
      formData.append(fieldName, file);
    } catch (e) {
      if (uri.startsWith('data:')) {
        const base64Data = uri.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: photoType });
        const file = new File([blob], photoName, { type: photoType });
        formData.append(fieldName, file);
      } else {
        throw e;
      }
    }
  } else {
    if (!uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('ph://')) {
      uri = uri.startsWith('/') ? `file://${uri}` : `file://${uri}`;
    }
    formData.append(fieldName, { uri, type: photoType, name: photoName } as any);
  }
}

/**
 * Meals Service
 */
class MealsService {
  /**
   * Fetch all recipes for a family
   */
  async fetchRecipes(familyId: number): Promise<Recipe[]> {
    try {
      const response = await apiClient.get<{ results?: Recipe[] } | Recipe[]>('/recipes/', {
        params: { family: familyId },
      });
      const data = response.data;
      return Array.isArray(data) ? data : data.results || [];
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Fetch a single recipe by ID
   */
  async fetchRecipe(id: number): Promise<Recipe> {
    try {
      const response = await apiClient.get<Recipe>(`/recipes/${id}/`);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Create a new recipe
   */
  async createRecipe(data: CreateRecipeData): Promise<Recipe> {
    try {
      if (data.image) {
        const formData = new FormData();
        formData.append('family', String(data.family));
        formData.append('title', data.title);
        if (data.notes !== undefined) formData.append('notes', data.notes);
        formData.append('ingredients', JSON.stringify(data.ingredients));
        formData.append('instructions', JSON.stringify(data.instructions));
        if (data.servings !== undefined) formData.append('servings', String(data.servings));
        if (data.prep_time_minutes !== undefined) formData.append('prep_time_minutes', String(data.prep_time_minutes));
        if (data.cook_time_minutes !== undefined) formData.append('cook_time_minutes', String(data.cook_time_minutes));
        if (data.image_url) formData.append('image_url', data.image_url);
        if (data.source_url) formData.append('source_url', data.source_url);
        await appendRecipeImage(formData, 'image', data.image);

        if (Platform.OS !== 'web') {
          return await this.sendRecipeFormData('POST', '/recipes/', formData);
        }
        const response = await apiClient.post<Recipe>('/recipes/', formData, {
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        return response.data;
      }

      const response = await apiClient.post<Recipe>('/recipes/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Send recipe FormData via XHR (native only, for FormData + ngrok compatibility)
   */
  private sendRecipeFormData(method: 'POST' | 'PATCH', urlPath: string, formData: FormData): Promise<Recipe> {
    const url = `${apiClient.defaults.baseURL}${urlPath}`;
    return new Promise<Recipe>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, true);
      xhr.timeout = 120000;

      tokenStorage.getAccessToken().then((token) => {
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new APIError('Failed to parse response', xhr.status));
            }
          } else {
            try {
              const errData = JSON.parse(xhr.responseText);
              const msg = (errData.detail || errData.message || errData.error) ?? `Request failed with status ${xhr.status}`;
              reject(new APIError(typeof msg === 'string' ? msg : JSON.stringify(msg), xhr.status));
            } catch {
              reject(new APIError(`Request failed with status ${xhr.status}`, xhr.status));
            }
          }
        };

        xhr.onerror = () => {
          reject(new APIError('Network error', 0));
        };
        xhr.ontimeout = () => {
          reject(new APIError('Request timeout', 0));
        };

        xhr.send(formData as any);
      }).catch((tokenError) => {
        reject(new APIError('Failed to get authentication token', 0));
      });
    });
  }

  /**
   * Update a recipe
   */
  async updateRecipe(id: number, data: UpdateRecipeData): Promise<Recipe> {
    try {
      if (data.image || data.clear_image) {
        const formData = new FormData();
        if (data.title !== undefined) formData.append('title', data.title);
        if (data.notes !== undefined) formData.append('notes', data.notes);
        if (data.ingredients !== undefined) formData.append('ingredients', JSON.stringify(data.ingredients));
        if (data.instructions !== undefined) formData.append('instructions', JSON.stringify(data.instructions));
        if (data.servings !== undefined) formData.append('servings', String(data.servings));
        if (data.prep_time_minutes !== undefined) formData.append('prep_time_minutes', String(data.prep_time_minutes));
        if (data.cook_time_minutes !== undefined) formData.append('cook_time_minutes', String(data.cook_time_minutes));
        if (data.image_url !== undefined) formData.append('image_url', data.image_url);
        if (data.source_url !== undefined) formData.append('source_url', data.source_url);
        if (data.clear_image) {
          formData.append('clear_image', 'true');
        } else if (data.image) {
          await appendRecipeImage(formData, 'image', data.image);
        }

        if (Platform.OS !== 'web') {
          return await this.sendRecipeFormData('PATCH', `/recipes/${id}/`, formData);
        }
        const response = await apiClient.patch<Recipe>(`/recipes/${id}/`, formData, {
          timeout: 120000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        });
        return response.data;
      }

      const response = await apiClient.patch<Recipe>(`/recipes/${id}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Delete a recipe
   */
  async deleteRecipe(id: number): Promise<void> {
    try {
      await apiClient.delete(`/recipes/${id}/`);
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Import a recipe from URL
   */
  async importRecipe(url: string, familyId: number): Promise<Recipe> {
    try {
      const response = await apiClient.post<Recipe>('/recipes/import/', {
        url,
        family: familyId,
      });
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Add recipe ingredients to a shopping list
   */
  async addRecipeToList(recipeId: number, listId: number): Promise<AddToListResponse> {
    try {
      const response = await apiClient.post<AddToListResponse>(`/recipes/${recipeId}/add-to-list/`, {
        list_id: listId,
      });
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Fetch all meal plans for a family
   */
  async fetchMealPlans(familyId: number): Promise<MealPlan[]> {
    try {
      const response = await apiClient.get<{ results?: MealPlan[] } | MealPlan[]>('/meal-plans/', {
        params: { family: familyId },
      });
      const data = response.data;
      return Array.isArray(data) ? data : data.results || [];
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Fetch a single meal plan by ID
   */
  async fetchMealPlan(id: number): Promise<MealPlan> {
    try {
      const response = await apiClient.get<MealPlan>(`/meal-plans/${id}/`);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Create a new meal plan
   */
  async createMealPlan(data: CreateMealPlanData): Promise<MealPlan> {
    try {
      const response = await apiClient.post<MealPlan>('/meal-plans/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Update a meal plan
   */
  async updateMealPlan(id: number, data: UpdateMealPlanData): Promise<MealPlan> {
    try {
      const response = await apiClient.patch<MealPlan>(`/meal-plans/${id}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Delete a meal plan
   */
  async deleteMealPlan(id: number): Promise<void> {
    try {
      await apiClient.delete(`/meal-plans/${id}/`);
    } catch (error) {
      throw handleAPIError(error);
    }
  }
}

export default new MealsService();

