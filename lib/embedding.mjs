import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline, env } from '@xenova/transformers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
env.cacheDir = path.join(root, '.cache', 'models'); 

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSION = Number(process.env.EMBEDDING_DIMENSION ?? 384);
export const EMBEDDING_MODEL_VERSION = 'onnx-int8-quantized/transformers.js-2.17.2';
export const DISTANCE_METRIC = 'cosine';

let extractorPromise;
function getExtractor() {
  extractorPromise ??= pipeline('feature-extraction', EMBEDDING_MODEL, { quantized: true });
  return extractorPromise;
}

/** Embeds an array of non-empty strings */
export async function embedTexts(texts, { batchSize = 16 } = {}) {
  if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string' || !t.trim())) {
    throw new TypeError('embedTexts expects an array of non-empty strings');
  }
  const extractor = await getExtractor();
  const out = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
    const [rows, dim] = tensor.dims;
    if (dim !== EMBEDDING_DIMENSION) {
      throw new Error(`Model produced ${dim} dimensions but EMBEDDING_DIMENSION is ${EMBEDDING_DIMENSION}`);
    }
    for (let r = 0; r < rows; r++) out.push(Array.from(tensor.data.slice(r * dim, (r + 1) * dim)));
  }
  return out;
}

export async function embedText(text) {
  return (await embedTexts([text]))[0];
}

/** pgvector text literal */
export const toVectorLiteral = (vector) => `[${vector.join(',')}]`;


export async function assertModelRegistered(db) {
  try {
    await db.query(
      `INSERT INTO embedding_model_info (model_name, model_version, dimension, distance_metric)
       VALUES ($1, $2, $3, $4) ON CONFLICT (singleton) DO NOTHING`,
      [EMBEDDING_MODEL, EMBEDDING_MODEL_VERSION, EMBEDDING_DIMENSION, DISTANCE_METRIC]
    );
  } catch (e) {
    if (e.code === '42P01') throw new Error('embedding_model_info is missing. Run: npm run db:pg:migrate');
    throw e;
  }
  const { rows: [reg] } = await db.query(
    'SELECT model_name, model_version, dimension, distance_metric FROM embedding_model_info'
  );
  const mismatch =
    reg.model_name !== EMBEDDING_MODEL ||
    reg.model_version !== EMBEDDING_MODEL_VERSION ||
    reg.dimension !== EMBEDDING_DIMENSION ||
    reg.distance_metric !== DISTANCE_METRIC;
  if (mismatch) {
    throw new Error(
      `Embedding model mismatch. Registered: ${reg.model_name} / ${reg.model_version} / ${reg.dimension} / ${reg.distance_metric}. ` +
      `Running: ${EMBEDDING_MODEL} / ${EMBEDDING_MODEL_VERSION} / ${EMBEDDING_DIMENSION} / ${DISTANCE_METRIC}. ` +
      'Mixing models in one column gives meaningless search results.'
    );
  }
  const { rows: [col] } = await db.query(
    `SELECT format_type(atttypid, atttypmod) AS type FROM pg_attribute
     WHERE attrelid = 'care_document_chunk'::regclass AND attname = 'embedding'`
  );
  if (col.type !== `vector(${EMBEDDING_DIMENSION})`) {
    throw new Error(`Column care_document_chunk.embedding is ${col.type}, expected vector(${EMBEDDING_DIMENSION})`);
  }
}