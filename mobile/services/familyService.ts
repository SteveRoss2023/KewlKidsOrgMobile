import apiClient, { APIError, handleAPIError } from './api';

/**
 * Family data interface
 */
export interface Family {
  id: number;
  name: string;
  color: string;
  owner: number;
  owner_email: string;
  created_at: string;
  updated_at: string;
  members?: Member[];
  member_count?: number;
}

/**
 * Member data interface
 */
export interface Member {
  id: number;
  family: number;
  family_name: string;
  user: number;
  user_email: string;
  user_display_name: string;
  role: 'owner' | 'admin' | 'member' | 'child';
  joined_at: string;
  is_active: boolean;
}

/**
 * Invitation data interface
 */
export interface Invitation {
  id: number;
  family: number;
  family_name: string;
  email: string;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  role: 'owner' | 'admin' | 'member' | 'child';
  invited_by: number;
  invited_by_email: string;
  created_at: string;
  expires_at: string;
  accepted_at?: string;
}

/**
 * Create family data
 */
export interface CreateFamilyData {
  name: string;
  color?: string;
}

/**
 * Invite member data
 */
export interface InviteMemberData {
  email: string;
  role?: 'owner' | 'admin' | 'member' | 'child';
}

/**
 * Add member data
 */
export interface AddMemberData {
  email: string;
  role?: 'owner' | 'admin' | 'member' | 'child';
}

/**
 * Family Service
 */
class FamilyService {
  /**
   * Get all families for the current user
   */
  async getFamilies(): Promise<Family[]> {
    try {
      const response = await apiClient.get('/families/');
      // Ensure we return an array
      if (Array.isArray(response.data)) {
        return response.data;
      }
      // If response.data is an object with results (pagination), return results
      if (response.data && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      // If it's a single object, wrap it in an array
      if (response.data && typeof response.data === 'object') {
        return [response.data];
      }
      // Default to empty array
      console.warn('Unexpected API response format:', response.data);
      return [];
    } catch (error) {
      console.error('Error fetching families:', error);
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get a specific family by ID
   */
  async getFamily(familyId: number): Promise<Family> {
    try {
      const response = await apiClient.get<Family>(`/families/${familyId}/`);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Create a new family
   */
  async createFamily(data: CreateFamilyData): Promise<Family> {
    try {
      const response = await apiClient.post<Family>('/families/', data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update a family
   */
  async updateFamily(familyId: number, data: Partial<CreateFamilyData>): Promise<Family> {
    try {
      const response = await apiClient.put<Family>(`/families/${familyId}/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Delete a family
   */
  async deleteFamily(familyId: number): Promise<void> {
    try {
      await apiClient.delete(`/families/${familyId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get members of a family
   */
  async getFamilyMembers(familyId: number): Promise<Member[]> {
    try {
      const response = await apiClient.get<Member[]>(`/families/${familyId}/members/`);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Invite a member to a family
   */
  async inviteMember(familyId: number, data: InviteMemberData): Promise<Invitation> {
    try {
      const response = await apiClient.post<Invitation>(`/families/${familyId}/invite_member/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Add an existing user to a family
   */
  async addMember(familyId: number, data: AddMemberData): Promise<Member> {
    try {
      const response = await apiClient.post<Member>(`/families/${familyId}/add_member/`, data);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get invitations for the current user
   */
  async getInvitations(): Promise<Invitation[]> {
    try {
      const response = await apiClient.get<Invitation[]>('/invitations/');
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Accept an invitation
   */
  async acceptInvitation(invitationId: number): Promise<Invitation> {
    try {
      const response = await apiClient.post<Invitation>(`/invitations/${invitationId}/accept/`);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Get family invitations (admin only)
   */
  async getFamilyInvitations(familyId: number): Promise<Invitation[]> {
    try {
      const response = await apiClient.get<Invitation[]>(`/families/${familyId}/invitations/`);
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Cancel an invitation
   */
  async cancelInvitation(invitationId: number): Promise<void> {
    try {
      await apiClient.post(`/invitations/${invitationId}/cancel/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Remove a member from a family
   */
  async removeMember(familyId: number, memberId: number): Promise<void> {
    try {
      await apiClient.delete(`/families/${familyId}/members/${memberId}/`);
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }

  /**
   * Update a member's role
   */
  async updateMemberRole(familyId: number, memberId: number, role: 'admin' | 'member' | 'child'): Promise<Member> {
    try {
      const response = await apiClient.patch<Member>(`/families/${familyId}/members/${memberId}/`, { role });
      return response.data;
    } catch (error) {
      throw handleAPIError(error as any);
    }
  }
}

export default new FamilyService();

