import { generateChat } from '../ai';
import { CRUSTDATA_TOOLS, tool_search_candidates } from '../mcp/crustdata_tools';

/**
 * The Agentic Sourcing Workflow
 * This agent autonomously decides how to use the Crustdata MCP tool.
 */
export async function runSourcingAgent(supabase, sessionId, hiringRunId) {
    try {
        // 1. Log Initialization
        await logEvent(supabase, sessionId, 'agent_init', 'Agent Awakened', 'I am analyzing the hiring brief to plan my search strategy...');

        if (hiringRunId?.startsWith('mock-')) {
            throw new Error("Cannot source for a 'Mock Role'. Please create a new role from scratch to use the live database.");
        }

        // 2. Fetch Context
        const { data: run, error: runError } = await supabase
            .from('hiring_runs')
            .select('*')
            .eq('id', hiringRunId)
            .single();

        if (runError || !run) throw new Error("Context lost. Hiring run not found in database.");

        const systemPrompt = `You are the CareerTWiN Sourcing Agent. 
You possess the 'search_candidates' tool to find real people in the Crustdata database.
Your goal is to find the best 50 candidates for the role: "${run.role_title} at ${run.company}".

STRATEGY (CRITICAL):
1. LOCATION FIRST: If a location is specified ("${run.location || 'Global'}"), prioritise finding candidates in that region.
2. Analyze the MUST HAVES and NICE TO HAVES.
3. Construct the most precise filters possible for the 'search_candidates' tool.
   STRUCTURE: {"op": "and", "conditions": [{"column": "region", "type": "(.)", "value": "${run.location || ''}"}, {"column": "current_employers.title", "type": "(.)", "value": "Engineer"}]}
   VALID OPERATORS: "(.)" (fuzzy/contains), "=" (exact), "in" (list), ">" (greater than).
   VALID FIELDS: "current_employers.title", "skills", "region", "years_of_experience_raw", "current_employers.name".
4. Call the tool to fetch real-world data.

IMPORTANT: You only have a budget of 5 credits per role. A search costs 3 credits. DO NOT waste them on broad searches.`;

        const userPrompt = `Role: ${run.role_title}\nJD: ${run.job_description}\nMust Haves: ${JSON.stringify(run.must_haves)}`;

        // 3. AI "Think and Call"
        const response = await generateChat(systemPrompt, userPrompt, true, CRUSTDATA_TOOLS);

        if (response.tool_calls) {
            const call = response.tool_calls[0];
            const args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments;

            await logEvent(supabase, sessionId, 'agent_search', 'Executing MCP Tool', `Calling search_candidates with custom filters...`);

            // 4. Force the location filter if specified in the run context
            const finalFilters = args.filters || { op: 'and', conditions: [] };
            if (run.location && run.location.trim() !== '') {
                const hasRegionFilter = finalFilters.conditions?.some(c => c.column === 'region');
                if (!hasRegionFilter) {
                    console.log(`AGENT: Forcing target location filter: ${run.location}`);
                    finalFilters.conditions.push({ column: 'region', type: '(.)', value: run.location });
                }
            }

            const result = await tool_search_candidates(supabase, hiringRunId, finalFilters, args.limit || 50);
            console.log("AGENT: Tool result received", result.success ? "SUCCESS" : "FAILED", result.profiles_found || 0, "found");

            if (result.error) {
                console.error("AGENT: Tool execution failed:", result.error, result.message, result.details);
                await logEvent(supabase, sessionId, 'agent_error', 'Execution Failed', `${result.message || result.error} ${result.details || ""}`);
                return { error: result.error };
            }

            // 5. Process Results
            const profiles = result.data || [];
            if (profiles.length === 0) {
                await logEvent(supabase, sessionId, 'agent_error', 'No Candidates Found', 'The search filters were too restrictive. Try broadening the must-haves.');
                return { success: true, count: 0 };
            }

            await logEvent(supabase, sessionId, 'agent_info', 'Discovery Complete', `Found ${profiles.length} real candidates. Beginning Elite AI Evaluation...`);

            // 5. Elite AI Evaluation (Batch Mode)
            const evaluations = await evaluateProfilesBatch(run, profiles);
            await logEvent(supabase, sessionId, 'agent_info', 'Evaluation Complete', `Precision scores and summaries generated for ${profiles.length} profiles.`);

            let currentScanned = 0;
            let currentShortlisted = 0;
            console.log("AGENT: Profiles:", profiles);
            for (const profile of profiles) {
                currentScanned++;
                const linkedin = profile.linkedin_profile_url || `https://linkedin.com/in/unknown-${Math.random().toString(36).substr(2, 9)}`;

                // Get pre-calculated fit score and summary
                const evaluation = evaluations[linkedin] || { fit_score: 0.50, fit_summary: "Qualified profile discovered." };

                // 1. Manually Check/Retrieve the Profile ID
                let pId = null;
                const { data: existingProfile } = await supabase
                    .from('candidate_profiles')
                    .select('id')
                    .eq('resume_link', linkedin)
                    .maybeSingle();

                if (existingProfile) {
                    pId = existingProfile.id;
                } else {
                    const newId = crypto.randomUUID();
                    const { data: newProfile, error: pError } = await supabase
                        .from('candidate_profiles')
                        .insert({
                            id: newId,
                            name: profile.name || 'Anonymous Candidate',
                            email: profile.emails || null,
                            bio: evaluation.fit_summary || profile.headline || 'Professionally discovered',
                            location: profile.region || profile.location_details?.city || 'Global',
                            resume_link: linkedin,
                            github_url: profile.github_profiles?.[0] || null
                        })

                        .select()
                        .single();

                    if (!pError && newProfile) {
                        pId = newProfile.id;
                    } else if (pError) {
                        console.error("AGENT: Profile creation failed:", pError.message);
                        await logEvent(supabase, sessionId, 'agent_error', 'Import Failed', `Candidate ${profile.name || 'Unknown'} skipped: ${pError.message}`);
                        continue;
                    }
                }

                // 2. Add to Candidate List
                if (pId) {
                    const { error: cError } = await supabase
                        .from('candidates')
                        .insert({
                            hiring_run_id: hiringRunId,
                            candidate_id: pId,
                            fit_score: evaluation.fit_score,
                            // fit_summary: evaluation.fit_summary, // Temporarily disabled until user runs ALTER TABLE
                            status: 'new'
                        });

                    if (!cError) {
                        currentShortlisted++;
                        // Use 'agent_profile' to increment the UI 'scanned' counter
                        await logEvent(supabase, sessionId, 'agent_profile', `Match Found: ${profile.name || 'Candidate'}`, `${evaluation.fit_summary} (${Math.round(evaluation.fit_score * 100)}% Fit)`);
                    } else {
                        console.error("AGENT: Candidate link failed:", cError.message, cError.details);
                        await logEvent(supabase, sessionId, 'agent_error', 'Link Failed', `Could not add ${profile.name || 'Candidate'} to role: ${cError.message}`);
                    }
                }
            }

            // 6. Final Audit-Based Update of Counters (The Source of Truth)
            const { count: totalCandidates } = await supabase
                .from('candidates')
                .select('*', { count: 'exact', head: true })
                .eq('hiring_run_id', hiringRunId);

            const { count: totalShortlisted } = await supabase
                .from('candidates')
                .select('*', { count: 'exact', head: true })
                .eq('hiring_run_id', hiringRunId)
                .eq('status', 'new');


            await supabase
                .from('hiring_runs')
                .update({
                    candidates_count: totalCandidates || 0,
                    shortlisted_count: totalShortlisted || 0,
                    sourcing_status: 'completed'
                })
                .eq('id', hiringRunId);

            // Also update the sourcing_session profiles_scanned for session UI
            await supabase
                .from('sourcing_sessions')
                .update({ profiles_scanned: totalCandidates || 0 })
                .eq('id', sessionId);

            await logEvent(supabase, sessionId, 'complete', 'Sourcing Sequence Complete', `Audit complete. Total Pipeline: ${totalCandidates} candidates.`);
            return { success: true, count: totalShortlisted };
        }

        return { error: "Agent chose not to search." };

    } catch (err) {
        console.error('Agent Workflow Error:', err);
        await logEvent(supabase, sessionId, 'agent_error', 'Workflow Failed', err.message);
        return { error: err.message };
    }
}

