import { google } from 'googleapis'; // Import the Google APIs client library
import { OAuth2Client } from 'google-auth-library'; // Import the OAuth2 client from Google's auth library

/**
 * Create and configure OAuth2 client
 */
export function createOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID; // Get the Google client ID from environment variables
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET; // Get the Google client secret from environment variables
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'; // Get the redirect URI or use default

  if (!clientId || !clientSecret) { // Check if client ID or secret are missing
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env file'); // Throw error if missing
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri); // Create and return a new OAuth2 client
}

/**
 * Get authorization URL for OAuth flow
 */
export function getAuthUrl(oauth2Client: OAuth2Client): string {
  const scopes = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events'
  ]; // Define the required scopes for calendar read and write access
  
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Request offline access to get a refresh token
    scope: scopes, // Set the scopes for the auth URL
  }); // Generate and return the authorization URL
}

/**
 * Get all calendars for the user
 */
export async function getAllCalendars(oauth2Client: OAuth2Client) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client }); // Create a Google Calendar API client with the OAuth2 client
  const response = await calendar.calendarList.list(); // Fetch the list of calendars for the user
  return response.data.items || []; // Return the array of calendar items, or an empty array if none
}


/**
 * Fetch calendar events from multiple OAuth clients (multiple people)
 */
export async function getMultiUserCalendarEvents(oauth2Clients: OAuth2Client[]) {
  const now = new Date(); // Get the current date and time
  const sevenDaysLater = new Date(now); // Clone the current date
  sevenDaysLater.setDate(now.getDate() + 7); // Set the date to 7 days in the future

  const allEvents = []; // Initialize an array to hold all events from all users

  for (let i = 0; i < oauth2Clients.length; i++) { // Loop through each OAuth2 client (user)
    const oauth2Client = oauth2Clients[i]; // Get the OAuth2 client for this user
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client }); // Create a Google Calendar API client for this user

    try {
      // Get all calendars for this user
      const calendars = await getAllCalendars(oauth2Client); // Fetch all calendars for this user
      console.log(`User ${i + 1}: Found ${calendars.length} calendars`); // Log the number of calendars for this user

      // Fetch events from all calendars for this user
      for (const cal of calendars) { // Loop through each calendar for this user
        try {
          const response = await calendar.events.list({
            calendarId: cal.id!, // Use the calendar's ID
            timeMin: now.toISOString(), // Set the minimum time to now
            timeMax: sevenDaysLater.toISOString(), // Set the maximum time to 7 days from now
            singleEvents: true, // Expand recurring events into single events
            orderBy: 'startTime', // Order events by start time
          });

          const events = response.data.items || []; // Get the events from the response, or an empty array
          // Add user and calendar info to each event
          events.forEach((event: any) => {
            event.calendarName = cal.summary; // Set the calendar name on the event
            event.calendarOwner = cal.summary; // Set the calendar owner (person) on the event
            event.calendarId = cal.id; // Set the calendar ID on the event
            event.userIndex = i + 1; // Track which user this event belongs to
          });
          allEvents.push(...events); // Add all events from this calendar to the allEvents array
        } catch (error) {
          console.warn(`Could not fetch events from calendar ${cal.summary} for user ${i + 1}:`, error); // Warn if events could not be fetched for this calendar/user
        }
      }
    } catch (error) {
      console.warn(`Could not fetch calendars for user ${i + 1}:`, error); // Warn if calendars could not be fetched for this user
    }
  }

  // Sort all events by start time
  allEvents.sort((a, b) => {
    const aStart = new Date(a.start?.dateTime || a.start?.date || 0); // Get the start time of event a
    const bStart = new Date(b.start?.dateTime || b.start?.date || 0); // Get the start time of event b
    return aStart.getTime() - bStart.getTime(); // Sort by ascending start time
  });

  return allEvents; // Return the sorted array of all events from all users
}


/**
 * Format events for multi-user AI analysis with focus on finding common free time
 */
