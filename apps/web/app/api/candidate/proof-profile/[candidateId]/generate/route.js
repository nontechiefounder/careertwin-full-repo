import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { requireUser } from '@/lib/serverAuth';
import { NextResponse } from 'next/server';
import { generateChat } from '@/lib/ai';

export async function POST(request, { params }) {
  try {
    const { candidateId } = await params;
    const authRes = await requireUser(request);
    if (authRes.errorResponse) return authRes.errorResponse;
    const { user, supabase } = authRes;

    if (user.id !== candidateId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch candidate
    const { data: candidate, error: candError } = await supabase
      .from('candidate_profiles')
      .select('*')
      .eq('id', candidateId)
      .single();

    if (candError || !candidate) {
      return NextResponse.json({ error: 'Candidate profile not found' }, { status: 404 });
    }

    // AI Generation Logic
    const systemPrompt = `You are an elite technical talent evaluator for workBYLiNE. Your goal is to synthesize raw candidate data into a premium, data-driven "Proof-First" profile. 
Focus on:
1. Quantifiable impact and technical depth.
2. Inferred capabilities based on the tech stack.
3. A professional, modern tone that eliminates fluff.
Respond with valid JSON only.`;

    const userPrompt = `Synthesize this candidate's raw data into a high-fidelity "Proof-First" profile. 
Candidate: ${candidate.name}
Role Target: ${JSON.stringify(candidate.target_roles || ["Engineering"])}
Bio: ${candidate.bio || 'Not provided'}
Location: ${candidate.location || 'Unknown'}

Rules:
- If bio/location is sparse, infer capabilities based on the 'Target Roles'.
- summary: Write a punchy 2-3 sentence technical executive summary.
- inferred_capabilities: List 4-6 specific technical skills (e.g., 'Distributed Systems', 'K8s Orchestration').
- top_work_examples: Create 2-3 specific, high-impact technical examples relevant to their role.
- proof_completeness: Score (0.0 - 1.0) based on how much data we actually have.
- proof_strength: Score (0.0 - 1.0) based on candidate seniority/tech stack.

Return JSON with exactly these fields:
{
  "summary": "...",
  "inferred_capabilities": ["...", "..."],
  "top_work_examples": [{"title": "High Impact Project", "description": "Technical accomplishment...", "proof_type": "GITHUB"}],
  "proof_completeness": 0.XX,
  "proof_strength": 0.XX,
  "verification_readiness": "ready/partial",
  "recommended_next_action": "What data should they add next?"
}`;

    let aiResult;
    try {
      aiResult = await generateChat(systemPrompt, userPrompt, true);
    } catch (err) {
      console.error('AI Generation failed:', err);
      return NextResponse.json(
        { error: 'PROOF_PROFILE_GENERATION_UNAVAILABLE', details: 'AI proof profile synthesis failed; no fallback persisted.' },
        { status: 503 }
      );
    }

    if (!aiResult || typeof aiResult !== 'object' || typeof aiResult.proof_completeness !== 'number' || typeof aiResult.proof_strength !== 'number') {
      return NextResponse.json(
        { error: 'PROOF_PROFILE_INVALID_OUTPUT', details: 'AI proof profile output missing required numeric scores.' },
        { status: 502 }
      );
    }

    const proofData = {
      ...aiResult,
      candidate_id: candidateId,
      created_at: new Date().toISOString()
    };

    const { data: savedProof, error: saveError } = await supabase
      .from('proof_profiles')
      .upsert([proofData])
      .select()
      .single();

    if (saveError) {
      return NextResponse.json({ error: 'Failed to save proof profile' }, { status: 500 });
    }

    return NextResponse.json(savedProof);

  } catch (err) {
    console.error('Proof profile generation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
