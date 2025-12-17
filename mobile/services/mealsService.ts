import apiClient, { handleAPIError, APIError } from './api';

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
      const response = await apiClient.post<Recipe>('/recipes/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error);
    }
  }

  /**
   * Update a recipe
   */
  async updateRecipe(id: number, data: UpdateRecipeData): Promise<Recipe> {
    try {
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
