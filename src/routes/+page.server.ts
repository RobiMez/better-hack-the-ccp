import { auth } from '$lib/auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, request }) => {
	// const account = await auth.api.listUserAccounts({ request: request });
	console.log(locals);

	const response = await auth.api.getAccessToken({
		body: {
			providerId: 'google', // Replace with your provider ID
			userId: locals.user.id // Replace with the user ID if not using session
		}
	});

	const { accessToken } = response;
	console.log('Access Token:', accessToken);

	const calendarId = 'primary';
	const timeMin = new Date().toISOString();
	const timeMax = new Date(Date.now() + 2004 * 60 * 60 * 1000).toISOString(); // 24h window

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
		throw new Error(`Google API Error ${res.status}: ${text}`);
	}

	const data = await res.json();

	const busyTimes = data.calendars[calendarId]

	console.log(busyTimes);
	return {
		busyTimes
	};
};
