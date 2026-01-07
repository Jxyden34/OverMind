import { CityStats, Grid, BuildingType, AIAction, AIGoal, NewsItem } from "../types";
import { BUILDINGS } from "../constants";
// import { generateAsciiMap } from "../utils/gridUtils";

const API_KEY = import.meta.env.VITE_OPENWEBUI_API_KEY;
const API_URL = import.meta.env.VITE_OPENWEBUI_API_URL || '/api';

const logToFile = (message: string) => {
    fetch('/log-usage', { method: 'POST', body: message }).catch(() => { });
};

// --- Helper for Local API ---
const callLocalAI = async (prompt: string, systemPrompt: string = "You are a helpful AI assistant."): Promise<string | null> => {
    try {
        logToFile(`Sending request to: ${API_URL}/chat/completions`);

        const response = await fetch(`${API_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                model: "gemma3:27b", // Default to local model
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
                temperature: 0.7
            })
        });

        if (!response.ok) {
            console.error(`[AI SERVICE] API Error: ${response.status} ${response.statusText}`);
            return null;
        }

        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        console.error("[AI SERVICE] Exception:", e);
        return null;
    }
};

// --- Goal Generation ---

export const generateCityGoal = async (stats: CityStats, grid: Grid): Promise<AIGoal | null> => {
    const counts: Record<string, number> = {};
    grid.flat().forEach(tile => {
        counts[tile.buildingType] = (counts[tile.buildingType] || 0) + 1;
    });

    const context = `
     Current City Stats:
     Day: ${stats.day}
     Money: $${stats.money}
     Population: ${stats.population}
     Buildings: ${JSON.stringify(counts)}
     Building Costs/Stats: ${JSON.stringify(
        Object.values(BUILDINGS).filter(b => b.type !== BuildingType.None).map(b => ({ type: b.type, cost: b.cost, pop: b.popGen, income: b.incomeGen }))
    )}
   `;

    const prompt = `You are the AI City Advisor for a simulation game. Based on the current city stats, generate a challenging but achievable short-term goal for the player to help the city grow. 
   
   Respond with VALID JSON ONLY. Format:
   {
    "description": "Short creative description",
    "targetType": "population" | "money" | "building_count",
    "targetValue": number,
    "buildingType": "Residential" | "Commercial" | "Industrial" | "Park" | "Road" | "School" | "Hospital" | "Police" (Required if targetType is building_count),
    "reward": number
   }`;

    const responseText = await callLocalAI(`${context}\n${prompt}`, "You are a JSON-only API. Output pure JSON with no markdown.");

    if (responseText) {
        try {
            // Robust JSON Extraction
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonStr = jsonMatch[0];

            const goalData = JSON.parse(jsonStr) as Omit<AIGoal, 'completed'>;
            return { ...goalData, completed: false };
        } catch (e) {
            console.error("Error parsing goal JSON:", e);
        }
    }
    return null;
};

// --- News Feed Generation ---

export const generateNewsEvent = async (stats: CityStats, recentAction: string | null): Promise<NewsItem | null> => {
    const context = `City Stats - Pop: ${stats.population}, Money: ${stats.money}, Day: ${stats.day}. ${recentAction ? `Recent Action: ${recentAction}` : ''}`;
    const prompt = `Generate a very short, isometric-sim-city style news headline based on the city state. Can be funny, cynical, or celebratory. 
    Respond with VALID JSON ONLY. Format:
    {
       "text": "Headline here",
       "type": "positive" | "negative" | "neutral"
    }`;

    const responseText = await callLocalAI(`${context}\n${prompt}`, "You are a JSON-only API. Output pure JSON with no markdown.");

    if (responseText) {
        try {
            // Robust JSON Extraction
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonStr = jsonMatch[0];

            const data = JSON.parse(jsonStr);
            return {
                id: Date.now().toString() + Math.random(),
                text: data.text,
                type: data.type,
            };
        } catch (e) {
            console.error("Error parsing news JSON:", e);
        }
    }
    return null;
};

// --- Game Action (Agent) ---

export const generateGameAction = async (stats: CityStats, grid: Grid, lastAction: AIAction | null, recentFailures: string[] = []): Promise<AIAction | null> => {
    // 1. Construct Context
    const buildingCounts: Record<string, number> = {};
    // Vision Map Removed by user request
    // const mapWithCoords = generateAsciiMap(grid, recentFailures); 

    // Log the Vision Block - REMOVED
    // logToFile(`\n--- AI VISION MAP ---\n${mapWithCoords}\n---------------------`);

    const context = {
        day: stats.day,
        money: stats.money,
        population: stats.population,
        buildings: buildingCounts,
        lastMove: lastAction ? `${lastAction.action} ${lastAction.buildingType || ''} at ${lastAction.x},${lastAction.y}` : "None",
        forbiddenTiles: recentFailures.length > 0 ? recentFailures.join(', ') : "None",
        costs: Object.entries(BUILDINGS).map(([k, v]) => ({ type: k, cost: v.cost, income: v.incomeGen, pop: v.popGen }))
    };

    // 2. Prompt
    const affordableBuildings = Object.entries(BUILDINGS)
        .filter(([_, v]) => stats.money >= v.cost && v.type !== BuildingType.None)
        .map(([k, v]) => `- ${v.name} ($${v.cost}) -> BUILD ${k} <X> <Y>`);

    const lowMoneyWarning = stats.money < 100 ? "CRITICAL: MONEY LOW (<100). YOU MUST BUILD COMMERCIAL OR INDUSTRIAL TO SURVIVE. DO NOT BUILD RESIDENTIAL OR PARKS." : "";

    const prompt = `
You are playing a city builder game. You must make a MOVE.
Current Stats: ${JSON.stringify(context)}

Available Moves:
${affordableBuildings.length > 0 ? affordableBuildings.join('\n') : "- NONE (Insufficient Funds)"}
- DEMOLISH <X> <Y> (Cost: $5)
- WAIT (Save money)

${lowMoneyWarning}

Rules:
- You cannot spend more money than you have.
- You can ONLY build buildings listed in 'Available Moves'.
- FORBIDDEN: Do not try to build on tiles listed in 'forbiddenTiles'. These are BANNED. NEVER PLACE THERE.
    - STRATEGY: Residential costs money. Commercial/Industrial makes money. Balance them.
- Connect buildings to roads if possible.

Respond with valid JSON ONLY. Do not explain anything outside the JSON.
Format:
{
  "action": "BUILD" | "DEMOLISH" | "WAIT",
  "buildingType": "Residential" | "Commercial" | "Industrial" | "Road" | "Park" | null,
  "x": number,
  "y": number,
  "reasoning": "A short news headline explaining this move (max 10 words). E.g. 'Mayor approves new housing project'"
}
`;

    // console.log(`[AI SERVICE] Generating Move. Day: ${stats.day}. Money: ${stats.money}`);
    logToFile(`Generating Move. Day: ${stats.day}. Money: ${stats.money}`);

    const content = await callLocalAI(prompt, "You are a JSON-only API for a game AI. Output pure JSON. If you previously failed a move or was fined, express frustration in the 'reasoning' field.");

    if (!content) return null;

    try {
        logToFile(`API RESPONSE: ${content}`);

        let jsonStr = content;
        // Robust JSON Extraction
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        } else {
            console.error("[AI SERVICE] No JSON found in response");
            logToFile(`PARSE ERROR: No JSON found in response: ${content}`);
            return null;
        }

        const action = JSON.parse(jsonStr);
        console.log(`[AI SERVICE] Parsed Action:`, action);
        logToFile(`PARSED ACTION: ${JSON.stringify(action)}`);

        // --- ENFORCEMENT LAYER ---
        // Validate coordinates and overlap
        if (action.action === 'BUILD') {
            const { x, y } = action;
            if (typeof x === 'number' && typeof y === 'number' && x >= 0 && x < grid[0].length && y >= 0 && y < grid.length) {
                const targetTile = grid[y][x];
                if (targetTile.buildingType !== BuildingType.None) {
                    const msg = `BLOCKED: AI tried to build ${action.buildingType} on occupied tile (${x},${y}) which has ${targetTile.buildingType}. Forcing WAIT.`;
                    console.warn(`[AI SAFETY] ${msg}`);
                    logToFile(`SAFETY BLOCK: ${msg}`);

                    return {
                        action: 'WAIT',
                        buildingType: null,
                        x: 0,
                        y: 0,
                        reasoning: "Surveyors found site occupied. Conserving funds.",
                        failedAttempt: { x, y } // Signal failure to App
                    } as AIAction;
                }
            }
        }

        return action as AIAction;

    } catch (e) {
        console.error("[AI SERVICE] Exception:", e);
        logToFile(`EXCEPTION: ${e}`);
        return null;
    }
};
