import { auth } from '$lib/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	try {
		// Get user and session data
		const user = locals.user;
		const session = locals.session;

		// Get Google Calendar access token (this automatically handles refresh)
		const response = await auth.api.getAccessToken({
			body: {
				providerId: 'google',
				userId: user.id
			}
		});

		const { accessToken } = response;
		
		// Set up time range for busy time query (next 7 days)
		const calendarId = 'primary';
		const timeMin = new Date().toISOString();
		const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days window

		// Query Google Calendar API for busy times
		const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				timeMin,
				timeMax,
				items: [{ id: calendarId }]
			})
		});

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
		const events = busyTimes.busy?.map((busyPeriod: any, index: number) => {
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