/**
 * AI Evaluate Profiles (Batch Mode)
 * Compares candidates against the job brief to assign score/summary
 */
async function evaluateProfilesBatch(run, profiles) {
    try {
        const systemPrompt = `You are the CareerTWiN Evaluation Engine. 
Review these candidate profiles against this Job Brief:
ROLE: ${run.role_title} at ${run.company}
LOCATION: ${run.location || 'Global/Remote'}
DESCRIPTION: ${run.job_description}
MUST HAVES: ${JSON.stringify(run.must_haves)}

TASK: Assign a Fit Score (0.00 to 1.00) and a concise One-Sentence Fit Summary for each candidate.
Note: Adjust scores based on the candidate's proximity to the target location if specified.
Return a JSON object: {"evaluations": [{"linkedin_url": "...", "fit_score": 0.XX, "fit_summary": "..."}]}`;

        const map = {};
        const chunkSize = 10;

        for (let i = 0; i < profiles.length; i += chunkSize) {
            const chunk = profiles.slice(i, i + chunkSize);
            console.log(`AGENT: AI Evaluating chunk ${i / chunkSize + 1} (${chunk.length} profiles)...`);

            const profileData = chunk.map(p => ({
                name: p.name,
                headline: p.headline,
                location: p.region || p.location_details?.city || 'Global', // CRITICAL FIX: Pass candidate location
                linkedin_url: p.linkedin_profile_url || "unknown",
                skills: p.skills || []
            }));

            const userPrompt = `Evaluate these candidates against the target location "${run.location || 'Global'}":\n${JSON.stringify(profileData)}`;
            const response = await generateChat(systemPrompt, userPrompt, true);

            if (response && response.evaluations) {
                response.evaluations.forEach(e => {
                    if (e.linkedin_url) map[e.linkedin_url] = e;
                });
            }
        }

        return map;
    } catch (err) {
        console.error("AGENT: AI Evaluation Failed:", err.message);
        return {}; // Fallback to baseline
    }
}

async function logEvent(supabase, sessionId, type, title, desc) {
    return supabase.from('activity_events').insert([{
        session_id: sessionId,
        event_type: type,
        title: title,
        description: desc,
        timestamp: new Date().toISOString()
    }]);
}
