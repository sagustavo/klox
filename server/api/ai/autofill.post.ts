import { GoogleGenAI } from '@google/genai';
import {
  heuristicCatalogPredict,
  validateAiPrediction,
  type AiAutofillPrediction,
} from '~/domain/recall';
import type { Project, ProjectTag } from '~/domain/types';

interface AutofillRequestBody {
  description: string;
  projects: Project[];
  tags: ProjectTag[];
  isDemo?: boolean;
}

// Per-user in-memory sliding-window rate limiter (15 requests / 60s per user)
const rateBuckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 15;

function checkRateLimit(userKey: string): boolean {
  const now = Date.now();
  const prev = (rateBuckets.get(userKey) ?? []).filter((ts) => now - ts < WINDOW_MS);
  if (prev.length >= MAX_REQUESTS_PER_WINDOW) {
    rateBuckets.set(userKey, prev);
    return false;
  }
  prev.push(now);
  rateBuckets.set(userKey, prev);
  return true;
}

async function verifyBearerTokenIfConfigured(
  authHeader: string | undefined,
  projectId: string
): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const idToken = authHeader.slice('Bearer '.length).trim();
  if (!idToken) return null;

  try {
    const { getApps, initializeApp } = await import('firebase-admin/app');
    const { getAuth } = await import('firebase-admin/auth');
    const app = getApps()[0] ?? initializeApp(projectId ? { projectId } : undefined);
    const decoded = await getAuth(app).verifyIdToken(idToken);
    return decoded.uid;
  } catch (err) {
    console.warn('[Klox /api/ai/autofill auth verify failed]', err);
    return null;
  }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<AutofillRequestBody>(event);
  if (!body?.description?.trim() || !Array.isArray(body.projects)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'AI_INVALID_INPUT',
      data: { code: 'AI_INVALID_INPUT' },
    });
  }

  const config = useRuntimeConfig(event);
  const authHeader = getHeader(event, 'authorization');
  const firebaseProjectId = String(config.public?.firebaseProjectId || '');
  const firebaseProjectConfigured = Boolean(firebaseProjectId);

  let rateKey = 'demo-anonymous';
  if (firebaseProjectConfigured && !body.isDemo) {
    const uid = await verifyBearerTokenIfConfigured(authHeader, firebaseProjectId);
    if (!uid) {
      throw createError({
        statusCode: 401,
        statusMessage: 'AUTH_INVALID',
        data: { code: 'AUTH_INVALID' },
      });
    }
    rateKey = uid;
  }

  if (!checkRateLimit(rateKey)) {
    throw createError({
      statusCode: 429,
      statusMessage: 'AI_RATE_LIMITED',
      data: { code: 'AI_RATE_LIMITED' },
    });
  }

  const apiKey = String(config.geminiApiKey || '');
  const modelId = String(config.geminiModel || 'gemini-3.8-flash');

  // If no Gemini API key is configured on the host, return the deterministic heuristic prediction
  // so local evaluation and Demo Mode work seamlessly.
  if (!apiKey) {
    const fallback = heuristicCatalogPredict({
      description: body.description,
      projects: body.projects,
      tags: body.tags ?? [],
    });
    return {
      ...fallback,
      provider: 'heuristic',
    };
  }

  const catalogPayload = body.projects.map((p) => ({
    projectId: p.id,
    projectName: p.name,
    isBillableDefault: p.isBillableDefault,
    allowedTags: (body.tags ?? [])
      .filter((t) => t.projectId === p.id)
      .map((t) => ({ tagId: t.id, tagName: t.name })),
  }));

  const prompt = [
    'You are Klox AI, a high-precision time-tracking classifier.',
    'Given the user task description (which may be in English, Portuguese, or any language) and their catalog of Projects and Project-Scoped Tags, select:',
    '1. The most appropriate `projectId` from the catalog.',
    '2. Zero or more `tagIds` strictly from that selected project `allowedTags` list.',
    '3. Whether `isBillable` should be true or false (defaulting to the project `isBillableDefault` unless the task clearly indicates otherwise).',
    '',
    `Task description: ${JSON.stringify(body.description.trim())}`,
    `Catalog JSON: ${JSON.stringify(catalogPayload)}`,
  ].join('\n');

  try {
    const client = new GoogleGenAI({ apiKey });
    const interaction = await client.interactions.create({
      model: modelId,
      input: prompt,
      store: false,
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: {
          type: 'object',
          properties: {
            projectId: { type: 'string' },
            tagIds: {
              type: 'array',
              items: { type: 'string' },
            },
            isBillable: { type: 'boolean' },
          },
          required: ['projectId', 'tagIds', 'isBillable'],
        },
      },
    });

    const rawText = interaction.output_text || '{}';
    const parsed = JSON.parse(rawText) as Partial<AiAutofillPrediction>;

    // Server-side domain invariant re-validation (ADR-0004):
    const validated = validateAiPrediction({
      raw: parsed,
      projects: body.projects,
      tags: body.tags ?? [],
    });

    return {
      ...validated,
      provider: 'gemini',
    };
  } catch (err) {
    console.error('[Klox /api/ai/autofill Gemini error]', err);
    throw createError({
      statusCode: 503,
      statusMessage: 'AI_UNAVAILABLE',
      data: { code: 'AI_UNAVAILABLE' },
    });
  }
});
