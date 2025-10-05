import dotenv from 'dotenv';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';

import { db } from './db';

dotenv.config();

// First ensure database connection
const dbInstance = await db.getInstance();
if (!dbInstance) {
	throw new Error('Database connection failed');
}
const adapter = mongodbAdapter(dbInstance as any);

const options = {
	database: adapter,

	secret: process.env.BETTER_AUTH_SECRET,

	plugins: [],

	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID as string,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
			accessType: 'offline',
			prompt: 'select_account consent',
			scopes: [
				'openid',
				'email',
				'profile',
				'https://www.googleapis.com/auth/calendar.readonly',
				'https://www.googleapis.com/auth/calendar.freebusy'
			]
		}
	}
} satisfies BetterAuthOptions;

export const auth = betterAuth(options);
