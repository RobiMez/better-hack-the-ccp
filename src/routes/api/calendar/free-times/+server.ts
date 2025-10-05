import { auth } from '$lib/auth';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findFirstAvailableTime } from '$lib/utils/calendar.js';
import { Event } from '$lib/models.js';
import { User } from '$lib/models/better-auth/user.model.js';
import { Account } from '$lib/models/better-auth/account.model.js';
import { connectDB } from '$lib/db.js';

interface ConflictInfo {
	start: Date;
	end: Date;
	conflictingParticipants: string[];
}

interface AvailabilitySlot {
	start: string;
	end: string;
	duration: number;
	conflicts?: ConflictInfo[];
}

// Function to find available time slots with conflict information
function findAvailabilityWithConflicts(
	allParticipantEvents: any[],
	participantEmails: string[],
	startTime: Date,
	endTime: Date,
	durations: number[] = [30, 60, 90, 120]
): AvailabilitySlot[] {
	const slots: AvailabilitySlot[] = [];
	
	// Group events by participant email
	const eventsByParticipant: Record<string, any[]> = {};
	participantEmails.forEach(email => {
		eventsByParticipant[email] = allParticipantEvents.filter(event => event.calendarOwner === email);
	});
	
	for (const duration of durations) {
		let currentStart = new Date(startTime);
		const endWindow = new Date(endTime);
		
		while (currentStart.getTime() + duration * 60 * 1000 <= endWindow.getTime()) {
			const slotEnd = new Date(currentStart.getTime() + duration * 60 * 1000);
			
			// Check for conflicts in this time slot
			const conflicts: ConflictInfo[] = [];
			
			for (const email of participantEmails) {
				const participantEvents = eventsByParticipant[email] || [];
				const conflictingEvents = participantEvents.filter(event => {
					const eventStart = new Date(event.start?.dateTime || event.start?.date);
					const eventEnd = new Date(event.end?.dateTime || event.end?.date);
					
					// Check if event overlaps with our proposed slot
					return eventStart < slotEnd && eventEnd > currentStart;
				});
				
				if (conflictingEvents.length > 0) {
					// Find the overlapping time period
					for (const conflictEvent of conflictingEvents) {
						const eventStart = new Date(conflictEvent.start?.dateTime || conflictEvent.start?.date);
						const eventEnd = new Date(conflictEvent.end?.dateTime || conflictEvent.end?.date);
						
						const conflictStart = new Date(Math.max(currentStart.getTime(), eventStart.getTime()));
						const conflictEnd = new Date(Math.min(slotEnd.getTime(), eventEnd.getTime()));
						
						// Check if we already have a conflict for this time period
						const existingConflict = conflicts.find(c => 
							c.start.getTime() === conflictStart.getTime() && 
							c.end.getTime() === conflictEnd.getTime()
						);
						
						if (existingConflict) {
							// Add participant to existing conflict
							if (!existingConflict.conflictingParticipants.includes(email)) {
								existingConflict.conflictingParticipants.push(email);
							}
						} else {
							// Create new conflict
							conflicts.push({
								start: conflictStart,
								end: conflictEnd,
								conflictingParticipants: [email]
							});
						}
					}
				}
			}
			
			// If no conflicts, this is a fully available slot
			if (conflicts.length === 0) {
				slots.push({
					start: currentStart.toISOString(),
					end: slotEnd.toISOString(),
					duration,
					conflicts: []
				});
				
				// Move to next potential slot after this one
				currentStart = new Date(slotEnd.getTime() + 15 * 60 * 1000); // 15 minutes after
				break; // Found a slot for this duration, move to next duration
			} else {
				// Move to next time slot (15 minutes forward)
				currentStart = new Date(currentStart.getTime() + 15 * 60 * 1000);
			}
		}
	}
	
	return slots;
}

