import type { PageServerLoad } from './$types';
import { Event } from '$lib/models.js';
import { connectDB } from '$lib/db.js';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		await connectDB();

		const events = await Event.find({})
			.populate('organizerId', 'name email')
			.populate('rsvpList', 'name email')
			.sort({ createdAt: -1 })
			.limit(50);

		console.log(events);

		return {
			events: JSON.parse(JSON.stringify(events)),
			user: locals.user // Pass user data to the frontend
		};
	} catch (error) {
		console.error('Error fetching events:', error);
		return {
			events: [],
			user: locals.user,
			error: 'Failed to fetch events'
		};
	}
};
