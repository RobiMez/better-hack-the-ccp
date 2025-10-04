import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';
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
} from './calendar-utils';

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
 * Find free time for all participants
 */
async function findFreeTime(authClients: any[], duration: number, days: number = 7) {
  try {
    const events = await getMultiUserCalendarEvents(authClients);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    const availableTime = findFirstAvailableTime(events, duration, new Date(), endDate);
    
    if (!availableTime) {
      return {
        success: false,
        message: `No available time found for ${duration} minutes in the next ${days} days.`,
        availableTime: null
      };
    }
    
    return {
      success: true,
      message: `Found available time: ${availableTime.startTime.toLocaleString()} to ${availableTime.endTime.toLocaleString()}`,
      availableTime: {
        startTime: availableTime.startTime.toISOString(),
        endTime: availableTime.endTime.toISOString(),
        duration: duration
      }
    };
  } catch (error) {
    return {
      success: false,
      message: `Error finding free time: ${error}`,
      availableTime: null
    };
  }
}

/**
 * Schedule an event for all participants
 */
async function scheduleEvent(authClients: any[], friends: any[], title: string, description: string = '', duration: number) {
  try {
    const events = await getMultiUserCalendarEvents(authClients);
    const availableTime = findFirstAvailableTime(events, duration);
    
    if (!availableTime) {
      return {
        success: false,
        message: 'No available time found for all participants.',
        eventId: null
      };
    }
    
    const createdEvents = [];
    for (let i = 0; i < authClients.length; i++) {
      try {
        const calendarId = await getPrimaryCalendarId(authClients[i]);
        const event = await createCalendarEvent(authClients[i], {
          summary: title,
          description: description,
          startTime: availableTime.startTime,
          endTime: availableTime.endTime,
          calendarId: calendarId,
        });
        
        createdEvents.push({
          user: friends[i].name,
          eventId: event.id,
          calendarId: calendarId
        });
      } catch (error) {
        console.error(`Failed to create event for ${friends[i].name}:`, error);
      }
    }
    
    if (createdEvents.length > 0) {
      return {
        success: true,
        message: `Successfully scheduled "${title}" for ${createdEvents.length} participants`,
        eventId: createdEvents[0].eventId,
        startTime: availableTime.startTime.toISOString(),
        endTime: availableTime.endTime.toISOString(),
        participants: createdEvents.map(e => e.user)
      };
    } else {
      return {
        success: false,
        message: 'Failed to create events for any participants.',
        eventId: null
      };
    }
  } catch (error) {
    return {
      success: false,
      message: `Error scheduling event: ${error}`,
      eventId: null
    };
  }
}

/**
 * Get calendar context for AI
 */
async function getCalendarContext(authClients: any[]): Promise<string> {
  try {
    const events = await getMultiUserCalendarEvents(authClients);
    return formatIndividualFreeTimeForAI(events);
  } catch (error) {
    return `Error loading calendar data: ${error}`;
  }
}

// SvelteKit API Endpoints

/**
 * GET /api/ai - Get AI chat response with calendar context
 */
export const GET: RequestHandler = async ({ url }: { url: URL }) => {
  try {
    const message = url.searchParams.get('message');
    if (!message) {
      return json({ error: 'Message parameter is required' }, { status: 400 });
    }

    const authResult = await initializeAuth();
    if (!authResult.success) {
      return json({ error: authResult.message }, { status: 400 });
    }

    const calendarContext = await getCalendarContext(authResult.clients);
    
    const result = await generateText({
      model: google('gemini-2.5-flash'),
      system: `You are a friendly, helpful AI assistant with calendar superpowers. You chat naturally but ACTUALLY execute calendar actions when needed.

IMPORTANT RULES:
1. Chat naturally about any topic
2. When user wants to schedule/book/create event → provide scheduling options
3. When user wants to find free time/availability → provide free time information
4. Be helpful and informative about calendar scheduling

Calendar data available:
${calendarContext}`,
      prompt: `User: ${message}\nAssistant:`,
    });

    return json({
      response: result.text,
      calendarContext: calendarContext
    });
  } catch (error) {
    console.error('Error in AI chat:', error);
    return json({ error: 'Failed to process AI request' }, { status: 500 });
  }
};

/**
 * POST /api/ai - Find free time for all participants
 */
export const POST: RequestHandler = async ({ request }: { request: Request }) => {
  try {
    const { action, duration, days, title, description } = await request.json();
    
    const authResult = await initializeAuth();
    if (!authResult.success) {
      return json({ error: authResult.message }, { status: 400 });
    }

    if (action === 'findFreeTime') {
      const result = await findFreeTime(authResult.clients!, duration || 60, days || 7);
      return json(result);
    }
    
    if (action === 'scheduleEvent') {
      if (!title || !duration) {
        return json({ error: 'Title and duration are required for scheduling' }, { status: 400 });
      }
      const result = await scheduleEvent(authResult.clients!, authResult.friends!, title, description || '', duration);
      return json(result);
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Error in AI API:', error);
    return json({ error: 'Failed to process request' }, { status: 500 });
  }
};