// Function to find partial availability (slots with some conflicts)
function findPartialAvailability(
	allParticipantEvents: any[],
	participantEmails: string[],
	startTime: Date,
	endTime: Date,
	durations: number[] = [30, 60, 90, 120]
): AvailabilitySlot[] {
	const slots: AvailabilitySlot[] = [];
	
	// Group events by participant email
	const eventsByParticipant: Record<string, any[]> = {};
	participantEmails.forEach(email => {
		eventsByParticipant[email] = allParticipantEvents.filter(event => event.calendarOwner === email);
	});
	
	for (const duration of durations) {
		let currentStart = new Date(startTime);
		const endWindow = new Date(endTime);
		
		while (currentStart.getTime() + duration * 60 * 1000 <= endWindow.getTime()) {
			const slotEnd = new Date(currentStart.getTime() + duration * 60 * 1000);
			
			// Check for conflicts in this time slot
			const conflicts: ConflictInfo[] = [];
			
			for (const email of participantEmails) {
				const participantEvents = eventsByParticipant[email] || [];
				const conflictingEvents = participantEvents.filter(event => {
					const eventStart = new Date(event.start?.dateTime || event.start?.date);
					const eventEnd = new Date(event.end?.dateTime || event.end?.date);
					
					// Check if event overlaps with our proposed slot
					return eventStart < slotEnd && eventEnd > currentStart;
				});
				
				if (conflictingEvents.length > 0) {
					// Find the overlapping time period
					for (const conflictEvent of conflictingEvents) {
						const eventStart = new Date(conflictEvent.start?.dateTime || conflictEvent.start?.date);
						const eventEnd = new Date(conflictEvent.end?.dateTime || conflictEvent.end?.date);
						
						const conflictStart = new Date(Math.max(currentStart.getTime(), eventStart.getTime()));
						const conflictEnd = new Date(Math.min(slotEnd.getTime(), eventEnd.getTime()));
						
						// Check if we already have a conflict for this time period
						const existingConflict = conflicts.find(c => 
							c.start.getTime() === conflictStart.getTime() && 
							c.end.getTime() === conflictEnd.getTime()
						);
						
						if (existingConflict) {
							// Add participant to existing conflict
							if (!existingConflict.conflictingParticipants.includes(email)) {
								existingConflict.conflictingParticipants.push(email);
							}
						} else {
							// Create new conflict
							conflicts.push({
								start: conflictStart,
								end: conflictEnd,
								conflictingParticipants: [email]
							});
						}
					}
				}
			}
			
			// Include slots with conflicts (partial availability)
			// Prioritize slots with fewer conflicts
			if (conflicts.length > 0 && conflicts.length < participantEmails.length) {
				slots.push({
					start: currentStart.toISOString(),
					end: slotEnd.toISOString(),
					duration,
					conflicts
				});
			}
			
			// Move to next time slot (30 minutes forward for partial availability)
			currentStart = new Date(currentStart.getTime() + 30 * 60 * 1000);
		}
	}
	
	// Sort by fewest conflicts first, then by duration
	return slots.sort((a, b) => {
		const aConflicts = a.conflicts?.length || 0;
		const bConflicts = b.conflicts?.length || 0;
		if (aConflicts !== bConflicts) {
			return aConflicts - bConflicts;
		}
		return b.duration - a.duration; // Prefer longer durations
	}).slice(0, 5); // Return top 5 options
}

// Helper function to make Google API calls with automatic token refresh
async function makeGoogleAPICall(url: string, options: RequestInit, userId: string, maxRetries = 1, request: Request): Promise<Response> {
	let accessToken;
	
	// Get initial access token
	try {
		const tokenResponse = await auth.api.getAccessToken({
			body: {
				providerId: 'google',
				userId: userId
			},
			headers: request.headers
		});
		accessToken = tokenResponse.accessToken;
	} catch (error) {
		console.error('Failed to get access token:', error);
		throw new Error('Failed to get access token');
	}

	// Make the API call
	const requestOptions = {
		...options,
		headers: {
			...options.headers,
			Authorization: `Bearer ${accessToken}`
		}
	};

	let response = await fetch(url, requestOptions);

	// If we get a 401, try to refresh the token and retry
	if (response.status === 401 && maxRetries > 0) {
		console.log('Got 401, attempting to refresh token...');
		
		try {
			// Refresh the token
			const refreshResponse = await auth.api.refreshToken({
				body: {
					providerId: 'google',
					userId: userId
				}
			});
			console.log('Token refresh response:', refreshResponse);

			// Get the new access token
			const newTokenResponse = await auth.api.getAccessToken({
				body: {
					providerId: 'google',
					userId: userId
				},
				headers: request.headers
			});

			// Retry the API call with the new token
			const retryOptions = {
				...options,
				headers: {
					...options.headers,
					Authorization: `Bearer ${newTokenResponse.accessToken}`
				}
			};

			response = await fetch(url, retryOptions);
			console.log('Token refreshed and API call retried');
			
		} catch (refreshError) {
			console.error('Failed to refresh token:', refreshError);
			// Return the original 401 response if refresh fails
		}
	}

	return response;
}

