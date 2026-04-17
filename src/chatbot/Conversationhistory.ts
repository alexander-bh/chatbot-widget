// ─────────────────────────────────────────────────────────────────────────────
//  conversationHistory.ts
//  Gestión de historial estructurado persistente entre sesiones.
//  Usa localStorage para sobrevivir reinicios de pestaña/navegador.
// ─────────────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "bot";

export interface HistoryMessage {
    id: string;           // UUID v4
    role: MessageRole;
    text: string;         // Texto plano (sin HTML)
    html?: string;        // HTML renderizado del bot (opcional)
    timestamp: number;    // Date.now()
    nodeId?: string;      // ID del nodo del flow que generó este mensaje
}

export interface ConversationSession {
    sessionId: string;           // UUID v4 — único por conversación
    publicId: string;            // ID del chatbot
    visitorId: string;           // ID del visitante (de localStorage "chat_visitor_id")
    startedAt: number;           // timestamp de inicio
    lastActivityAt: number;      // timestamp de última actividad
    messages: HistoryMessage[];
    engineState?: {              // snapshot del engine al cerrar/pausar
        nodeId: string | undefined;
        variables: Record<string, string>;
        history: { node_id: string; question?: string; answer: string }[];
    };
    completed: boolean;          // true si la conversación llegó a end_conversation
    lang: string;                // idioma activo al momento de guardar
}

// ── Límites de retención ──────────────────────────────────────────────────────
const MAX_SESSIONS_PER_VISITOR = 10;   // cuántas sesiones se guardan por visitante
const MAX_MESSAGES_PER_SESSION = 200;  // techo de mensajes por sesión

// ── Claves de localStorage ────────────────────────────────────────────────────
const storageKey = (publicId: string, visitorId: string) =>
    `chatbot_history_${publicId}_${visitorId}`;

const activeSessionKey = (publicId: string, visitorId: string) =>
    `chatbot_active_session_${publicId}_${visitorId}`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function uuid(): string {
    return crypto.randomUUID();
}

function readSessions(publicId: string, visitorId: string): ConversationSession[] {
    try {
        const raw = localStorage.getItem(storageKey(publicId, visitorId));
        return raw ? (JSON.parse(raw) as ConversationSession[]) : [];
    } catch {
        return [];
    }
}

