<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ArrowSquareOut, House, HouseSimple } from 'phosphor-svelte';

	import { authClient } from '$lib/auth-client'; // your Better Auth instance
	import { onMount } from 'svelte';

	let loading = $state(false);
	let message = $state('');
	let session = $state();
	let accounts = $state();

	const requestCalendarAccess = async () => {
		loading = true;
		message = '';

		try {
			const token = await authClient.linkSocial({
				provider: 'google',
				scopes: ['https://www.googleapis.com/auth/calendar.readonly']
			});
			console.log(token);
			message = '✅ Calendar access granted!';
		} catch (err: any) {
			console.error('Error requesting additional scope:', err);
			message = '❌ Failed to request Calendar access';
		} finally {
			loading = false;
		}
	};


	onMount(async () => {
		try {
			session = await authClient.useSession();
			console.log(session);
		} catch (error) {
			console.log(error);
		}
		try {
			accounts = await authClient.listAccounts();
			console.log(accounts);
		} catch (error) {
			console.log(error);
		}
	});
</script>

<div class="flex h-screen w-screen flex-col items-center justify-center gap-4">
	<h1 class="text-4xl font-light">Synk up</h1>
	<p class="text-lgt-con-sec dark:text-drk-con-sec">Event orchestration</p>

	<span class="flex flex-row gap-3">
		<Button variant="outline" href="/home">
			<House weight="duotone" />
			Home
		</Button>
	</span>
	<button onclick={requestCalendarAccess} disabled={loading}>
		{#if loading}
			Requesting access...
		{:else}
			Grant Google Calendar Access
		{/if}
	</button>

	{#if message}
		<p>{message}</p>
	{/if}
	<div>
		{JSON.stringify(session)}
	</div>
	<div class="border border-black whitespace-pre-line">
		{JSON.stringify(accounts, null, 2)}
	</div>
</div>
