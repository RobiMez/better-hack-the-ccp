import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Event } from '$lib/models.js';
import { connectDB } from '$lib/db.js';

// GET - Fetch a single event by ID
export const GET: RequestHandler = async ({ params }) => {
	try {
		await connectDB();
		
		const event = await Event.findById(params.id)
			.populate('organizer_id', 'name email')
			.populate('rsvpList', 'name email');
			
		if (!event) {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		
		return json({ event });
	} catch (error) {
		console.error('Error fetching event:', error);
		return json({ error: 'Failed to fetch event' }, { status: 500 });
	}
};

// PUT - Update an event
export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		await connectDB();
		
		const data = await request.json();
		const { name, description, bounds, status, inviteList, ticketSlots } = data;
		
		const event = await Event.findById(params.id);
		if (!event) {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		
		// Update common fields
		if (name) event.name = name;
		if (description !== undefined) event.description = description;
		if (bounds) event.bounds = bounds;
		if (status) event.status = status;
		
		// Update type-specific fields
		if (event.eventType === 'SMALL' && inviteList !== undefined) {
			event.inviteList = inviteList;
		}
		if (event.eventType === 'LARGE' && ticketSlots !== undefined) {
			event.ticketSlots = ticketSlots;
		}
		
		await event.save();
		await event.populate('organizer_id', 'name email');
		
		return json({ event });
	} catch (error) {
		console.error('Error updating event:', error);
		return json({ error: 'Failed to update event' }, { status: 500 });
	}
};

// DELETE - Delete an event
export const DELETE: RequestHandler = async ({ params }) => {
	try {
		await connectDB();
		
		const event = await Event.findByIdAndDelete(params.id);
		if (!event) {
			return json({ error: 'Event not found' }, { status: 404 });
		}
		
		return json({ message: 'Event deleted successfully' });
	} catch (error) {
		console.error('Error deleting event:', error);
		return json({ error: 'Failed to delete event' }, { status: 500 });
	}
};