function writeSessions(
    publicId: string,
    visitorId: string,
    sessions: ConversationSession[]
): void {
    try {
        // Recortar si supera el máximo
        const trimmed = sessions.slice(-MAX_SESSIONS_PER_VISITOR);
        localStorage.setItem(storageKey(publicId, visitorId), JSON.stringify(trimmed));
    } catch {
        // localStorage lleno: eliminar la sesión más antigua e intentar de nuevo
        try {
            const trimmed = sessions.slice(-Math.floor(MAX_SESSIONS_PER_VISITOR / 2));
            localStorage.setItem(storageKey(publicId, visitorId), JSON.stringify(trimmed));
        } catch {
            /* ignorar */
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  API pública
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crea una nueva sesión vacía y la marca como activa.
 * No toca las sesiones anteriores.
 */
export function createSession(
    publicId: string,
    visitorId: string,
    lang:  string = "es" 
): ConversationSession {
    const session: ConversationSession = {
        sessionId: uuid(),
        publicId,
        visitorId,
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
        messages: [],
        completed: false,
        lang,
    };

    const sessions = readSessions(publicId, visitorId);
    sessions.push(session);
    writeSessions(publicId, visitorId, sessions);

    // Marcar como activa
    localStorage.setItem(activeSessionKey(publicId, visitorId), session.sessionId);

    return session;
}

/**
 * Devuelve la sesión activa (última no completada) o null si no existe.
 */
export function getActiveSession(
    publicId: string,
    visitorId: string
): ConversationSession | null {
    const activeId = localStorage.getItem(activeSessionKey(publicId, visitorId));
    if (!activeId) return null;

    const sessions = readSessions(publicId, visitorId);
    return sessions.find((s) => s.sessionId === activeId) ?? null;
}

/**
 * Devuelve todas las sesiones guardadas para este visitante/chatbot.
 */
export function getAllSessions(
    publicId: string,
    visitorId: string
): ConversationSession[] {
    return readSessions(publicId, visitorId);
}

/**
 * Agrega un mensaje a la sesión activa y persiste.
 * Retorna el HistoryMessage creado (para uso interno si se necesita su id).
 */
export function appendToSession(
    publicId: string,
    visitorId: string,
    role: MessageRole,
    text: string,
    options?: { html?: string; nodeId?: string }
): HistoryMessage | null {
    const sessions = readSessions(publicId, visitorId);
    const activeId = localStorage.getItem(activeSessionKey(publicId, visitorId));
    const idx = sessions.findIndex((s) => s.sessionId === activeId);
    if (idx === -1) return null;

    // Deduplicación: evitar agregar el mismo texto del mismo rol en el mismo segundo
    const last = sessions[idx].messages.at(-1);
    if (
        last &&
        last.role === role &&
        last.text === text &&
        Date.now() - last.timestamp < 500
    ) {
        return last; // duplicado, devolver el existente
    }

    // Techo de mensajes
    if (sessions[idx].messages.length >= MAX_MESSAGES_PER_SESSION) {
        sessions[idx].messages.shift(); // eliminar el más antiguo
    }

    const msg: HistoryMessage = {
        id: uuid(),
        role,
        text,
        html: options?.html,
        nodeId: options?.nodeId,
        timestamp: Date.now(),
    };

    sessions[idx].messages.push(msg);
    sessions[idx].lastActivityAt = Date.now();
    writeSessions(publicId, visitorId, sessions);

    return msg;
}

/**
 * Guarda el estado del engine en la sesión activa.
 * Llamar tras cada interacción importante.
 */
export function saveEngineState(
    publicId: string,
    visitorId: string,
    engineState: ConversationSession["engineState"]
): void {
    const sessions = readSessions(publicId, visitorId);
    const activeId = localStorage.getItem(activeSessionKey(publicId, visitorId));
    const idx = sessions.findIndex((s) => s.sessionId === activeId);
    if (idx === -1) return;

    sessions[idx].engineState = engineState;
    sessions[idx].lastActivityAt = Date.now();
    writeSessions(publicId, visitorId, sessions);
}

/**
 * Marca la sesión activa como completada.
 */
export function completeSession(publicId: string, visitorId: string): void {
    const sessions = readSessions(publicId, visitorId);
    const activeId = localStorage.getItem(activeSessionKey(publicId, visitorId));
    const idx = sessions.findIndex((s) => s.sessionId === activeId);
    if (idx === -1) return;

    sessions[idx].completed = true;
    sessions[idx].lastActivityAt = Date.now();
    writeSessions(publicId, visitorId, sessions);
}

/**
 * Elimina SOLO la sesión activa del localStorage y la marca de sesión activa.
 * Las sesiones anteriores se conservan.
 */
export function clearActiveSession(publicId: string, visitorId: string): void {
    const activeId = localStorage.getItem(activeSessionKey(publicId, visitorId));
    if (!activeId) return;

    const sessions = readSessions(publicId, visitorId);
    const filtered = sessions.filter((s) => s.sessionId !== activeId);
    writeSessions(publicId, visitorId, filtered);
    localStorage.removeItem(activeSessionKey(publicId, visitorId));
}

/**
 * Elimina TODO el historial del visitante (todas las sesiones).
 */
export function clearAllHistory(publicId: string, visitorId: string): void {
    localStorage.removeItem(storageKey(publicId, visitorId));
    localStorage.removeItem(activeSessionKey(publicId, visitorId));
}

/**
 * Exporta la sesión activa como JSON descargable.
 * Llama a esta función desde un botón "Descargar historial".
 */
export function downloadActiveSession(
    publicId: string,
    visitorId: string,
    chatbotName = "Chatbot"
): void {
    const session = getActiveSession(publicId, visitorId);
    if (!session) return;

    const exportData = {
        chatbot: chatbotName,
        sessionId: session.sessionId,
        visitorId: session.visitorId,
        startedAt: new Date(session.startedAt).toISOString(),
        lastActivityAt: new Date(session.lastActivityAt).toISOString(),
        lang: session.lang,
        completed: session.completed,
        messages: session.messages.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.text,
            timestamp: new Date(m.timestamp).toISOString(),
        })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-${chatbotName.replace(/\s+/g, "-")}-${session.sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Importa un historial desde un JSON previamente descargado.
 * Restaura la sesión tal como estaba (sin completar) y la marca como activa.
 * Retorna la sesión importada o null si el JSON es inválido.
 */
export function importSession(
    publicId: string,
    visitorId: string,
    jsonString: string
): ConversationSession | null {
    try {
        const data = JSON.parse(jsonString);

        // Validación mínima
        if (
            typeof data.sessionId !== "string" ||
            !Array.isArray(data.messages)
        ) {
            return null;
        }

        const session: ConversationSession = {
            sessionId: data.sessionId,
            publicId,
            visitorId,
            startedAt: data.startedAt ? new Date(data.startedAt).getTime() : Date.now(),
            lastActivityAt: Date.now(),
            messages: (data.messages as any[]).map((m) => ({
                id: m.id ?? uuid(),
                role: m.role as MessageRole,
                text: m.text ?? "",
                timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
            })),
            completed: false,    // al importar, se considera que puede continuar
            lang: data.lang ?? "es",
        };

        const sessions = readSessions(publicId, visitorId);

        // Si ya existe una sesión con este ID, reemplazarla
        const existingIdx = sessions.findIndex((s) => s.sessionId === session.sessionId);
        if (existingIdx !== -1) {
            sessions[existingIdx] = session;
        } else {
            sessions.push(session);
        }

        writeSessions(publicId, visitorId, sessions);
        localStorage.setItem(activeSessionKey(publicId, visitorId), session.sessionId);

        return session;
    } catch {
        return null;
    }
}

/**
 * Verifica si hay una sesión activa con mensajes (para saber si restaurar).
 */
export function hasResumableSession(
    publicId: string,
    visitorId: string
): boolean {
    const session = getActiveSession(publicId, visitorId);
    return !!session && session.messages.length > 0 && !session.completed;
}