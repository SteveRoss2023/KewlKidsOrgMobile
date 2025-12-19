import api from './api';

export interface Event {
  id: number;
  family: number;
  created_by?: number;
  created_by_username?: string;
  title: string;
  notes?: string;
  location?: string;
  starts_at: string;
  ends_at?: string;
  is_all_day: boolean;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface CreateEventData {
  family: number;
  title: string;
  notes?: string;
  location?: string;
  starts_at: string;
  ends_at?: string;
  is_all_day?: boolean;
  color?: string;
}

export interface UpdateEventData extends Partial<CreateEventData> {
  id: number;
}

class CalendarService {
  /**
   * Get all events for a family
   */
  async getEvents(familyId: number): Promise<Event[]> {
    try {
      const response = await api.get<{ results?: Event[] } | Event[]>('/events/', {
        params: { family: familyId },
      });

      let events: Event[] = [];
      if (Array.isArray(response.data)) {
        events = response.data;
      } else if (response.data.results) {
        events = response.data.results;
        // Handle pagination if needed
        let nextUrl = (response.data as any).next;
        while (nextUrl) {
          try {
            let path = nextUrl;
            if (nextUrl.startsWith('http://') || nextUrl.startsWith('https://')) {
              const url = new URL(nextUrl);
              path = url.pathname + url.search;
              if (path.startsWith('/api')) {
                path = path.substring(4);
              }
            }
            if (!path.startsWith('/')) {
              path = '/' + path;
            }
            const nextResponse = await api.get<{ results?: Event[] } | Event[]>(path);
            const nextEvents = Array.isArray(nextResponse.data)
              ? nextResponse.data
              : (nextResponse.data.results || []);
            events = [...events, ...nextEvents];
            nextUrl = (nextResponse.data as any).next;
          } catch (err) {
            console.error('Error fetching next page:', err);
            break;
          }
        }
      }

      return events;
    } catch (error: any) {
      console.error('Error fetching events:', error);
      throw new Error(error.response?.data?.detail || 'Failed to load events');
    }
  }

  /**
   * Get a single event by ID
   */
  async getEvent(eventId: number): Promise<Event> {
    try {
      const response = await api.get<Event>(`/events/${eventId}/`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching event:', error);
      throw new Error(error.response?.data?.detail || 'Failed to load event');
    }
  }

  /**
   * Create a new event
   */
  async createEvent(data: CreateEventData): Promise<Event> {
    try {
      const response = await api.post<Event>('/events/', data);
      return response.data;
    } catch (error: any) {
      console.error('Error creating event:', error);
      throw new Error(
        error.response?.data?.detail ||
        error.response?.data?.title?.[0] ||
        'Failed to create event'
      );
    }
  }

  /**
   * Update an existing event
   */
  async updateEvent(eventId: number, data: Partial<CreateEventData>): Promise<Event> {
    try {
      const response = await api.put<Event>(`/events/${eventId}/`, data);
      return response.data;
    } catch (error: any) {
      console.error('Error updating event:', error);
      throw new Error(
        error.response?.data?.detail ||
        'Failed to update event'
      );
    }
  }

  /**
   * Delete an event
   */
  async deleteEvent(eventId: number): Promise<void> {
    try {
      await api.delete(`/events/${eventId}/`);
    } catch (error: any) {
      console.error('Error deleting event:', error);
      throw new Error(error.response?.data?.detail || 'Failed to delete event');
    }
  }
}

export default new CalendarService();


