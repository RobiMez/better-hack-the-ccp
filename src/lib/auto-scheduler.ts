import { Event } from './models';
import { auth } from './auth';
import { getMultiUserCalendarEvents, findFirstAvailableTime, createCalendarEvent, getPrimaryCalendarId } from './utils/calendar';

interface PreferredTimeSlot {
	email: string;
	date: string;
	time: string;
	notes: string;
}

/**
 * Check if all accepted invites have set their preferred times
 */
export async function checkIfReadyToSchedule(eventId: string): Promise<boolean> {
	const event = await Event.findById(eventId);
	if (!event) return false;

	const acceptedInvites = event.inviteList?.filter((inv: any) => inv.status === 'accepted') || [];
	
	// Check if all accepted invites have preferred times
	return acceptedInvites.every((inv: any) => inv.preferredTime && inv.preferredTime.date);
}

/**
 * Get access tokens for all accepted invites using Better Auth API
 */
async function getInviteAccessTokens(eventId: string): Promise<{ email: string; accessToken: string; userId: string }[]> {
	const event = await Event.findById(eventId);
	if (!event) return [];

	const acceptedInvites = event.inviteList?.filter((inv: any) => inv.status === 'accepted') || [];
	const tokens: { email: string; accessToken: string; userId: string }[] = [];

	for (const invite of acceptedInvites) {
		try {
			// Use invite.userId if available
			if (invite.userId) {
				// Get access token using Better Auth API (handles token refresh automatically)
				const tokenResponse = await auth.api.getAccessToken({
					body: {
						providerId: 'google',
						userId: invite.userId.toString()
					}
				});

				if (tokenResponse?.accessToken) {
					tokens.push({
						email: invite.email,
						accessToken: tokenResponse.accessToken,
						userId: invite.userId.toString()
					});
					console.log(`Got token for ${invite.email}`);
				} else {
					console.log(`No token available for ${invite.email}`);
				}
			} else {
				console.log(`No userId linked for ${invite.email}`);
			}
		} catch (error) {
			console.error(`Failed to get token for ${invite.email}:`, error);
		}
	}

	return tokens;
}

/**
 * Parse preferred time to get approximate time window
 */
function parsePreferredTime(preferredTime: { date: string; time: string }): { preferredDays: string[]; timeWindow: { start: number; end: number } } {
	const { date, time } = preferredTime;
	
	// Parse days (Tuesday, next week, etc.)
	const preferredDays: string[] = [];
	const lowerDate = date.toLowerCase();
	
	const daysMap = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
	daysMap.forEach((day, index) => {
		if (lowerDate.includes(day)) {
			preferredDays.push(day);
		}
	});

	// Parse time window
	let timeWindow = { start: 9, end: 17 }; // Default 9am-5pm
	
	const lowerTime = time.toLowerCase();
	if (lowerTime.includes('morning')) {
		timeWindow = { start: 9, end: 12 };
	} else if (lowerTime.includes('afternoon')) {
		timeWindow = { start: 13, end: 17 };
	} else if (lowerTime.includes('evening')) {
		timeWindow = { start: 17, end: 20 };
	} else if (lowerTime.includes('night')) {
		timeWindow = { start: 19, end: 22 };
	}

	// Try to parse specific times like "2pm", "14:00"
	const timeMatch = lowerTime.match(/(\d+)\s*(am|pm|:)/);
	if (timeMatch) {
		let hour = parseInt(timeMatch[1]);
		if (timeMatch[2] === 'pm' && hour < 12) hour += 12;
		if (timeMatch[2] === 'am' && hour === 12) hour = 0;
		timeWindow = { start: hour, end: hour + 2 }; // 2-hour window
	}

	return { preferredDays, timeWindow };
}

/**
 * Find the best time that accommodates everyone's availability and preferences
 */
