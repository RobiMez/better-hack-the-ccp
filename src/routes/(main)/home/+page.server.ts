import { auth } from '$lib/auth';
import type { PageServerLoad } from './$types';
import { connectDB } from '$lib/db';
import { Event } from '$lib/models/event.model';

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
			console.log(refreshResponse)

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

export const load: PageServerLoad = async ({ locals, request }) => {
	try {
		// Get user and session data
		const user = locals.user;
		const session = locals.session;
		
		// Set up time range for busy time query (next 7 days)
		const calendarId = 'primary';
		const timeMin = new Date().toISOString();
		const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days window

		// Query Google Calendar API for busy times with automatic token refresh
		const res = await makeGoogleAPICall(
			'https://www.googleapis.com/calendar/v3/freeBusy',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					timeMin,
					timeMax,
					items: [{ id: calendarId }]
				})
			},
			user.id,
			1,
			request
		);

		if (!res.ok) {
			const text = await res.text();
			console.error(`Google API Error ${res.status}: ${text}`);
			return {
				user,
				session,
				events: [],
				error: 'Failed to fetch calendar data'
			};
		}

		const data = await res.json();
		const busyTimes = data.calendars[calendarId];

		// Transform busy times into EventCalendar event format
		const busyEvents = busyTimes.busy?.map((busyPeriod: { start: string; end: string }, index: number) => {
			// Parse the Google Calendar datetime strings properly
			const startDate = new Date(busyPeriod.start);
			const endDate = new Date(busyPeriod.end);
			
			console.log(`Event ${index}:`, {
				originalStart: busyPeriod.start,
				originalEnd: busyPeriod.end,
				parsedStart: startDate,
				parsedEnd: endDate,
				isToday: startDate.toDateString() === new Date().toDateString()
			});
			
			return {
				id: `busy-${index}`,
				title: 'Busy Time',
				start: startDate,
				end: endDate,
				display: 'auto',
				backgroundColor: '#ffcccc',
				textColor: '#cc0000',
				editable: false,
				extendedProps: {
					type: 'busy-time',
					originalStart: busyPeriod.start,
					originalEnd: busyPeriod.end
				}
			};
		}) || [];

		// Fetch user's events from database
		await connectDB();
		const userEvents = await Event.find({ organizerId: user.id }).lean();

		// Transform user events into EventCalendar format
		const calendarEvents = userEvents.map((event) => {
			const eventData = event as unknown as { _id: { toString: () => string }; name: string; bounds: { start: Date; end: Date }; description?: string; status: string; eventType: string };
			return {
				id: eventData._id.toString(),
				title: eventData.name,
				start: new Date(eventData.bounds.start),
				end: new Date(eventData.bounds.end),
				display: 'auto',
				backgroundColor: '#99ccff',
				textColor: '#003366',
				editable: false,
				extendedProps: {
					type: 'user-event',
					description: eventData.description,
					status: eventData.status,
					eventType: eventData.eventType
				}
			};
		});

		// Combine busy times and user events
		const events = [...busyEvents, ...calendarEvents];

		console.log('Transformed events:', events);

		return {
			user,
			session,
			events
		};
	} catch (error) {
		console.error('Error fetching data at /home:', error);
		return {
			user: locals.user,
			session: locals.session,
			events: [],
			error: 'Failed to fetch calendar data'
		};
	}
};
