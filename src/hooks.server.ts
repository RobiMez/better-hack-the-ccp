import { redirect, type Handle, type HandleFetch } from '@sveltejs/kit';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/environment';

import chalk from 'chalk';

import { auth } from '$src/lib/auth';
// Import models to ensure they are registered before any requests
import '$src/lib/models.js';

export const handleFetch: HandleFetch = async ({ request, fetch }) => {
	console.log(chalk.bgWhite('[handleFetch] ') + ' Request to API URL ', request.url);
	return fetch(request);
};

export const handle: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.includes('/auth')) {
		return svelteKitHandler({ event, resolve, auth, building });
	}

	// Whitelist RSVP routes - allow access without authentication
	if (event.url.pathname.startsWith('/rsvp/')) {
		return svelteKitHandler({ event, resolve, auth, building });
	}

	if (!event.locals.session) {
		const session = await auth.api.getSession({
			headers: event.request.headers
		});

		if (!session || !session.session) {
			const loginUrl = `/auth/login?from=${encodeURIComponent(event.url.pathname)}`;
			redirect(302, loginUrl);
		} else {
			event.locals.user = session.user;
			event.locals.session = session.session;
		}
	}

	console.log(chalk.bgWhite('[Handle]') + ' ' + event.request.url);
	return svelteKitHandler({ event, resolve, auth, building });
};
