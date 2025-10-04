import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

/**
 * Create and configure OAuth2 client
 */
export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env file');
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Get authorization URL for OAuth flow
 */
export function getAuthUrl(oauth2Client: OAuth2Client): string {
  const scopes = ['https://www.googleapis.com/auth/calendar.readonly'];
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
  });
}

/**
 * Get all calendars for the user
 */
export async function getAllCalendars(oauth2Client: OAuth2Client) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const response = await calendar.calendarList.list();
  return response.data.items || [];
}

/**
 * Fetch calendar events from all calendars for the next 7 days
 */
export async function getCalendarEvents(oauth2Client: OAuth2Client) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const now = new Date();
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(now.getDate() + 7);

  // Get all calendars
  const calendars = await getAllCalendars(oauth2Client);
  console.log(`Found ${calendars.length} calendars`);

  // Fetch events from all calendars
  const allEvents = [];
  for (const cal of calendars) {
    try {
      const response = await calendar.events.list({
        calendarId: cal.id!,
        timeMin: now.toISOString(),
        timeMax: sevenDaysLater.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];
      // Add calendar name and owner info to each event for context
      events.forEach((event: any) => {
        event.calendarName = cal.summary;
        event.calendarOwner = cal.summary; // This represents the person
        event.calendarId = cal.id;
      });
      allEvents.push(...events);
    } catch (error) {
      console.warn(`Could not fetch events from calendar ${cal.summary}:`, error);
    }
  }

  // Sort all events by start time
  allEvents.sort((a, b) => {
    const aStart = new Date(a.start?.dateTime || a.start?.date || 0);
    const bStart = new Date(b.start?.dateTime || b.start?.date || 0);
    return aStart.getTime() - bStart.getTime();
  });

  return allEvents;
}

/**
 * Fetch calendar events from multiple OAuth clients (multiple people)
 */
