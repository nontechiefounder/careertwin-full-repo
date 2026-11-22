/**
 * Crustdata MCP Tool Bridge
 * This file defines the tools that the AI "Sourcing Agent" can use.
 */

const CRUSTDATA_API_URL = 'https://api.crustdata.com/screener/persondb/search';

/**
 * TOOL: search_candidates
 * Autonomously used by the AI to find real people in the Crustdata In-DB.
 */
export async function tool_search_candidates(supabase, hiringRunId, filters, limit = 50) {
    // 1. Fetch Hiring Run Budget
    const { data: run, error: runError } = await supabase
        .from('hiring_runs')
        .select('crustdata_credits_spent')
        .eq('id', hiringRunId)
        .single();

    if (runError || !run) {
        console.error("CRUSTDATA: Budget fetch failed for run:", hiringRunId, runError);
        return { error: "Hiring run context not found.", details: runError?.message || "Record missing" };
    }

    // 2. Budget Guard: Hard limit of 5 credits. Search costs 3.
    const currentSpent = run.crustdata_credits_spent || 0;
    if (currentSpent + 3 > 10) {
        return {
            error: "Budget Exhausted",
            message: `Current spent: ${currentSpent}/5 CR. Another search (3 credits) would exceed limit.`
        };
    }

    // 3. Execute API Call
    try {
        console.log(`MCP TOOL [search_candidates] triggered for ${hiringRunId}`);
        let finalFilters = filters;

        // If AI didn't provide complex op/conditions, wrap it to avoid E021
        if (!filters.conditions || !filters.op) {
            console.log("CRUSTDATA: Wrapping single filter into complex structure");
            finalFilters = {
                op: "and",
                conditions: [filters]
            };
        }

        const payload = {
            filters: finalFilters,
            limit: limit
        };

        console.log("CRUSTDATA: POST", CRUSTDATA_API_URL, JSON.stringify(payload, null, 2));

        const response = await fetch(CRUSTDATA_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${process.env.CRUSTDATA_AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Crustdata API Error: ${errText}`);
        }

        const data = await response.json();
        const profiles = data.profiles.filter((x) => x.emails.length > 0) || [];

        // 4. Update Budget in DB
        await supabase
            .from('hiring_runs')
            .update({ crustdata_credits_spent: currentSpent + 3 })
            .eq('id', hiringRunId);

        console.log(`MCP TOOL [search_candidates] success. Found ${profiles.length} profiles.`);

        return {
            success: true,
            profiles_found: profiles.length,
            data: profiles,
            budget: `${currentSpent + 3}/5 CR spent`
        };

    } catch (err) {
        console.error("CRUSTDATA: Search execution failed:", err.message);
        return { error: "Execution Failed", message: err.message };
    }
}

/**
 * MCP Tool definitions for the AI System Prompt
 */
export const CRUSTDATA_TOOLS = [
    {
        name: "search_candidates",
        description: "Searches the live Crustdata database for people matching specific criteria. Use this to find real candidates after analyzing a role brief.",
        parameters: {
            type: "object",
            properties: {
                filters: {
                    type: "object",
                    description: "The JSON filters for the In-DB search API (op, conditions, etc.)"
                },
                limit: {
                    type: "number",
                    description: "Max results to return (default 50)",
                    default: 50
                }
            },
            required: ["filters"]
        }
    }
];
