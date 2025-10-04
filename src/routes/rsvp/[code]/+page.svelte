<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Calendar, MapPin, User, Clock, Check, X, GoogleLogo } from 'phosphor-svelte';
	import { EventStatus } from '$lib/models/event.model.types.js';
	import { authClient } from '$lib/auth-client.js';
	import { onMount } from 'svelte';

	let { data }: { data: any } = $props();
	
	let loading = $state(false);
	let responseSubmitted = $state(false);
	let authLoading = $state(false);
	let calendarLoading = $state(false);
	let session = $state(null);
	let accounts = $state([]);
	let hasCalendarAccess = $state(false);

	// Check authentication and calendar access on mount
	onMount(async () => {
		await checkAuthenticationStatus();
	});

	async function checkAuthenticationStatus() {
		try {
			// Try to get existing session first
			session = await authClient.useSession();
			
			if (session?.data?.session) {
				console.log('✅ User is already logged in:', session.data.user.email);
				
				// User is logged in, now check for calendar access
				try {
					accounts = await authClient.listAccounts();
					checkCalendarAccess();
					
					if (hasCalendarAccess) {
						console.log('✅ User already has calendar access');
					} else {
						console.log('⚠️ User needs calendar access');
					}
				} catch (error) {
					console.log('Error checking accounts:', error);
				}
			} else {
				console.log('⚠️ User needs to sign in');
			}
		} catch (error) {
			console.log('No active session found:', error);
		}
	}

	function checkCalendarAccess() {
		// Check if any account has calendar.readonly scope
		hasCalendarAccess = accounts.some((account: any) => 
			account.scope && account.scope.includes('https://www.googleapis.com/auth/calendar.readonly')
		);
	}

	async function handleGoogleSignIn() {
		if (session?.data?.session) {
			console.log('User is already signed in, skipping sign in');
			return;
		}

		authLoading = true;
		try {
			await authClient.signIn.social({
				provider: 'google'
			});
			
			// Refresh authentication status after sign in
			await checkAuthenticationStatus();
			
		} catch (error) {
			console.error('Google sign in failed:', error);
			alert('Failed to sign in with Google');
		} finally {
			authLoading = false;
		}
	}

	async function requestCalendarAccess() {
		if (hasCalendarAccess) {
			console.log('User already has calendar access, skipping request');
			return;
		}

		calendarLoading = true;
		try {
			await authClient.linkSocial({
				provider: 'google',
				scopes: ['https://www.googleapis.com/auth/calendar.readonly']
			});
			
			// Refresh authentication status after calendar access
			await checkAuthenticationStatus();
			
		} catch (error) {
			console.error('Calendar access request failed:', error);
			alert('Failed to request calendar access');
		} finally {
			calendarLoading = false;
		}
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function respondToInvite(response: 'accepted' | 'declined') {
		loading = true;
		try {
			const res = await fetch(`/api/rsvp/${data.inviteCode}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ 
					response,
					userEmail: session?.data?.user?.email 
				})
			});

			if (res.ok) {
				data.invite.status = response;
				responseSubmitted = true;
			} else {
				const error = await res.json();
				alert('Error: ' + error.message);
			}
		} catch (error) {
			console.error('Error responding to invite:', error);
			alert('Failed to respond to invitation');
		} finally {
			loading = false;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'accepted': return 'text-green-600';
			case 'declined': return 'text-red-600';
			default: return 'text-yellow-600';
		}
	}

	function getStatusText(status: string) {
		switch (status) {
			case 'accepted': return 'Accepted';
			case 'declined': return 'Declined';
			default: return 'Pending Response';
		}
	}

	// Check if user can respond (authenticated + has calendar access)
	let canRespond = $derived(session?.data?.session && hasCalendarAccess);
</script>

<svelte:head>
	<title>Event Invitation - {data.event.name}</title>
</svelte:head>

<div class="min-h-screen bg-background">
	<div class="container mx-auto px-4 py-8 max-w-2xl">
		<div class="bg-card rounded-lg border border-border shadow-lg overflow-hidden">
			<!-- Header -->
			<div class="bg-primary/5 p-6 border-b border-border">
				<h1 class="text-2xl font-bold text-card-foreground mb-2">You're Invited!</h1>
				<p class="text-muted-foreground">
					You have been invited to <strong>{data.event.name}</strong>
				</p>
			</div>

			<!-- Event Details -->
			<div class="p-6 space-y-4">
				<div class="space-y-3">
					<h2 class="text-xl font-semibold text-card-foreground">{data.event.name}</h2>
					
					{#if data.event.description}
						<p class="text-muted-foreground">{data.event.description}</p>
					{/if}

					<div class="space-y-2">
						<div class="flex items-center gap-2 text-sm">
							<Calendar size={16} class="text-primary" />
							<span class="font-medium">When:</span>
							<span>{formatDate(data.event.bounds.start)}</span>
						</div>

						<div class="flex items-center gap-2 text-sm">
							<Clock size={16} class="text-primary" />
							<span class="font-medium">Duration:</span>
							<span>
								{formatDate(data.event.bounds.start)} - {formatDate(data.event.bounds.end)}
							</span>
						</div>

						<div class="flex items-center gap-2 text-sm">
							<User size={16} class="text-primary" />
							<span class="font-medium">Organizer:</span>
							<span>{data.event.organizer_id?.name || 'Unknown'}</span>
						</div>
					</div>
				</div>

				<!-- Invite Details -->
				<div class="bg-muted/50 rounded-lg p-4">
					<h3 class="font-medium mb-2">Invitation Details</h3>
					<div class="space-y-1 text-sm">
						<div class="flex justify-between">
							<span class="text-muted-foreground">Invited Email:</span>
							<span class="font-medium">{data.invite.email}</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Status:</span>
							<span class="font-medium {getStatusColor(data.invite.status)}">
								{getStatusText(data.invite.status)}
							</span>
						</div>
						<div class="flex justify-between">
							<span class="text-muted-foreground">Invited On:</span>
							<span class="font-medium">
								{new Date(data.invite.createdAt).toLocaleDateString()}
							</span>
						</div>
					</div>
				</div>

				<!-- Authentication and Calendar Access Steps -->
				{#if !session?.data?.session}
					<!-- Step 1: Google Sign In -->
					<div class="bg-primary/5 border border-primary/20 rounded-lg p-4 mb-4">
						<h3 class="font-medium mb-2 flex items-center gap-2">
							<User size={16} class="text-primary" />
							Step 1: Sign in with Google
						</h3>
						<p class="text-sm text-muted-foreground mb-3">
							You need to sign in with Google to respond to this invitation.
						</p>
						<Button 
							onclick={handleGoogleSignIn}
							disabled={authLoading}
							class="flex items-center gap-2"
						>
							<GoogleLogo size={16} />
							{authLoading ? 'Signing in...' : 'Sign in with Google'}
						</Button>
					</div>
				{:else if !hasCalendarAccess}
					<!-- Step 2: Calendar Access -->
					<div class="bg-secondary/5 border border-secondary/20 rounded-lg p-4 mb-4">
						<h3 class="font-medium mb-2 flex items-center gap-2">
							<Calendar size={16} class="text-secondary" />
							Step 2: Grant Calendar Access
						</h3>
						<p class="text-sm text-muted-foreground mb-3">
							To accept this invitation, we need access to your Google Calendar to check for conflicts.
						</p>
						<Button 
							onclick={requestCalendarAccess}
							disabled={calendarLoading}
							variant="secondary"
							class="flex items-center gap-2"
						>
							<Calendar size={16} />
							{calendarLoading ? 'Requesting access...' : 'Grant Calendar Access'}
						</Button>
					</div>
				{:else}
					<!-- Authentication Success -->
					<div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
						<h3 class="font-medium mb-2 flex items-center gap-2 text-green-700">
							<Check size={16} />
							Ready to Respond
						</h3>
						<p class="text-sm text-green-600">
							Signed in as {session.data.user.email} with calendar access.
						</p>
					</div>
				{/if}

				<!-- Response Buttons -->
				{#if data.invite.status === 'pending' && !responseSubmitted && canRespond}
					<div class="flex gap-3 pt-4">
						<Button 
							onclick={() => respondToInvite('accepted')}
							disabled={loading}
							class="flex-1 flex items-center justify-center gap-2"
						>
							<Check size={16} />
							{loading ? 'Responding...' : 'Accept Invitation'}
						</Button>
						<Button 
							variant="outline"
							onclick={() => respondToInvite('declined')}
							disabled={loading}
							class="flex-1 flex items-center justify-center gap-2"
						>
							<X size={16} />
							Decline
						</Button>
					</div>
				{:else if data.invite.status === 'pending' && !canRespond}
					<div class="text-center py-4">
						<p class="text-sm text-muted-foreground">
							Complete the steps above to respond to this invitation.
						</p>
					</div>
				{:else}
					<div class="text-center py-4">
						{#if data.invite.status === 'accepted'}
							<div class="text-green-600 font-medium flex items-center justify-center gap-2">
								<Check size={20} />
								You have accepted this invitation
							</div>
						{:else if data.invite.status === 'declined'}
							<div class="text-red-600 font-medium flex items-center justify-center gap-2">
								<X size={20} />
								You have declined this invitation
							</div>
						{/if}
						
						{#if responseSubmitted}
							<p class="text-sm text-muted-foreground mt-2">
								Thank you for your response!
							</p>
						{/if}
					</div>
				{/if}

				<!-- Event Status -->
				{#if data.event.status === EventStatus.CANCELLED}
					<div class="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-center">
						<p class="text-destructive font-medium">This event has been cancelled</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