export function formatMultiUserEventsForAI(events: any[]): string {
  const now = new Date(); // Get the current date and time
  const sevenDaysLater = new Date(now); // Clone the current date
  sevenDaysLater.setDate(now.getDate() + 7); // Set the date to 7 days in the future

  // Get unique people
  const people = [...new Set(events.map(event => event.calendarOwner).filter(Boolean))]; // Create an array of unique people (owners) from the events

  let output = `I have calendar events for ${people.length} people from ${now.toLocaleDateString()} to ${sevenDaysLater.toLocaleDateString()}.\n\n`; // Start the output string with the number of people and date range
  output += `People involved: ${people.join(', ')}\n\n`; // List the people involved
  output += 'Here are all scheduled events by person:\n\n'; // Add a header for the events

  if (events.length === 0) { // If there are no events
    output += 'No events scheduled for any of the people.\n'; // Indicate that there are no events
  } else {
    // Group events by person/owner
    const eventsByPerson = events.reduce((acc, event) => {
      const owner = event.calendarOwner || 'Unknown'; // Get the owner of the event, or 'Unknown'
      if (!acc[owner]) { // If this owner is not yet in the accumulator
        acc[owner] = []; // Initialize an array for this owner
      }
      acc[owner].push(event); // Add the event to the owner's array
      return acc; // Return the accumulator for the next iteration
    }, {} as Record<string, any[]>); // Start with an empty object

    // Format events grouped by person
    for (const [person, personEvents] of Object.entries(eventsByPerson)) { // Loop through each person and their events
      output += `=== ${person} ===\n`; // Add a header for this person

      for (const event of personEvents as any[]) { // Loop through each event for this person
        const startTime = event.start?.dateTime || event.start?.date; // Get the event's start time (dateTime or date)
        const endTime = event.end?.dateTime || event.end?.date; // Get the event's end time (dateTime or date)

        if (startTime && endTime) { // If both start and end times exist
          const start = new Date(startTime); // Create a Date object for the start time
          const end = new Date(endTime); // Create a Date object for the end time

          output += `- ${event.summary || 'Untitled Event'}\n`; // Add the event summary or 'Untitled Event'
          output += `  Calendar: ${event.calendarName || 'Unknown'}\n`; // Add the calendar name or 'Unknown'
          output += `  Start: ${start.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n`; // Format and add the start time
          output += `  End: ${end.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n\n`; // Format and add the end time
        }
      }
      output += '\n'; // Add a blank line after each person's events
    }
  }

  return output; // Return the formatted output string
}

/**
 * Format events for individual free time analysis (shows each person's free time separately)
 */
export function formatIndividualFreeTimeForAI(events: any[]): string {
  const now = new Date(); // Get the current date and time
  const sevenDaysLater = new Date(now); // Clone the current date
  sevenDaysLater.setDate(now.getDate() + 7); // Set the date to 7 days in the future

  // Get unique people
  const people = [...new Set(events.map(event => event.calendarOwner).filter(Boolean))]; // Create an array of unique people (owners) from the events

  let output = `I have calendar events for ${people.length} people from ${now.toLocaleDateString()} to ${sevenDaysLater.toLocaleDateString()}.\n\n`; // Start the output string with the number of people and date range
  output += `People involved: ${people.join(', ')}\n\n`; // List the people involved
  output += 'Here are all scheduled events by person:\n\n'; // Add a header for the events

  if (events.length === 0) { // If there are no events
    output += 'No events scheduled for any of the people.\n'; // Indicate that there are no events
  } else {
    // Group events by person/owner
    const eventsByPerson = events.reduce((acc, event) => {
      const owner = event.calendarOwner || 'Unknown'; // Get the owner of the event, or 'Unknown'
      if (!acc[owner]) { // If this owner is not yet in the accumulator
        acc[owner] = []; // Initialize an array for this owner
      }
      acc[owner].push(event); // Add the event to the owner's array
      return acc; // Return the accumulator for the next iteration
    }, {} as Record<string, any[]>); // Start with an empty object

    // Format events grouped by person
    for (const [person, personEvents] of Object.entries(eventsByPerson)) { // Loop through each person and their events
      output += `=== ${person} ===\n`; // Add a header for this person

      for (const event of personEvents as any[]) { // Loop through each event for this person
        const startTime = event.start?.dateTime || event.start?.date; // Get the event's start time (dateTime or date)
        const endTime = event.end?.dateTime || event.end?.date; // Get the event's end time (dateTime or date)

        if (startTime && endTime) { // If both start and end times exist
          const start = new Date(startTime); // Create a Date object for the start time
          const end = new Date(endTime); // Create a Date object for the end time

          output += `- ${event.summary || 'Untitled Event'}\n`; // Add the event summary or 'Untitled Event'
          output += `  Calendar: ${event.calendarName || 'Unknown'}\n`; // Add the calendar name or 'Unknown'
          output += `  Start: ${start.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n`; // Format and add the start time
          output += `  End: ${end.toLocaleString('en-US', { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric', 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          })}\n\n`; // Format and add the end time
        }
      }
      output += '\n'; // Add a blank line after each person's events
    }
  }

  return output; // Return the formatted output string
}

