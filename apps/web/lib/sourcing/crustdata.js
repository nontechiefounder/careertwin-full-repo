import { generateChat } from '../ai';

const CRUSTDATA_API_URL = 'https://api.crustdata.com/screener/persondb/search';

/**
 * The Sourcing Architect
 * Translates a Hiring Run into precise Crustdata Search Filters
 */
export async function generateSearchFilters(run) {
    const systemPrompt = `You are a Search Architect for the Crustdata People Search API.
Your task is to take a Hiring Run and output exactly one JSON "filters" object for the /screener/persondb/search endpoint.

CRUSTDATA FILTER RULES:
1. Use "op": "and" for multiple conditions.
2. Filter Types: "current_employers.title", "skills", "region", "years_of_experience_raw", "current_employers.name".
3. Operators: "=" (exact), "(.)" (fuzzy), "in" (list), ">" (greater than).
4. For skills, always use "(.)" fuzzy search.
5. For titles, use "(.)" or "in".
6. Format: { "op": "and", "conditions": [...] }

Return ONLY valid JSON.`;

    const userPrompt = `Generate filters for this role:
- Role: ${run.role_title}
- Company: ${run.company} (${run.company_stage})
- JD: ${run.job_description}
- Must Haves: ${JSON.stringify(run.must_haves)}
- Nice to Haves: ${JSON.stringify(run.nice_to_haves)}

Focus on: Title, Key Skills, and Years of Experience.`;

    try {
        const filters = await generateChat(systemPrompt, userPrompt, true);
        return filters;
    } catch (err) {
        console.error('Filter generation failed:', err);
        // Fallback: Extremely simple title search
        return {
            column: "current_employers.title",
            type: "(.)",
            value: run.role_title
        };
    }
}

/**
 * Executes a one-shot search using Crustdata
 */
export async function performOneShotSearch(supabase, sessionId, hiringRunId) {
    // 1. Fetch the hiring run
    const { data: run, error: runError } = await supabase
        .from('hiring_runs')
        .select('*')
        .eq('id', hiringRunId)
        .single();

    if (runError || !run) throw new Error('Hiring run not found');

    // 2. Budget Guard: Hard limit of 5 credits total (3 per search)
    if (run.crustdata_credits_spent + 3 > 5) {
        console.warn('Budget exhausted for this position');
        return { error: 'budget_exhausted' };
    }

    // 3. Generate the Architect's filters
    const filters = await generateSearchFilters(run);
    console.log('Sourcing Architect generated filters:', JSON.stringify(filters, null, 2));

    // 4. Hit Crustdata
    try {
        const response = await fetch(CRUSTDATA_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${process.env.CRUSTDATA_AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                filters: filters,
                limit: 50 // One-shot batch
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`Crustdata API failed: ${errBody}`);
        }

        const data = await response.json();
        const profiles = data.profiles || [];

        console.log(`Crustdata returned ${profiles.length} real candidates.`);
        console.log("Profiles:", profiles);
        // 5. Process and Save Results
        for (const profile of profiles) {
            // a. Create/Update Profile
            const { data: pData } = await supabase
                .from('candidate_profiles')
                .upsert({
                    name: profile.name,
                    bio: profile.headline || profile.title,
                    location: profile.region,
                    github_url: profile.github_profiles?.[0] || null,
                    linkedin_url: profile.linkedin_profile_url || null
                }, { onConflict: 'email' }) // Simple conflict handling
                .select()
                .single();

            // b. Link to Candidate List (Shortlist)
            await supabase
                .from('candidates')
                .insert({
                    hiring_run_id: hiringRunId,
                    candidate_id: pData?.id,
                    fit_score: null,
                    status: 'new',
                    highlights: [profile.title, profile.region].filter(Boolean)
                });
        }

        // 6. Log Events for the Live Feed
        await supabase
            .from('activity_events')
            .insert([
                {
                    session_id: sessionId,
                    event_type: 'info',
                    title: 'Search Architect deployed',
                    description: `Optimized filters generated for "${run.role_title} at ${run.company}".`
                },
                {
                    session_id: sessionId,
                    event_type: 'shortlist',
                    title: 'Candidates Sourced',
                    description: `Found ${profiles.length} real-world matches using Crustdata Live Search.`
                }
            ]);

        // 7. Update Budget and Status
        await supabase
            .from('hiring_runs')
            .update({
                crustdata_credits_spent: run.crustdata_credits_spent + 3,
                sourcing_status: 'completed'
            })
            .eq('id', hiringRunId);

        return { success: true, count: profiles.length };

    } catch (err) {
        console.error('Crustdata search failed:', err);
        return { error: 'search_failed', message: err.message };
    }
}
