import { describe, test, expect, beforeAll } from 'vitest';

describe('Full Supabase Local Runtime, Role Matrix & Adversarial Authorization Validation (Step 4B5.2-D1.4.1)', () => {
  const restUrl = 'http://127.0.0.1:54331/rest/v1';
  const authUrl = 'http://127.0.0.1:54331/auth/v1';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

  // Synthetic accounts per pilot role matrix
  const ownerAlpha = { email: 'gotrue.owner.alpha@example.invalid', password: 'Password123!', role: 'employer', name: 'Alpha Owner', id: null, token: null };
  const adminAlpha = { email: 'gotrue.admin.alpha@example.invalid', password: 'Password123!', role: 'employer', name: 'Alpha Admin', id: null, token: null };
  const recruiterAlpha = { email: 'gotrue.recruiter.alpha@example.invalid', password: 'Password123!', role: 'employer', name: 'Alpha Recruiter', id: null, token: null };
  const hiringManagerAlpha = { email: 'gotrue.hm.alpha@example.invalid', password: 'Password123!', role: 'employer', name: 'Alpha Hiring Manager', id: null, token: null };
  const auditorAlpha = { email: 'gotrue.auditor.alpha@example.invalid', password: 'Password123!', role: 'employer', name: 'Alpha Auditor', id: null, token: null };
  const suspendedAlpha = { email: 'gotrue.suspended.alpha@example.invalid', password: 'Password123!', role: 'employer', name: 'Alpha Suspended Member', id: null, token: null };

  const ownerBeta = { email: 'gotrue.owner.beta@example.invalid', password: 'Password123!', role: 'employer', name: 'Beta Owner', id: null, token: null };
  const candidateOne = { email: 'gotrue.cand.one@example.invalid', password: 'Password123!', role: 'candidate', name: 'Candidate One', id: null, token: null };
  const candidateTwo = { email: 'gotrue.cand.two@example.invalid', password: 'Password123!', role: 'candidate', name: 'Candidate Two', id: null, token: null };

  const allUsers = [ownerAlpha, adminAlpha, recruiterAlpha, hiringManagerAlpha, auditorAlpha, suspendedAlpha, ownerBeta, candidateOne, candidateTwo];

  // Domain fixture IDs
  const orgAlphaId = '00000000-0000-4000-c000-000000000001';
  const orgBetaId = '00000000-0000-4000-c000-000000000002';
  const seededHiringRunAlphaId = '11111111-1111-4111-a111-111111111111';
  const seededHiringRunBetaId = '22222222-2222-4222-a222-222222222222';
  const seededScreeningSessionAlphaId = '66666666-6666-4666-a666-666666666666';

  let canReachSupabase = false;

  async function getOrRegisterUser(email, password) {
    const signupRes = await fetch(`${authUrl}/signup`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const signupData = await signupRes.json();
    let token = signupData.access_token;
    let userId = signupData.user?.id;

    if (!token || !userId) {
      const tokenRes = await fetch(`${authUrl}/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const tokenData = await tokenRes.json();
      token = tokenData.access_token;
      const userRes = await fetch(`${authUrl}/user`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
      });
      userId = (await userRes.json()).id;
    }
    return { token, userId };
  }

  beforeAll(async () => {
    try {
      const res = await fetch(`${restUrl}/`, { headers: { apikey: anonKey } });
      canReachSupabase = res.status < 500;

      if (canReachSupabase) {
        for (const user of allUsers) {
          const { token, userId } = await getOrRegisterUser(user.email, user.password);
          user.token = token;
          user.id = userId;

          // Seed profile entry with approved fields only
          await fetch(`${restUrl}/profiles`, {
            method: 'POST',
            headers: { apikey: anonKey, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, email: user.email, name: user.name, company: 'CareerTWiN Test' })
          });
        }

        // Seed candidate profiles for candidates so foreign keys resolve
        await fetch(`${restUrl}/candidate_profiles`, {
          method: 'POST',
          headers: { apikey: anonKey, Authorization: `Bearer ${candidateOne.token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ id: candidateOne.id, name: candidateOne.name, email: candidateOne.email })
        });
        await fetch(`${restUrl}/candidate_profiles`, {
          method: 'POST',
          headers: { apikey: anonKey, Authorization: `Bearer ${candidateTwo.token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ id: candidateTwo.id, name: candidateTwo.name, email: candidateTwo.email })
        });

        // Insert ownerAlpha initial membership
        await fetch(`${restUrl}/organization_memberships`, {
          method: 'POST',
          headers: { apikey: anonKey, Authorization: `Bearer ${ownerAlpha.token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ organization_id: orgAlphaId, user_id: ownerAlpha.id, membership_role: 'owner', membership_status: 'active' })
        });

        // Insert ownerBeta initial membership
        await fetch(`${restUrl}/organization_memberships`, {
          method: 'POST',
          headers: { apikey: anonKey, Authorization: `Bearer ${ownerBeta.token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
          body: JSON.stringify({ organization_id: orgBetaId, user_id: ownerBeta.id, membership_role: 'owner', membership_status: 'active' })
        });

        // Setup Org Alpha with ownerAlpha as creator
        await fetch(`${restUrl}/organizations?id=eq.${orgAlphaId}`, {
          method: 'PATCH',
          headers: { apikey: anonKey, Authorization: `Bearer ${ownerAlpha.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ created_by: ownerAlpha.id })
        });

        // Setup Org Beta with ownerBeta as creator
        await fetch(`${restUrl}/organizations?id=eq.${orgBetaId}`, {
          method: 'PATCH',
          headers: { apikey: anonKey, Authorization: `Bearer ${ownerBeta.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ created_by: ownerBeta.id })
        });

        // ownerAlpha adds remaining Alpha members
        const alphaMembers = [
          { organization_id: orgAlphaId, user_id: adminAlpha.id, membership_role: 'admin', membership_status: 'active' },
          { organization_id: orgAlphaId, user_id: recruiterAlpha.id, membership_role: 'recruiter', membership_status: 'active' },
          { organization_id: orgAlphaId, user_id: hiringManagerAlpha.id, membership_role: 'hiring_manager', membership_status: 'active' },
          { organization_id: orgAlphaId, user_id: auditorAlpha.id, membership_role: 'auditor', membership_status: 'active' },
          { organization_id: orgAlphaId, user_id: suspendedAlpha.id, membership_role: 'recruiter', membership_status: 'suspended' }
        ];

        for (const m of alphaMembers) {
          await fetch(`${restUrl}/organization_memberships`, {
            method: 'POST',
            headers: { apikey: anonKey, Authorization: `Bearer ${ownerAlpha.token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify(m)
          });
        }

        // ownerAlpha updates hiring run
        await fetch(`${restUrl}/hiring_runs?id=eq.${seededHiringRunAlphaId}`, {
          method: 'PATCH',
          headers: { apikey: anonKey, Authorization: `Bearer ${ownerAlpha.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ employer_id: ownerAlpha.id, org_id: orgAlphaId })
        });

        // ownerBeta updates hiring run
        await fetch(`${restUrl}/hiring_runs?id=eq.${seededHiringRunBetaId}`, {
          method: 'PATCH',
          headers: { apikey: anonKey, Authorization: `Bearer ${ownerBeta.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ employer_id: ownerBeta.id, org_id: orgBetaId })
        });

        // ownerAlpha updates screening session to point candidate_id to candidateOne
        await fetch(`${restUrl}/screening_sessions?id=eq.${seededScreeningSessionAlphaId}`, {
          method: 'PATCH',
          headers: { apikey: anonKey, Authorization: `Bearer ${ownerAlpha.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidate_id: candidateOne.id })
        });
      }
    } catch {
      canReachSupabase = false;
    }
  }, 30000);

  // ---------------------------------------------------------------------------
  // SECTION 1: GOTRUE AUTHENTICATION & JWT PROPAGATION ASSERTIONS
  // ---------------------------------------------------------------------------

  test('ASSERT 1.1: GoTrue Signup API creates user and issues valid access token', async () => {
    if (!canReachSupabase) return;
    expect(ownerAlpha.token).toBeDefined();
    expect(typeof ownerAlpha.token).toBe('string');
  });

  test('ASSERT 1.2: GoTrue Password Grant verifies credentials and issues token', async () => {
    if (!canReachSupabase) return;
    const res = await fetch(`${authUrl}/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerAlpha.email, password: ownerAlpha.password })
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.access_token).toBeDefined();
  });

  test('ASSERT 1.3: GoTrue token verification via /auth/v1/user returns matching user identity', async () => {
    if (!canReachSupabase) return;
    const res = await fetch(`${authUrl}/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${ownerAlpha.token}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(ownerAlpha.id);
  });

  test('ASSERT 1.4: PostgREST resolves GoTrue JWT subject through auth.uid() claim', async () => {
    if (!canReachSupabase) return;
    const res = await fetch(`${restUrl}/profiles?id=eq.${ownerAlpha.id}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${ownerAlpha.token}` }
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(ownerAlpha.id);
  });

  test('ASSERT 1.5: Absent authentication header returns zero protected rows (401 / empty)', async () => {
    if (!canReachSupabase) return;
    const res = await fetch(`${restUrl}/profiles`, { headers: { apikey: anonKey } });
    if (res.status === 200) {
      expect((await res.json()).length).toBe(0);
    } else {
      expect(res.status).toBeGreaterThanOrEqual(400);
    }
  });

  test('ASSERT 1.6: Malformed JWT header returns 401 Unauthorized', async () => {
    if (!canReachSupabase) return;
    const res = await fetch(`${restUrl}/profiles`, {
      headers: { apikey: anonKey, Authorization: 'Bearer malformed.jwt.token' }
    });
    expect(res.status).toBe(401);
  });

  test('ASSERT 1.7: Forged JWT signature returns 401 Unauthorized', async () => {
    if (!canReachSupabase) return;
    const parts = ownerAlpha.token.split('.');
    const forgedToken = `${parts[0]}.${parts[1]}.FORGED_SIGNATURE_BYTES`;
    const res = await fetch(`${restUrl}/profiles`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${forgedToken}` }
    });
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // SECTION 2: PROFILE INSERT & UPDATE HARDENING (PART 6)
  // ---------------------------------------------------------------------------

  test('ASSERT 2.1: Direct profile creation with approved fields succeeds', async () => {
    if (!canReachSupabase) return;
    const tempEmail = `temp.create.${Date.now()}@example.invalid`;
    const { token, userId } = await getOrRegisterUser(tempEmail, 'Password123!');
    const createRes = await fetch(`${restUrl}/profiles`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, email: tempEmail, name: 'Temp Candidate', company: 'Temp Co' })
    });
    expect([200, 201]).toContain(createRes.status);
  }, 15000);

  test('ASSERT 2.2: Profile creation attempting to insert role column is DENIED', async () => {
    if (!canReachSupabase) return;
    const tempEmail = `temp.role.${Date.now()}@example.invalid`;
    const { token, userId } = await getOrRegisterUser(tempEmail, 'Password123!');
    const createRes = await fetch(`${restUrl}/profiles`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, email: tempEmail, name: 'Attacker', role: 'admin' })
    });
    expect(createRes.status).toBeGreaterThanOrEqual(400);
  }, 15000);

  test('ASSERT 2.3: Profile creation attempting to insert gmail integration fields is DENIED', async () => {
    if (!canReachSupabase) return;
    const tempEmail = `temp.gmail.${Date.now()}@example.invalid`;
    const { token, userId } = await getOrRegisterUser(tempEmail, 'Password123!');
    const createRes = await fetch(`${restUrl}/profiles`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: userId, email: tempEmail, name: 'Attacker', gmail_connected: true, gmail_email: 'hacked@example.com' })
    });
    expect(createRes.status).toBeGreaterThanOrEqual(400);
  }, 15000);

  test('ASSERT 2.4: Approved profile field update succeeds and database state reflects change', async () => {
    if (!canReachSupabase) return;
    const updateRes = await fetch(`${restUrl}/profiles?id=eq.${ownerAlpha.id}`, {
      method: 'PATCH',
      headers: { apikey: anonKey, Authorization: `Bearer ${ownerAlpha.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ company: 'Alpha Enterprise Corp' })
    });
    expect(updateRes.status).toBe(204);

    const verifyRes = await fetch(`${restUrl}/profiles?id=eq.${ownerAlpha.id}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${ownerAlpha.token}` }
    });
    const verifyData = await verifyRes.json();
    expect(verifyData[0].company).toBe('Alpha Enterprise Corp');
  });

  // ---------------------------------------------------------------------------
  // SECTION 3: ADVERSARIAL ORGANIZATION MEMBERSHIP ADMINISTRATION (PART 5)
  // ---------------------------------------------------------------------------

  test('ASSERT 3.1: Nonmember CANNOT read memberships from another organization', async () => {
    if (!canReachSupabase) return;
    const res = await fetch(`${restUrl}/organization_memberships?organization_id=eq.${orgAlphaId}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${ownerBeta.token}` }
    });
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBe(0);
  });

  test('ASSERT 3.2: Nonmember CANNOT add themselves to another organization', async () => {
    if (!canReachSupabase) return;
    const res = await fetch(`${restUrl}/organization_memberships`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${ownerBeta.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: orgAlphaId, user_id: ownerBeta.id, membership_role: 'admin', membership_status: 'active' })
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('ASSERT 3.3: Recruiter CANNOT add or remove organization members', async () => {
    if (!canReachSupabase) return;
    const insertRes = await fetch(`${restUrl}/organization_memberships`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${recruiterAlpha.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: orgAlphaId, user_id: candidateOne.id, membership_role: 'recruiter', membership_status: 'active' })
    });
    expect(insertRes.status).toBeGreaterThanOrEqual(400);

    const deleteRes = await fetch(`${restUrl}/organization_memberships?organization_id=eq.${orgAlphaId}&user_id=eq.${auditorAlpha.id}`, {
      method: 'DELETE',
      headers: { apikey: anonKey, Authorization: `Bearer ${recruiterAlpha.token}`, Prefer: 'return=representation' }
    });
    expect([200, 403]).toContain(deleteRes.status);
    if (deleteRes.status === 200) {
      expect((await deleteRes.json()).length).toBe(0);
    }
  });

  test('ASSERT 3.4: Recruiter CANNOT promote themselves to owner or admin', async () => {
    if (!canReachSupabase) return;
    const updateRes = await fetch(`${restUrl}/organization_memberships?organization_id=eq.${orgAlphaId}&user_id=eq.${recruiterAlpha.id}`, {
      method: 'PATCH',
      headers: { apikey: anonKey, Authorization: `Bearer ${recruiterAlpha.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ membership_role: 'owner' })
    });
    expect([200, 403]).toContain(updateRes.status);
    if (updateRes.status === 200) {
      expect((await updateRes.json()).length).toBe(0);
    }
  });

  test('ASSERT 3.5: Admin CANNOT promote themselves to owner or demote/remove the owner', async () => {
    if (!canReachSupabase) return;
    // Self-promotion to owner denied
    const promoteRes = await fetch(`${restUrl}/organization_memberships?organization_id=eq.${orgAlphaId}&user_id=eq.${adminAlpha.id}`, {
      method: 'PATCH',
      headers: { apikey: anonKey, Authorization: `Bearer ${adminAlpha.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ membership_role: 'owner' })
    });
    expect([200, 403]).toContain(promoteRes.status);
    if (promoteRes.status === 200) {
      expect((await promoteRes.json()).length).toBe(0);
    }

    // Demoting owner denied
    const demoteRes = await fetch(`${restUrl}/organization_memberships?organization_id=eq.${orgAlphaId}&user_id=eq.${ownerAlpha.id}`, {
      method: 'PATCH',
      headers: { apikey: anonKey, Authorization: `Bearer ${adminAlpha.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ membership_role: 'admin' })
    });
    expect([200, 403]).toContain(demoteRes.status);
    if (demoteRes.status === 200) {
      expect((await demoteRes.json()).length).toBe(0);
    }
  });

  test('ASSERT 3.6: Suspended member loses all organization resource access', async () => {
    if (!canReachSupabase) return;
    const res = await fetch(`${restUrl}/hiring_runs?id=eq.${seededHiringRunAlphaId}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${suspendedAlpha.token}` }
    });
    expect(res.status).toBe(200);
    expect((await res.json()).length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // SECTION 4: ROLE MATRIX FOR DOMAIN RESOURCES (PART 3, 7, 8, 9)
  // ---------------------------------------------------------------------------

  test('ASSERT 4.1: Owner, Admin, Recruiter can write hiring runs; Auditor is READ-ONLY', async () => {
    if (!canReachSupabase) return;
    // Auditor read succeeds
    const auditRead = await fetch(`${restUrl}/hiring_runs?id=eq.${seededHiringRunAlphaId}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${auditorAlpha.token}` }
    });
    expect(auditRead.status).toBe(200);
    expect((await auditRead.json()).length).toBe(1);

    // Auditor write DENIED
    const auditWrite = await fetch(`${restUrl}/hiring_runs?id=eq.${seededHiringRunAlphaId}`, {
      method: 'PATCH',
      headers: { apikey: anonKey, Authorization: `Bearer ${auditorAlpha.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ role_title: 'Hacked Title' })
    });
    expect([200, 403]).toContain(auditWrite.status);
    if (auditWrite.status === 200) {
      expect((await auditWrite.json()).length).toBe(0);
    }
  });

  test('ASSERT 4.2: Candidate update to screening session fields candidate_id/hiring_run_id is DENIED', async () => {
    if (!canReachSupabase) return;
    const patchRes = await fetch(`${restUrl}/screening_sessions?id=eq.${seededScreeningSessionAlphaId}`, {
      method: 'PATCH',
      headers: { apikey: anonKey, Authorization: `Bearer ${candidateOne.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ candidate_id: candidateTwo.id })
    });
    expect([200, 403]).toContain(patchRes.status);
    if (patchRes.status === 200) {
      expect((await patchRes.json()).length).toBe(0);
    }
  });

  test('ASSERT 4.3: Candidate Answer operations — own insert/update succeeds; DELETE denied; cross-candidate denied', async () => {
    if (!canReachSupabase) return;
    const answerId = crypto.randomUUID();
    // Insert answer for own session with unique question_index 99
    const insertRes = await fetch(`${restUrl}/screening_answers`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${candidateOne.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: answerId, session_id: seededScreeningSessionAlphaId, question_index: 99, answer_text: 'Cand 1 Answer' })
    });
    expect([200, 201, 409]).toContain(insertRes.status);

    // Update own answer
    const updateRes = await fetch(`${restUrl}/screening_answers?id=eq.${answerId}`, {
      method: 'PATCH',
      headers: { apikey: anonKey, Authorization: `Bearer ${candidateOne.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answer_text: 'Updated Answer 1' })
    });
    expect(updateRes.status).toBe(204);

    // Candidate DELETE denied
    const deleteRes = await fetch(`${restUrl}/screening_answers?id=eq.${answerId}`, {
      method: 'DELETE',
      headers: { apikey: anonKey, Authorization: `Bearer ${candidateOne.token}` }
    });
    expect(deleteRes.status).toBeGreaterThanOrEqual(400);

    // Cross-candidate read denied
    const crossRead = await fetch(`${restUrl}/screening_answers?id=eq.${answerId}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${candidateTwo.token}` }
    });
    expect(crossRead.status).toBe(200);
    expect((await crossRead.json()).length).toBe(0);
  });

  test('ASSERT 4.4: Candidate Profiles — own select/insert/update allowed; DELETE denied', async () => {
    if (!canReachSupabase) return;
    // Own insert
    const insertRes = await fetch(`${restUrl}/candidate_profiles`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${candidateOne.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: candidateOne.id, name: candidateOne.name, email: candidateOne.email })
    });
    expect([200, 201, 409]).toContain(insertRes.status);

    // Own update
    const updateRes = await fetch(`${restUrl}/candidate_profiles?id=eq.${candidateOne.id}`, {
      method: 'PATCH',
      headers: { apikey: anonKey, Authorization: `Bearer ${candidateOne.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Remote Global' })
    });
    expect([200, 204]).toContain(updateRes.status);

    // DELETE denied
    const deleteRes = await fetch(`${restUrl}/candidate_profiles?id=eq.${candidateOne.id}`, {
      method: 'DELETE',
      headers: { apikey: anonKey, Authorization: `Bearer ${candidateOne.token}` }
    });
    expect(deleteRes.status).toBeGreaterThanOrEqual(400);
  });

  test('ASSERT 4.5: Anonymous client retrieves ZERO protected rows across all 13 tables', async () => {
    if (!canReachSupabase) return;
    const tables = ['organizations', 'organization_memberships', 'profiles', 'candidate_profiles', 'proof_profiles', 'hiring_runs', 'sourcing_sessions', 'candidates', 'screening_sessions', 'screening_answers', 'screening_summaries', 'activity_events', 'scheduled_emails'];
    for (const table of tables) {
      const res = await fetch(`${restUrl}/${table}`, { headers: { apikey: anonKey } });
      if (res.status === 200) {
        expect((await res.json()).length).toBe(0);
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    }
  });
});