/**
 * Create a calendar event
 */
export async function createCalendarEvent(
  oauth2Client: OAuth2Client,
  eventDetails: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendees?: string[];
    calendarId?: string;
  }
) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const event = {
    summary: eventDetails.summary,
    description: eventDetails.description || '',
    start: {
      dateTime: eventDetails.startTime.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: eventDetails.endTime.toISOString(),
      timeZone: 'UTC',
    },
    attendees: eventDetails.attendees?.map(email => ({ email })) || [],
  };

  try {
    const response = await calendar.events.insert({
      calendarId: eventDetails.calendarId || 'primary',
      requestBody: event,
    });
    
    return response.data;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
}

/**
 * Find the first available time slot for all participants
 */
export function findFirstAvailableTime(
  events: any[],
  durationMinutes: number = 60,
  startFrom: Date = new Date(),
  endAt: Date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
): { startTime: Date; endTime: Date } | null {
  // Get all unique participants
  const participants = [...new Set(events.map(event => event.calendarOwner).filter(Boolean))];
  
  if (participants.length === 0) {
    return null;
  }

  // Group events by participant
  const eventsByParticipant = events.reduce((acc, event) => {
    const owner = event.calendarOwner || 'Unknown';
    if (!acc[owner]) {
      acc[owner] = [];
    }
    acc[owner].push(event);
    return acc;
  }, {} as Record<string, any[]>);

  // Create a timeline of all busy periods
  const busyPeriods: { start: Date; end: Date }[] = [];
  
  for (const participant of participants) {
    const participantEvents = eventsByParticipant[participant] || [];
    
    for (const event of participantEvents) {
      const startTime = event.start?.dateTime || event.start?.date;
      const endTime = event.end?.dateTime || event.end?.date;
      
      if (startTime && endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        
        // Only consider events that overlap with our search window
        if (end > startFrom && start < endAt) {
          busyPeriods.push({
            start: new Date(Math.max(start.getTime(), startFrom.getTime())),
            end: new Date(Math.min(end.getTime(), endAt.getTime()))
          });
        }
      }
    }
  }

  // Sort busy periods by start time
  busyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());

  // Merge overlapping busy periods
  const mergedBusyPeriods: { start: Date; end: Date }[] = [];
  for (const period of busyPeriods) {
    if (mergedBusyPeriods.length === 0) {
      mergedBusyPeriods.push(period);
    } else {
      const lastPeriod = mergedBusyPeriods[mergedBusyPeriods.length - 1];
      if (period.start <= lastPeriod.end) {
        // Overlapping periods, merge them
        lastPeriod.end = new Date(Math.max(lastPeriod.end.getTime(), period.end.getTime()));
      } else {
        // Non-overlapping, add as new period
        mergedBusyPeriods.push(period);
      }
    }
  }

  // Find the first gap that's long enough
  let currentTime = new Date(startFrom);
  
  for (const busyPeriod of mergedBusyPeriods) {
    const gapStart = currentTime;
    const gapEnd = busyPeriod.start;
    const gapDuration = gapEnd.getTime() - gapStart.getTime();
    
    if (gapDuration >= durationMinutes * 60 * 1000) {
      // Found a gap that's long enough
      return {
        startTime: gapStart,
        endTime: new Date(gapStart.getTime() + durationMinutes * 60 * 1000)
      };
    }
    
    // Move to after this busy period
    currentTime = new Date(busyPeriod.end);
  }
  
  // Check if there's time after the last busy period
  const finalGapDuration = endAt.getTime() - currentTime.getTime();
  if (finalGapDuration >= durationMinutes * 60 * 1000) {
    return {
      startTime: currentTime,
      endTime: new Date(currentTime.getTime() + durationMinutes * 60 * 1000)
    };
  }
  
  return null; // No available time found
}

/**
 * Get the primary calendar ID for a user
 */
export async function getPrimaryCalendarId(oauth2Client: OAuth2Client): Promise<string> {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  try {
    const response = await calendar.calendarList.get({
      calendarId: 'primary'
    });
    return response.data.id || 'primary';
  } catch (error) {
    console.warn('Could not get primary calendar ID, using "primary" as fallback');
    return 'primary';
  }
}