/**
 * CareerTWiN Mass Seeding Utility
 * Systematically uses Crustdata credits to build a local talent vault.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });

const CRUSTDATA_KEY = process.env.CRUSTDATA_AUTH_TOKEN;
const VAULT_PATH = path.join(process.cwd(), 'data', 'talent_vault.json');

// --- CONTROL PANEL ---
const CONFIG = {
    MAX_ROLES_PER_CATEGORY: 99, // Set to 2 for now, or 99 for "Max"
    MAX_PAGES_PER_ROLE: 5      // Set to 5 for deep search, or 1 for fast test
};
// ---------------------

const CATEGORIES = {
    "AI & Data Science": [
        "AI/ML Engineer", "Generative AI Specialist", "Prompt Engineer",
        "Data Scientist", "Data Engineer", "AI Product Manager",
        "Computer Vision Engineer", "MLOps Engineer", "Big Data Architect", "NLP Specialist"
    ],
    "Software Development": [
        "Full-Stack Developer", "Backend Developer", "Frontend Developer",
        "Mobile App Developer", "Software Development Engineer", "Game Developer",
        "Blockchain Developer", "Embedded Systems Engineer"
    ],
    "Cloud & Operations": [
        "Cloud Architect", "DevOps Engineer", "Site Reliability Engineer",
        "Platform Engineer", "Network Architect", "Database Administrator"
    ],
    "Security & Strategy": [
        "Cybersecurity Engineer", "Ethical Hacker", "UI/UX Designer",
        "IT Project Manager", "Business Intelligence Analyst", "Solutions Architect"
    ]
};

async function seedRole(title, roleIdentifier, pages = CONFIG.MAX_PAGES_PER_ROLE) {
    let allProfiles = [];
    console.log(`\n[DEEP SCAN] Harvesting ${pages} pages for: ${title}...`);

    for (let page = 1; page <= pages; page++) {
        const payload = {
            filters: {
                op: "and",
                conditions: [
                    { column: "current_employers.title", type: "(.)", value: title },
                    { column: "years_of_experience_raw", type: ">", value: 3 }
                ]
            },
            limit: 50,
            page: page // Request specific page
        };

        try {
            const response = await axios.post('https://api.crustdata.com/screener/persondb/search', payload, {
                headers: {
                    'Authorization': `Token ${CRUSTDATA_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            const profiles = response.data?.profiles || [];
            if (profiles.length === 0) break; // Stop if no more matches

            allProfiles = [...allProfiles, ...profiles];
            console.log(`   Page ${page}: +${profiles.length} profiles`);

            // Short delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 1000));
        } catch (err) {
            console.error(`   Page ${page} failed:`, err.message);
            break;
        }
    }

    return allProfiles.map(p => ({
        name: p.name,
        headline: p.headline || p.title,
        location: p.region,
        linkedin_url: p.linkedin_profile_url,
        skills: p.skills || [],
        category: roleIdentifier,
        scraped_at: new Date().toISOString()
    }));
}

async function runMassSeed() {
    if (!CRUSTDATA_KEY) {
        console.error("FATAL: CRUSTDATA_AUTH_TOKEN missing in .env.local");
        return;
    }

    if (!fs.existsSync(path.dirname(VAULT_PATH))) fs.mkdirSync(path.dirname(VAULT_PATH), { recursive: true });

    let vault = [];
    if (fs.existsSync(VAULT_PATH)) {
        vault = JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'));
    }

    // Standardize to 'linkedin_url' for the internal set
    const seenUrls = new Set(vault.map(p => p.linkedin_url).filter(Boolean));

    for (const [category, roles] of Object.entries(CATEGORIES)) {
        console.log(`\n=== STAGE: ${category} ===`);
        const limitedRoles = roles.slice(0, CONFIG.MAX_ROLES_PER_CATEGORY);
        for (const role of limitedRoles) {
            const results = await seedRole(role, category);

            // Filter for new, non-duplicate profiles
            const newProfiles = results.filter(p => p.linkedin_url && !seenUrls.has(p.linkedin_url));
            vault = [...vault, ...newProfiles];
            newProfiles.forEach(p => seenUrls.add(p.linkedin_url));

            // Incremental Save
            fs.writeFileSync(VAULT_PATH, JSON.stringify(vault, null, 2));
            console.log(`   [VAULT] Added ${newProfiles.length} new profiles. Total Vault Size: ${vault.length}`);

            // Rate limit safety
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`\nMISSION COMPLETE: Vault size is now ${vault.length} profiles.`);
}

runMassSeed();
