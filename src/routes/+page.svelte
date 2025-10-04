<script>
	import { Button } from '$lib/components/ui/button';
	import { ArrowSquareOut, House, HouseSimple } from 'phosphor-svelte';
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
</div>
