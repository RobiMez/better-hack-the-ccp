import type { PageServerLoad } from './$types';
import { Event } from '$lib/models.js';
import { TimeSlotPreference } from '$lib/models/time-slot-preference.model.js';
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

		// Fetch time slot preferences for each event
		const eventsWithPreferences = await Promise.all(
			events.map(async (event) => {
				const preferences = await TimeSlotPreference.find({ eventId: event._id })
					.sort({ createdAt: -1 })
					.lean();
				
				return {
					...event.toObject(),
					timeSlotPreferences: preferences
				};
			})
		);

		return {
			events: JSON.parse(JSON.stringify(eventsWithPreferences)),
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
