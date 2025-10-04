import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  createOAuth2Client,
  getAuthUrl,
  getMultiUserCalendarEvents,
  formatIndividualFreeTimeForAI,
  createCalendarEvent,
  findFirstAvailableTime,
  getPrimaryCalendarId,
  loadFriendsConfig,
  loadFriends,
} from '../ai/calendar-utils';

/**
 * Initialize authentication and load friends for API requests
 */
async function initializeAuth() {
  try {
    const config = await loadFriendsConfig();
    if (config.friends.length === 0) {
      return { success: false, message: 'No friends configured yet' };
    }

    const { clients, friends: friendsList } = await loadFriends();
    return { 
      success: true, 
      clients, 
      friends: friendsList,
      message: `Loaded ${friendsList.length} friends: ${friendsList.map((f: any) => f.name).join(', ')}`
    };
  } catch (error) {
    return { success: false, message: `Error loading friends: ${error}` };
  }
}

/**
 * GET /api/calendar - Get calendar events for all participants
 */
export const GET: RequestHandler = async ({ url }: { url: URL }) => {
  try {
    const authResult = await initializeAuth();
    if (!authResult.success) {
      return json({ error: authResult.message }, { status: 400 });
    }

    const events = await getMultiUserCalendarEvents(authResult.clients!);
    const formattedEvents = formatIndividualFreeTimeForAI(events);

    return json({
      success: true,
      events: events,
      formattedEvents: formattedEvents,
      participants: authResult.friends!.map((f: any) => f.name)
    });
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return json({ error: 'Failed to fetch calendar events' }, { status: 500 });
  }
};

/**
 * POST /api/calendar - Find free time or schedule events
 */
export const POST: RequestHandler = async ({ request }: { request: Request }) => {
  try {
    const { action, duration, days, title, description, attendees, location } = await request.json();
    
    const authResult = await initializeAuth();
    if (!authResult.success) {
      return json({ error: authResult.message }, { status: 400 });
    }

    if (action === 'findFreeTime') {
      const events = await getMultiUserCalendarEvents(authResult.clients!);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + (days || 7));
      const availableTime = findFirstAvailableTime(events, duration || 60, new Date(), endDate);
      
      if (!availableTime) {
        return json({
          success: false,
          message: `No available time found for ${duration || 60} minutes in the next ${days || 7} days.`,
          availableTime: null
        });
      }
      
      return json({
        success: true,
        message: `Found available time: ${availableTime.startTime.toLocaleString()} to ${availableTime.endTime.toLocaleString()}`,
        availableTime: {
          startTime: availableTime.startTime.toISOString(),
          endTime: availableTime.endTime.toISOString(),
          duration: duration || 60
        }
      });
    }
    
    if (action === 'scheduleEvent') {
      if (!title || !duration) {
        return json({ error: 'Title and duration are required for scheduling' }, { status: 400 });
      }

      const events = await getMultiUserCalendarEvents(authResult.clients!);
      const availableTime = findFirstAvailableTime(events, duration);
      
      if (!availableTime) {
        return json({
          success: false,
          message: 'No available time found for all participants.',
          eventId: null
        });
      }
      
      const createdEvents = [];
      for (let i = 0; i < authResult.clients!.length; i++) {
        try {
          const calendarId = await getPrimaryCalendarId(authResult.clients![i]);
          const event = await createCalendarEvent(authResult.clients![i], {
            summary: title,
            description: description || '',
            startTime: availableTime.startTime,
            endTime: availableTime.endTime,
            attendees: attendees || [],
            calendarId: calendarId,
          });
          
          createdEvents.push({
            user: authResult.friends![i].name,
            eventId: event.id,
            calendarId: calendarId
          });
        } catch (error) {
          console.error(`Failed to create event for ${authResult.friends![i].name}:`, error);
        }
      }
      
      if (createdEvents.length > 0) {
        return json({
          success: true,
          message: `Successfully scheduled "${title}" for ${createdEvents.length} participants`,
          eventId: createdEvents[0].eventId,
          startTime: availableTime.startTime.toISOString(),
          endTime: availableTime.endTime.toISOString(),
          participants: createdEvents.map(e => e.user)
        });
      } else {
        return json({
          success: false,
          message: 'Failed to create events for any participants.',
          eventId: null
        });
      }
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in calendar API:', error);
    return json({ error: 'Failed to process calendar request' }, { status: 500 });
  }
};