export const GET: RequestHandler = async ({ locals, request, url }) => {
	try {
		const user = locals.user;
		const session = locals.session;

		if (!user || !session) {
			return json({ error: 'Not authenticated' }, { status: 401 });
		}

		// Get event ID from query params
		const eventId = url.searchParams.get('eventId');
		if (!eventId) {
			return json({ error: 'Event ID is required' }, { status: 400 });
		}

		await connectDB();

		// Fetch the event with populated organizer and RSVP details
		const event = await Event.findById(eventId).populate('organizerId', 'name email');
		
		if (!event) {
			return json({ error: 'Event not found' }, { status: 404 });
		}

		// Use event bounds as the time range
		const startTime = new Date(event.bounds.start);
		const endTime = new Date(event.bounds.end);

		console.log(`Analyzing free time for event "${event.name}" from ${startTime.toISOString()} to ${endTime.toISOString()}`);

		// Collect all participant emails (host + accepted RSVPs)
		const participantEmails = [event.organizerId.email];
		
		// Add accepted RSVP emails
		if (event.inviteList) {
			const acceptedInvites = event.inviteList.filter((invite: { status: string }) => invite.status === 'accepted');
			participantEmails.push(...acceptedInvites.map((invite: { email: string }) => invite.email));
		}

		console.log(`Found ${participantEmails.length} participants:`, participantEmails);

		// Get User documents for all participants
		const participants = await User.find({ 
			email: { $in: participantEmails } 
		});

		console.log(`Found ${participants.length} user records`);

		// Get access tokens for all participants
		const participantTokens: Array<{ email: string; accessToken: string; userId: string }> = [];
		
		for (const participant of participants) {
			try {
				// Find the account for this user with Google provider
				const account = await Account.findOne({ 
					userId: participant._id,
					providerId: 'google'
				});

				if (account && account.accessToken) {
					participantTokens.push({
						email: participant.email,
						accessToken: account.accessToken,
						userId: participant.id
					});
					console.log(`✅ Found access token for ${participant.email}`);
				} else {
					console.warn(`⚠️ No Google account/token found for ${participant.email}`);
				}
			} catch (error) {
				console.error(`Error getting token for ${participant.email}:`, error);
			}
		}

		if (participantTokens.length === 0) {
			return json({ 
				error: 'No calendar access available for any participants',
				details: 'Participants need to grant calendar access'
			}, { status: 400 });
		}

		console.log(`Got ${participantTokens.length} access tokens out of ${participantEmails.length} participants`);

		// Fetch calendar events for all participants
		const allParticipantEvents: Array<{
			calendarName?: string;
			calendarOwner?: string;
			calendarId?: string;
			participantEmail?: string;
			start?: { dateTime?: string; date?: string };
			end?: { dateTime?: string; date?: string };
		}> = [];

		for (const participant of participantTokens) {
			try {
				console.log(`Fetching calendars for ${participant.email}...`);

				// Get all calendars for this participant
				const calendarsResponse = await makeGoogleAPICall(
					'https://www.googleapis.com/calendar/v3/users/me/calendarList',
					{
						method: 'GET',
						headers: {
							'Content-Type': 'application/json'
						}
					},
					participant.userId,
					1,
					request
				);

				if (!calendarsResponse.ok) {
					console.warn(`Failed to fetch calendars for ${participant.email}: ${calendarsResponse.statusText}`);
					continue;
				}

				const calendarsData = await calendarsResponse.json();
				const calendars = calendarsData.items || [];
				console.log(`Found ${calendars.length} calendars for ${participant.email}`);

				// Fetch events from all calendars for this participant
				for (const cal of calendars) {
					try {
						const params = new URLSearchParams({
							timeMin: startTime.toISOString(),
							timeMax: endTime.toISOString(),
							singleEvents: 'true',
							orderBy: 'startTime'
						});

						const eventsResponse = await makeGoogleAPICall(
							`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
							{
								method: 'GET',
								headers: {
									'Content-Type': 'application/json'
								}
							},
							participant.userId,
							1,
							request
						);

						if (!eventsResponse.ok) {
							console.warn(`Failed to fetch events from calendar ${cal.summary} for ${participant.email}: ${eventsResponse.statusText}`);
							continue;
						}

						const eventsData = await eventsResponse.json();
						const events = eventsData.items || [];

						// Add participant info to each event
						events.forEach((event: { calendarName?: string; calendarOwner?: string; calendarId?: string; participantEmail?: string }) => {
							event.calendarName = cal.summary;
							event.calendarOwner = participant.email;
							event.calendarId = cal.id;
							event.participantEmail = participant.email;
						});

						allParticipantEvents.push(...events);
					} catch (error) {
						console.warn(`Could not fetch events from calendar ${cal.summary} for ${participant.email}:`, error);
					}
				}
			} catch (error) {
				console.error(`Error processing participant ${participant.email}:`, error);
			}
		}

		// Sort all events by start time
		allParticipantEvents.sort((a, b) => {
			const aStart = new Date(a.start?.dateTime || a.start?.date || 0);
			const bStart = new Date(b.start?.dateTime || b.start?.date || 0);
			return aStart.getTime() - bStart.getTime();
		});

		console.log(`Found ${allParticipantEvents.length} total events across all participants`);

		// First, try to find fully available slots (no conflicts)
		const availableSlots = findAvailabilityWithConflicts(
			allParticipantEvents,
			participantEmails,
			startTime,
			endTime
		);

		// If no fully available slots, also provide partial availability analysis
		let partialAvailability: AvailabilitySlot[] = [];
		if (availableSlots.length === 0) {
			// Find slots with minimal conflicts (partial availability)
			partialAvailability = findPartialAvailability(
				allParticipantEvents,
				participantEmails,
				startTime,
				endTime
			);
		}

		return json({
			success: true,
			freeTimeSlots: availableSlots,
			partialAvailability: partialAvailability,
			eventDetails: {
				name: event.name,
				bounds: {
					start: event.bounds.start,
					end: event.bounds.end
				}
			},
			participants: participantEmails,
			participantsWithCalendarAccess: participantTokens.map(p => p.email),
			totalEvents: allParticipantEvents.length
		});

	} catch (error) {
		console.error('Error fetching multi-user free times:', error);
		return json({ 
			error: 'Failed to fetch calendar data',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
