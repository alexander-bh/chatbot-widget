import type { BundleNode } from "./chatbot-types";

// ── Idiomas soportados ────────────────────────────────────────────────────────
export const SUPPORTED_LANGS: Record<string, string> = {
    es: "Español",
    en: "English",
    fr: "Français",
    pt: "Português",
    de: "Deutsch",
    it: "Italiano",
};

export function detectBrowserLang(): string {
    const raw = navigator.language ?? "es";
    const code = raw.split("-")[0].toLowerCase();
    return SUPPORTED_LANGS[code] ? code : "es";
}

// ── Cache en memoria (vive mientras la pestaña está abierta) ──────────────────
// Clave: `${publicId}__${lang}`  →  BundleNode[] traducidos
const memoryCache = new Map<string, BundleNode[]>();

// ── In-flight dedup ───────────────────────────────────────────────────────────
// Evita que dos llamadas simultáneas disparen dos HTTP requests idénticos.
// Clave idéntica a memoryCache.
const inFlight = new Map<string, Promise<BundleNode[]>>();

// ── Rate-limit state ──────────────────────────────────────────────────────────
let rateLimitedUntil = 0; // timestamp ms; 0 = libre

// ── sessionStorage helpers ────────────────────────────────────────────────────
const SS = {
    key: (publicId: string, lang: string) =>
        `chatbot_bundle_${publicId}_${lang}`,

    get(publicId: string, lang: string): BundleNode[] | null {
        try {
            const raw = sessionStorage.getItem(this.key(publicId, lang));
            return raw ? (JSON.parse(raw) as BundleNode[]) : null;
        } catch {
            return null;
        }
    },

    set(publicId: string, lang: string, nodes: BundleNode[]): void {
        try {
            sessionStorage.setItem(this.key(publicId, lang), JSON.stringify(nodes));
        } catch {
            // sessionStorage lleno → ignorar; la memoria sigue disponible
        }
    },
};

// ── Extracción de textos ──────────────────────────────────────────────────────
interface TextItem {
    id: string;
    field: string;
    text: string;
}

function extractTexts(nodes: BundleNode[]): TextItem[] {
    const items: TextItem[] = [];

    for (const node of nodes) {
        if (node.content?.trim())
            items.push({ id: node._id, field: "content", text: node.content });

        node.options?.forEach((opt, i) => {
            if (opt.label?.trim())
                items.push({ id: node._id, field: `options.${i}.label`, text: opt.label });
        });

        node.policy?.forEach((p, i) => {
            if (p.label?.trim())
                items.push({ id: node._id, field: `policy.${i}.label`, text: p.label });
        });

        node.link_actions?.forEach((la, i) => {
            if (la.title?.trim())
                items.push({ id: node._id, field: `link_actions.${i}.title`, text: la.title });
        });
    }

    return items;
}

// ── Aplicar traducciones (inmutable) ─────────────────────────────────────────
function applyTranslations(
    nodes: BundleNode[],
    translations: Record<string, string>
): BundleNode[] {
    return nodes.map((node) => {
        const n = { ...node };

        const c = translations[`${node._id}::content`];
        if (c !== undefined) n.content = c;

        if (n.options) {
            n.options = n.options.map((opt, i) => {
                const v = translations[`${node._id}::options.${i}.label`];
                return v !== undefined ? { ...opt, label: v } : opt;
            });
        }

        if (n.policy) {
            n.policy = n.policy.map((p, i) => {
                const v = translations[`${node._id}::policy.${i}.label`];
                return v !== undefined ? { ...p, label: v } : p;
            });
        }

        if (n.link_actions) {
            n.link_actions = n.link_actions.map((la, i) => {
                const v = translations[`${node._id}::link_actions.${i}.title`];
                return v !== undefined ? { ...la, title: v } : la;
            });
        }

        return n;
    });
}

// ── Parsear respuesta del LLM ─────────────────────────────────────────────────
function parseTranslationResponse(rawText: string): Record<string, string> {
    const translations: Record<string, string> = {};
    for (const line of rawText.split("\n")) {
        const sep = line.indexOf("|||");
        if (sep === -1) continue;
        const key = line.slice(0, sep).trim();
        const value = line.slice(sep + 3).trim();
        if (key && value) translations[key] = value;
    }
    return translations;
}