export async function getMultiUserCalendarEvents(oauth2Clients: OAuth2Client[]) {
  const now = new Date();
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(now.getDate() + 7);

  const allEvents = [];
  
  for (let i = 0; i < oauth2Clients.length; i++) {
    const oauth2Client = oauth2Clients[i];
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    try {
      // Get all calendars for this user
      const calendars = await getAllCalendars(oauth2Client);
      console.log(`User ${i + 1}: Found ${calendars.length} calendars`);

      // Fetch events from all calendars for this user
      for (const cal of calendars) {
        try {
          const response = await calendar.events.list({
            calendarId: cal.id!,
            timeMin: now.toISOString(),
            timeMax: sevenDaysLater.toISOString(),
            singleEvents: true,
            orderBy: 'startTime',
          });

          const events = response.data.items || [];
          // Add user and calendar info to each event
          events.forEach((event: any) => {
            event.calendarName = cal.summary;
            event.calendarOwner = cal.summary; // Person's name
            event.calendarId = cal.id;
            event.userIndex = i + 1; // Track which user this belongs to
          });
          allEvents.push(...events);
        } catch (error) {
          console.warn(`Could not fetch events from calendar ${cal.summary} for user ${i + 1}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Could not fetch calendars for user ${i + 1}:`, error);
    }
  }

  // Sort all events by start time
  allEvents.sort((a, b) => {
    const aStart = new Date(a.start?.dateTime || a.start?.date || 0);
    const bStart = new Date(b.start?.dateTime || b.start?.date || 0);
    return aStart.getTime() - bStart.getTime();
  });

  return allEvents;
}

/**
 * Format events for AI analysis
 */
export function formatEventsForAI(events: any[]): string {
  const now = new Date();
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(now.getDate() + 7);

  let output = `I have calendar events from ${now.toLocaleDateString()} to ${sevenDaysLater.toLocaleDateString()}.\n\n`;
  output += 'Here are all scheduled events:\n\n';

  if (events.length === 0) {
    output += 'No events scheduled.\n';
  } else {
    // Group events by person/owner
    const eventsByPerson = events.reduce((acc, event) => {
      const owner = event.calendarOwner || 'Unknown';
      if (!acc[owner]) {
        acc[owner] = [];
      }
      acc[owner].push(event);
      return acc;
    }, {} as Record<string, any[]>);

    // Format events grouped by person
    for (const [person, personEvents] of Object.entries(eventsByPerson)) {
      output += `=== ${person} ===\n`;
      
      for (const event of personEvents as any[]) {
        const startTime = event.start?.dateTime || event.start?.date;
        const endTime = event.end?.dateTime || event.end?.date;
        
        if (startTime && endTime) {
          const start = new Date(startTime);
          const end = new Date(endTime);
          
          output += `- ${event.summary || 'Untitled Event'}\n`;
          output += `  Calendar: ${event.calendarName || 'Unknown'}\n`;
          output += `  Start: ${start.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n`;
          output += `  End: ${end.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n\n`;
        }
      }
      output += '\n';
    }
  }

  return output;
}

/**
 * Format events for multi-user AI analysis with focus on finding common free time
 */
export function formatMultiUserEventsForAI(events: any[]): string {
  const now = new Date();
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(now.getDate() + 7);

  // Get unique people
  const people = [...new Set(events.map(event => event.calendarOwner).filter(Boolean))];
  
  let output = `I have calendar events for ${people.length} people from ${now.toLocaleDateString()} to ${sevenDaysLater.toLocaleDateString()}.\n\n`;
  output += `People involved: ${people.join(', ')}\n\n`;
  output += 'Here are all scheduled events by person:\n\n';

  if (events.length === 0) {
    output += 'No events scheduled for any of the people.\n';
  } else {
    // Group events by person/owner
    const eventsByPerson = events.reduce((acc, event) => {
      const owner = event.calendarOwner || 'Unknown';
      if (!acc[owner]) {
        acc[owner] = [];
      }
      acc[owner].push(event);
      return acc;
    }, {} as Record<string, any[]>);

    // Format events grouped by person
    for (const [person, personEvents] of Object.entries(eventsByPerson)) {
      output += `=== ${person} ===\n`;
      
      for (const event of personEvents as any[]) {
        const startTime = event.start?.dateTime || event.start?.date;
        const endTime = event.end?.dateTime || event.end?.date;
        
        if (startTime && endTime) {
          const start = new Date(startTime);
          const end = new Date(endTime);
          
          output += `- ${event.summary || 'Untitled Event'}\n`;
          output += `  Calendar: ${event.calendarName || 'Unknown'}\n`;
          output += `  Start: ${start.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n`;
          output += `  End: ${end.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n\n`;
        }
      }
      output += '\n';
    }
  }

  return output;
}

/**
 * Format events for individual free time analysis (shows each person's free time separately)
 */
export function formatIndividualFreeTimeForAI(events: any[]): string {
  const now = new Date();
  const sevenDaysLater = new Date(now);
  sevenDaysLater.setDate(now.getDate() + 7);

  // Get unique people
  const people = [...new Set(events.map(event => event.calendarOwner).filter(Boolean))];
  
  let output = `I have calendar events for ${people.length} people from ${now.toLocaleDateString()} to ${sevenDaysLater.toLocaleDateString()}.\n\n`;
  output += `People involved: ${people.join(', ')}\n\n`;
  output += 'Here are all scheduled events by person:\n\n';

  if (events.length === 0) {
    output += 'No events scheduled for any of the people.\n';
  } else {
    // Group events by person/owner
    const eventsByPerson = events.reduce((acc, event) => {
      const owner = event.calendarOwner || 'Unknown';
      if (!acc[owner]) {
        acc[owner] = [];
      }
      acc[owner].push(event);
      return acc;
    }, {} as Record<string, any[]>);

    // Format events grouped by person
    for (const [person, personEvents] of Object.entries(eventsByPerson)) {
      output += `=== ${person} ===\n`;
      
      for (const event of personEvents as any[]) {
        const startTime = event.start?.dateTime || event.start?.date;
        const endTime = event.end?.dateTime || event.end?.date;
        
        if (startTime && endTime) {
          const start = new Date(startTime);
          const end = new Date(endTime);
          
          output += `- ${event.summary || 'Untitled Event'}\n`;
          output += `  Calendar: ${event.calendarName || 'Unknown'}\n`;
          output += `  Start: ${start.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n`;
          output += `  End: ${end.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n\n`;
        }
      }
      output += '\n';
    }
  }

  return output;
}