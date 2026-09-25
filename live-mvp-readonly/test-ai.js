import 'dotenv/config';
import { generateChat } from './lib/ai.js';

async function testAI() {
    console.log("--- Testing AI Synthesis Connectivity ---");
    const system = "You are a professional HR assistant. Respond with valid JSON only.";
    const user = "Synthesize this into a professional requirement: 'CEO Ki chaatna and bad jokes'. Return JSON: { \"response\": \"...\" }";

    try {
        const result = await generateChat(system, user, true);
        console.log("SUCCESS! AI Response:");
        console.log(JSON.stringify(result, null, 2));
    } catch (err) {
        console.error("FAILURE! AI Error:");
        console.error(err);
    }
}

testAI();
