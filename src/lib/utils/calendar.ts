/**
 * Calendar utilities using pure auth tokens instead of OAuth2Client
 */

export interface CalendarEvent {
	id?: string;
	summary?: string;
	description?: string;
	start?: {
		dateTime?: string;
		date?: string;
	};
	end?: {
		dateTime?: string;
		date?: string;
	};
	calendarName?: string;
	calendarOwner?: string;
	calendarId?: string;
	userIndex?: number;
}

export interface Calendar {
	id?: string;
	summary?: string;
	description?: string;
	primary?: boolean;
}

/**
 * Get all calendars for the user using access token
 */
export async function getAllCalendars(accessToken: string): Promise<Calendar[]> {
	const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch calendars: ${response.statusText}`);
	}

	const data = await response.json();
	return data.items || [];
}

/**
 * Fetch calendar events from multiple access tokens (multiple people)
 */
export async function getMultiUserCalendarEvents(accessTokens: string[]): Promise<CalendarEvent[]> {
	const now = new Date();
	const sevenDaysLater = new Date(now);
	sevenDaysLater.setDate(now.getDate() + 7);

	const allEvents: CalendarEvent[] = [];

	for (let i = 0; i < accessTokens.length; i++) {
		const accessToken = accessTokens[i];

		try {
			// Get all calendars for this user
			const calendars = await getAllCalendars(accessToken);
			console.log(`User ${i + 1}: Found ${calendars.length} calendars`);

			// Fetch events from all calendars for this user
			for (const cal of calendars) {
				try {
					const params = new URLSearchParams({
						timeMin: now.toISOString(),
						timeMax: sevenDaysLater.toISOString(),
						singleEvents: 'true',
						orderBy: 'startTime'
					});

					const response = await fetch(
						`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id!)}/events?${params}`,
						{
							headers: {
								Authorization: `Bearer ${accessToken}`,
								'Content-Type': 'application/json'
							}
						}
					);

					if (!response.ok) {
						console.warn(
							`Failed to fetch events from calendar ${cal.summary} for user ${i + 1}: ${response.statusText}`
						);
						continue;
					}

					const data = await response.json();
					const events = data.items || [];

					// Add user and calendar info to each event
					events.forEach((event: CalendarEvent) => {
						event.calendarName = cal.summary;
						event.calendarOwner = cal.summary;
						event.calendarId = cal.id;
						event.userIndex = i + 1;
					});

					allEvents.push(...events);
				} catch (error) {
					console.warn(
						`Could not fetch events from calendar ${cal.summary} for user ${i + 1}:`,
						error
					);
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
 * Format events for multi-user AI analysis with focus on finding common free time
 */
export function formatMultiUserEventsForAI(events: CalendarEvent[]): string {
	const now = new Date();
	const sevenDaysLater = new Date(now);
	sevenDaysLater.setDate(now.getDate() + 7);

	// Get unique people
	const people = [...new Set(events.map((event) => event.calendarOwner).filter(Boolean))];

	let output = `I have calendar events for ${people.length} people from ${now.toLocaleDateString()} to ${sevenDaysLater.toLocaleDateString()}.\n\n`;
	output += `People involved: ${people.join(', ')}\n\n`;
	output += 'Here are all scheduled events by person:\n\n';

	if (events.length === 0) {
		output += 'No events scheduled for any of the people.\n';
	} else {
		// Group events by person/owner
		const eventsByPerson = events.reduce(
			(acc, event) => {
				const owner = event.calendarOwner || 'Unknown';
				if (!acc[owner]) {
					acc[owner] = [];
				}
				acc[owner].push(event);
				return acc;
			},
			{} as Record<string, CalendarEvent[]>
		);

		// Format events grouped by person
		for (const [person, personEvents] of Object.entries(eventsByPerson)) {
			output += `=== ${person} ===\n`;

			for (const event of personEvents) {
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
export function formatIndividualFreeTimeForAI(events: CalendarEvent[]): string {
	const now = new Date();
	const sevenDaysLater = new Date(now);
	sevenDaysLater.setDate(now.getDate() + 7);

	// Get unique people
	const people = [...new Set(events.map((event) => event.calendarOwner).filter(Boolean))];

	let output = `I have calendar events for ${people.length} people from ${now.toLocaleDateString()} to ${sevenDaysLater.toLocaleDateString()}.\n\n`;
	output += `People involved: ${people.join(', ')}\n\n`;
	output += 'Here are all scheduled events by person:\n\n';

	if (events.length === 0) {
		output += 'No events scheduled for any of the people.\n';
	} else {
		// Group events by person/owner
		const eventsByPerson = events.reduce(
			(acc, event) => {
				const owner = event.calendarOwner || 'Unknown';
				if (!acc[owner]) {
					acc[owner] = [];
				}
				acc[owner].push(event);
				return acc;
			},
			{} as Record<string, CalendarEvent[]>
		);

		// Format events grouped by person
		for (const [person, personEvents] of Object.entries(eventsByPerson)) {
			output += `=== ${person} ===\n`;

			for (const event of personEvents) {
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
 * Create a calendar event using access token
 */
export async function createCalendarEvent(
	accessToken: string,
	eventDetails: {
		summary: string;
		description?: string;
		startTime: Date;
		endTime: Date;
		attendees?: string[];
		calendarId?: string;
	}
) {
	const event = {
		summary: eventDetails.summary,
		description: eventDetails.description || '',
		start: {
			dateTime: eventDetails.startTime.toISOString(),
			timeZone: 'UTC'
		},
		end: {
			dateTime: eventDetails.endTime.toISOString(),
			timeZone: 'UTC'
		},
		attendees: eventDetails.attendees?.map((email) => ({ email })) || []
	};

	const response = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(eventDetails.calendarId || 'primary')}/events`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(event)
		}
	);

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(
			`Failed to create event: ${response.statusText} - ${JSON.stringify(errorData)}`
		);
	}

	return await response.json();
}

/**
 * Find the first available time slot for all participants
 */
export function findFirstAvailableTime(
	events: CalendarEvent[],
	durationMinutes = 60,
	startFrom: Date = new Date(),
	endAt: Date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
): { startTime: Date; endTime: Date } | null {
	// Get all unique participants
	const participants = [...new Set(events.map((event) => event.calendarOwner).filter(Boolean))];

	if (participants.length === 0) {
		return null;
	}

	// Group events by participant
	const eventsByParticipant = events.reduce(
		(acc, event) => {
			const owner = event.calendarOwner || 'Unknown';
			if (!acc[owner]) {
				acc[owner] = [];
			}
			acc[owner].push(event);
			return acc;
		},
		{} as Record<string, CalendarEvent[]>
	);

	// Create a timeline of all busy periods
	const busyPeriods: { start: Date; end: Date }[] = [];

	for (const participant of participants) {
		const participantEvents = eventsByParticipant[participant as string] || [];

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
 * Get the primary calendar ID for a user using access token
 */
export async function getPrimaryCalendarId(accessToken: string): Promise<string> {
	try {
		const response = await fetch(
			'https://www.googleapis.com/calendar/v3/users/me/calendarList/primary',
			{
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				}
			}
		);

		if (!response.ok) {
			console.warn('Could not get primary calendar ID, using "primary" as fallback');
			return 'primary';
		}

		const data = await response.json();
		return data.id || 'primary';
	} catch (error) {
		console.warn('Could not get primary calendar ID, using "primary" as fallback');
		return 'primary';
	}
}