export async function findBestTimeForAll(eventId: string, duration: number = 60): Promise<{ startTime: Date; endTime: Date } | null> {
	console.log('Finding best time for all participants...');
	
	const event = await Event.findById(eventId);
	if (!event) {
		console.error('Event not found');
		return null;
	}

	// Get access tokens for all accepted invites
	const tokens = await getInviteAccessTokens(eventId);
	console.log(`Got ${tokens.length} access tokens`);

	if (tokens.length === 0) {
		console.error('No access tokens available');
		return null;
	}

	// Get everyone's calendar events
	const accessTokens = tokens.map(t => t.accessToken);
	const allCalendarEvents = await getMultiUserCalendarEvents(accessTokens);
	console.log(`Got ${allCalendarEvents.length} calendar events`);

	// Get preferred times
	const acceptedInvites = event.inviteList?.filter((inv: any) => inv.status === 'accepted') || [];
	const preferences = acceptedInvites
		.filter((inv: any) => inv.preferredTime)
		.map((inv: any) => ({
			email: inv.email,
			...parsePreferredTime(inv.preferredTime)
		}));

	console.log('Preferences:', preferences);

	// Find available time in the next 30 days
	const startDate = new Date();
	const endDate = new Date();
	endDate.setDate(endDate.getDate() + 30);

	// Try to find a slot that matches preferences
	let bestSlot = null;
	let currentDate = new Date(startDate);

	while (currentDate < endDate && !bestSlot) {
		// Check each hour of the day
		for (let hour = 8; hour < 20; hour++) {
			const slotStart = new Date(currentDate);
			slotStart.setHours(hour, 0, 0, 0);
			
			const slotEnd = new Date(slotStart);
			slotEnd.setMinutes(slotEnd.getMinutes() + duration);

			// Check if this slot is free for everyone
			const isFree = !allCalendarEvents.some(event => {
				if (!event.start || !event.end) return false;
				const eventStart = new Date(event.start.dateTime || event.start.date || '');
				const eventEnd = new Date(event.end.dateTime || event.end.date || '');
				return slotStart < eventEnd && slotEnd > eventStart;
			});

			if (isFree) {
				// Check if it matches preferences
				const dayName = slotStart.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
				const matchesPreferences = preferences.every((pref: any) => {
					// Check day preference
					const dayMatch = pref.preferredDays.length === 0 || pref.preferredDays.includes(dayName);
					// Check time preference
					const timeMatch = hour >= pref.timeWindow.start && hour < pref.timeWindow.end;
					return dayMatch && timeMatch;
				});

				if (matchesPreferences) {
					bestSlot = { startTime: slotStart, endTime: slotEnd };
					break;
				}
			}
		}

		currentDate.setDate(currentDate.getDate() + 1);
	}

	// Fallback: if no perfect match, just find any free time
	if (!bestSlot) {
		console.log('No perfect match found, finding any available time...');
		bestSlot = findFirstAvailableTime(allCalendarEvents, duration, startDate, endDate);
	}

	return bestSlot;
}

/**
 * Automatically schedule the event for everyone
 */
export async function autoScheduleEvent(eventId: string): Promise<boolean> {
	console.log('Auto-scheduling event:', eventId);

	// Check if ready
	const ready = await checkIfReadyToSchedule(eventId);
	if (!ready) {
		console.log('Not all invites have set their preferred times yet');
		return false;
	}

	const event = await Event.findById(eventId);
	if (!event) return false;

	// Find best time
	const estimatedDuration = Math.floor((new Date(event.bounds.end).getTime() - new Date(event.bounds.start).getTime()) / (1000 * 60));
	const bestTime = await findBestTimeForAll(eventId, estimatedDuration);

	if (!bestTime) {
		console.error('Could not find a suitable time for everyone');
		return false;
	}

	console.log('Best time found:', bestTime);

	// Get tokens and create calendar events
	const tokens = await getInviteAccessTokens(eventId);
	
	let successCount = 0;
	for (const token of tokens) {
		try {
			const calendarId = await getPrimaryCalendarId(token.accessToken);
			await createCalendarEvent(token.accessToken, {
				summary: event.name,
				description: event.description || 'Event scheduled via Better Hack the CCP',
				startTime: bestTime.startTime,
				endTime: bestTime.endTime,
				calendarId: calendarId,
				attendees: tokens.map(t => t.email)
			});
			
			console.log(`Created event for ${token.email}`);
			successCount++;
		} catch (error) {
			console.error(`Failed to create event for ${token.email}:`, error);
		}
	}

	// Update event with final scheduled time
	event.bounds.start = bestTime.startTime;
	event.bounds.end = bestTime.endTime;
	event.locked = true; // Lock the event time
	await event.save();

	console.log(`Successfully scheduled for ${successCount}/${tokens.length} participants`);
	return successCount > 0;
}