// ── Función pública principal ─────────────────────────────────────────────────
/**
 * Traduce todos los nodos de un bundle en una sola petición HTTP.
 *
 * @param nodes      Nodos a traducir (idioma original)
 * @param targetLang Código destino ("en", "fr", …)
 * @param sourceLang Código origen  ("es" por defecto)
 * @param apiBase    Base URL del backend
 * @param publicId   ID del chatbot (para el cache por instancia)
 */
export async function translateNodes(
    nodes: BundleNode[],
    targetLang: string,
    sourceLang = "es",
    apiBase: string,
    publicId = "default"
): Promise<BundleNode[]> {
    // ① Idioma idéntico → no hay nada que hacer
    if (targetLang === sourceLang) return nodes;

    const cacheKey = `${publicId}__${targetLang}`;

    // ② Memoria (más rápida que sessionStorage)
    const fromMem = memoryCache.get(cacheKey);
    if (fromMem) return fromMem;

    // ③ sessionStorage (sobrevive re-renders / cambios de estado)
    const fromSS = SS.get(publicId, targetLang);
    if (fromSS) {
        memoryCache.set(cacheKey, fromSS); // promover a memoria
        return fromSS;
    }

    // ④ ¿Hay un request idéntico ya en vuelo? → encolar en la misma promesa
    const existing = inFlight.get(cacheKey);
    if (existing) return existing;

    // ⑤ Rate-limit activo → fallback inmediato sin petición
    if (Date.now() < rateLimitedUntil) {
        const waitSec = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
        console.warn(
            `⚠️ Traducción pausada por rate-limit. Reintento en ~${waitSec}s. Usando idioma original.`
        );
        return nodes;
    }

    // ⑥ Construir y lanzar la petición (UNA sola para todo el bundle)
    const promise = (async (): Promise<BundleNode[]> => {
        const items = extractTexts(nodes);
        if (!items.length) return nodes;

        const payload = items
            .map((item) => `${item.id}::${item.field}|||${item.text}`)
            .join("\n");

        const prompt =
            `Translate the following UI chatbot texts from ${sourceLang} to ${targetLang}.\n` +
            `Rules:\n` +
            `- Preserve {{variable}} placeholders exactly as-is\n` +
            `- Preserve HTML tags if present\n` +
            `- Return ONLY translations in this exact format: ID::field|||translated text\n` +
            `- One translation per line, same order\n` +
            `- No explanations or extra text\n\n` +
            `Texts to translate:\n${payload}`;

        try {
            // En la función translateNodes, reemplaza el bloque del fetch:
            const response = await fetch(
                `${apiBase}/api/chatbot-integration/translate`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        messages: [{ role: "user", content: prompt }],
                        publicId,    // ← nuevo: permite cache por instancia en el backend
                        targetLang,  // ← nuevo: permite cache por idioma en el backend
                    }),
                }
            );

            // ── 429: registrar back-off y hacer fallback ──────────────────────────
            if (response.status === 429) {
                const retryAfter = response.headers.get("Retry-After");
                const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
                rateLimitedUntil = Date.now() + waitMs;
                console.warn(
                    `⚠️ 429 Too Many Requests. Traducción bloqueada por ${waitMs / 1000}s.`
                );
                return nodes; // fallback al idioma original
            }

            if (!response.ok) {
                console.warn(`⚠️ API de traducción respondió ${response.status}. Usando idioma original.`);
                return nodes;
            }

            const data = await response.json();
            const rawText: string =
                data.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";

            const translations = parseTranslationResponse(rawText);
            const translated = applyTranslations(nodes, translations);

            // Guardar en ambas capas de cache
            memoryCache.set(cacheKey, translated);
            SS.set(publicId, targetLang, translated);

            return translated;
        } catch (err) {
            console.error("❌ Error de red al traducir:", err);
            return nodes; // fallback seguro
        } finally {
            // Limpiar in-flight siempre (éxito o fallo)
            inFlight.delete(cacheKey);
        }
    })();

    inFlight.set(cacheKey, promise);
    return promise;
}


/**
 * Invalida el cache de traducciones para un chatbot específico.
 * Útil si el bundle de nodos cambia en el servidor.
 */
export function invalidateTranslationCache(publicId: string): void {
    for (const lang of Object.keys(SUPPORTED_LANGS)) {
        const key = `${publicId}__${lang}`;
        memoryCache.delete(key);
        try {
            sessionStorage.removeItem(SS.key(publicId, lang));
        } catch {
            /* ignorar */
        }
    }
}