import { useEffect, useRef, useState, useCallback } from "react";
import { ChatbotEngine } from "./chatboteEngine";
import type { FlowBundle, BundleNode } from "./chatbot-types";
import {
    createSession,
    getActiveSession,
    appendToSession,
    saveEngineState as persistEngineState,
    completeSession,
    clearActiveSession,
    clearAllHistory,
    downloadActiveSession,
    importSession,
    hasResumableSession,
    type ConversationSession,
    type HistoryMessage,
} from "./Conversationhistory";

export interface ChatbotConfig {
    apiBase: string;
    publicId: string;
    originDomain: string;
    name: string;
    avatar: string;
    primaryColor: string;
    secondaryColor: string;
    inputPlaceholder: string;
    welcomeMessage?: string;
    welcomeDelay?: number;
    showWelcomeOnMobile?: boolean;
    position?: "bottom-right" | "bottom-left" | "middle-right";
}

interface MediaItem {
    type: "image" | "video";
    url: string;
}

interface LinkAction {
    type: "link" | "email" | "phone" | "whatsapp";
    title?: string;
    value: string;
    new_tab?: boolean;
}

const TEXT_INPUT_TYPES = ["question", "email", "phone", "number"];

const LINK_ICONS: Record<string, string> = {
    email: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`,
    whatsapp: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>`,
    phone: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.68h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.3a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 17.92z"/></svg>`,
    link: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
};

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers de identidad de visitante
// ─────────────────────────────────────────────────────────────────────────────
const getVisitorId = () => {
    const key = "chat_visitor_id";
    let id = localStorage.getItem(key);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(key, id);
    }
    return id;
};

const getTime = () =>
    new Date().toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
    });

const rgb = (hex: string) => {
    if (!/^#[\da-f]{6}$/i.test(hex)) return "37,99,235";
    return `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5), 16)}`;
};

const lighten = (hex: string, amount: number): string => {
    if (!/^#[\da-f]{6}$/i.test(hex)) return hex;
    const clamp = (n: number) => Math.min(255, Math.max(0, n));
    const r = clamp(parseInt(hex.slice(1, 3), 16) + amount);
    const g = clamp(parseInt(hex.slice(3, 5), 16) + amount);
    const b = clamp(parseInt(hex.slice(5), 16) + amount);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
};

const darken = (hex: string, amount: number): string => lighten(hex, -amount);

// ── Extrae texto plano de un string HTML ──────────────────────────────────────
const htmlToText = (html: string): string => {
    try {
        const tmp = document.createElement("div");
        tmp.innerHTML = html;
        return tmp.textContent ?? tmp.innerText ?? html;
    } catch {
        return html;
    }
};

const getDeviceType = (): "mobile" | "tablet" | "desktop" => {
    const ua = navigator.userAgent;
    if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
    if (/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua)) return "mobile";
    return "desktop";
};

export function useChatbot(config: ChatbotConfig | null) {
    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         1. REFS
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    const messagesRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const startedRef = useRef(false);
    const typingRef = useRef<HTMLDivElement | null>(null);
    const sendingRef = useRef(false);
    const isOpenRef = useRef(false);

    // ── Token de abort ─────────────────────────────────────────────────────────
    const abortRef = useRef<symbol>(Symbol("chatbot-init"));
    const engineRef = useRef<ChatbotEngine | null>(null);
    const bundleRef = useRef<FlowBundle | null>(null);

    // ── ID de visitante cacheado en ref para no recalcular ────────────────────
    const visitorIdRef = useRef<string>("");

    const MESSAGES_KEY = config ? `chatbot_dom_${config.publicId}` : null;

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         2. STATE
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    const [isOpen, setIsOpen] = useState(false);
    const didMountUnreadRef = useRef(false);
    const didMountWelcomeRef = useRef(false);
    const [connectionStatus, setConnectionStatus] = useState<
        "connected" | "error" | "connecting"
    >("connecting");
    const [unreadCount, setUnreadCount] = useState<number>(() => {
        if (!config) return 0;
        const saved = localStorage.getItem(`chatbot_unread_${config.publicId}`);
        return saved ? parseInt(saved, 10) : 0;
    });
    const [inputDisabled, setInputDisabled] = useState(true);
    const [sendDisabled, setSendDisabled] = useState(true);
    const [statusText, setStatusText] = useState("Conectando...");
    const [viewerOpen, setViewerOpen] = useState(false);
    const [viewerUrl, setViewerUrl] = useState("");
    const [viewerIsVideo, setViewerIsVideo] = useState(false);
    const [welcomeVisible, setWelcomeVisible] = useState<boolean>(() => {
        if (!config) return false;
        return sessionStorage.getItem(`chatbot_welcome_${config.publicId}`) === "true";
    });
    const [isRestarting, setIsRestarting] = useState(false);

    // ── Estado de historial expuesto al componente ────────────────────────────
    const [activeSession, setActiveSession] = useState<ConversationSession | null>(null);

    const appendServerErrorRef = useRef<() => void>(() => { });
    const loadBundleRef = useRef<
        ((token?: symbol) => Promise<FlowBundle | null>) | null
    >(null);
    const startRef = useRef<((token?: symbol) => Promise<void>) | null>(null);
    const errorMsgRef = useRef<HTMLDivElement | null>(null);
    const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const finishConversationRef = useRef<
        ((engine: ChatbotEngine, token: symbol) => Promise<void>) | null
    >(null);
    const processLocalRef = useRef<
        ((node: BundleNode, depth: number, token: symbol) => void) | null
    >(null);
    const sendRef = useRef<
        ((v?: string, token?: symbol) => Promise<void>) | null
    >(null);
    const appendMessageRef = useRef<
        (from: "user" | "bot", text: string, error?: boolean) => void
    >(() => { });
    const disableInputRef = useRef<() => void>(() => { });
    const engineReadyRef = useRef<Promise<void>>(Promise.resolve());
    const [shouldAutoStart, setShouldAutoStart] = useState(false);
    const resolveEngineRef = useRef<() => void>(() => { });


    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         3. CALLBACKS BÁSICOS
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    const clearRetryInterval = useCallback(() => {
        if (retryIntervalRef.current) {
            clearInterval(retryIntervalRef.current);
            retryIntervalRef.current = null;
        }
    }, []);

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            if (messagesRef.current) {
                messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
            }
        });
    }, []);

    const disableInput = useCallback(() => {
        setInputDisabled(true);
        setSendDisabled(true);
    }, []);

    const enableInput = useCallback(() => {
        setInputDisabled(false);
        setSendDisabled(false);
        setTimeout(() => inputRef.current?.focus(), 50);
    }, []);

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         4. EFFECTS
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    // Inicializar visitorId
    useEffect(() => {
        visitorIdRef.current = getVisitorId();
    }, []);

    // 4b — Restaurar sesión si existe en sessionStorage (DOM) o en historial persistente
    useEffect(() => {
        if (!config) return;

        visitorIdRef.current = getVisitorId();
        const vid = visitorIdRef.current;

        const savedDom = sessionStorage.getItem(`chatbot_dom_${config.publicId}`);

        if (savedDom) {
            // ── Ruta A: hay DOM guardado en sessionStorage (misma pestaña) ──────
            startedRef.current = true;
            setStatusText("En línea");
            setConnectionStatus("connected");

            engineReadyRef.current = new Promise((resolve) => {
                resolveEngineRef.current = resolve;
            });

            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = savedDom;
            const hasActiveOptions =
                tempDiv.querySelector('.inline-options[data-active="true"]') !== null;

            if (!hasActiveOptions) {
                setInputDisabled(false);
                setSendDisabled(false);
            }

            // Sincronizar activeSession con el historial persistente
            const session = getActiveSession(config.publicId, vid);
            if (session) setActiveSession(session);

            const initToken = abortRef.current;
            const timer = setTimeout(() => {
                loadBundleRef.current?.(initToken)?.then((bundle) => {
                    if (!bundle || initToken !== abortRef.current) return;
                    const engine = new ChatbotEngine(bundle);

                    // Intentar restaurar desde historial persistente primero
                    const activeSession = getActiveSession(config.publicId, vid);
                    const savedNodeRaw = sessionStorage.getItem(
                        `chatbot_node_${config.publicId}`
                    );

                    if (activeSession?.engineState) {
                        engine.restoreState(
                            activeSession.engineState.nodeId!,
                            activeSession.engineState.variables,
                            activeSession.engineState.history
                        );
                    } else if (savedNodeRaw) {
                        try {
                            const saved = JSON.parse(savedNodeRaw);
                            engine.restoreState(
                                saved.nodeId,
                                saved.variables,
                                saved.history
                            );
                        } catch { }
                    }

                    engineRef.current = engine;
                    resolveEngineRef.current();

                    if (!hasActiveOptions) {
                        setInputDisabled(false);
                        setSendDisabled(false);
                    }
                });
            }, 0);

            return () => clearTimeout(timer);
        }

        // ── Ruta B: no hay DOM en sessionStorage, pero ¿hay historial persistente? ──
        if (hasResumableSession(config.publicId, vid)) {
            // Hay una sesión previa: se ofrecerá restaurar en el start()
            // No hacemos nada aquí; el auto-start la detectará
        }
    }, [config?.publicId]);

    // 4g — Auto-start si no hay sesión en sessionStorage
    useEffect(() => {
        if (!config) return;
        if (startedRef.current) return;

        const savedMessages = sessionStorage.getItem(`chatbot_dom_${config.publicId}`);
        const needsStart = sessionStorage.getItem(`chatbot_needs_start_${config.publicId}`);

        // Si hay DOM guardado Y no es un restart interrumpido, la Ruta A del efecto 4b ya lo manejó
        if (savedMessages && !needsStart) return;

        // Evitar doble arranque con lock de 3 segundos
        const lockKey = `chatbot_starting_${config.publicId}`;
        const existing = sessionStorage.getItem(lockKey);
        if (existing && Date.now() - parseInt(existing) < 3000) return;
        sessionStorage.setItem(lockKey, String(Date.now()));

        startedRef.current = true;

        // Limpiar residuos de restart interrumpido
        if (needsStart) {
            sessionStorage.removeItem(`chatbot_needs_start_${config.publicId}`);
            sessionStorage.removeItem(`chatbot_dom_${config.publicId}`);
            sessionStorage.removeItem(`chatbot_node_${config.publicId}`);
            if (messagesRef.current) messagesRef.current.innerHTML = "";
        }

        setShouldAutoStart(true);

        return () => {
            sessionStorage.removeItem(lockKey);
        };
    }, [config?.publicId]);

    // 4h — Ejecutar start
    useEffect(() => {
        if (!shouldAutoStart) return;
        setShouldAutoStart(false);
        const bgToken = abortRef.current;
        setTimeout(() => {
            startRef.current?.(bgToken)?.finally(() => {
                // ✅ Limpiar bandera de needs_start si llegó hasta aquí
                if (config?.publicId) {
                    sessionStorage.removeItem(`chatbot_needs_start_${config.publicId}`);
                }
            });
        }, 0);
    }, [shouldAutoStart, config?.publicId]);

    // 4c. Aplicar theme CSS vars
    useEffect(() => {
        if (!config) return;
        const p = config.primaryColor;
        const s = config.secondaryColor;
        document.documentElement.style.setProperty("--chat-primary", p);
        document.documentElement.style.setProperty("--chat-primary-light", lighten(p, 28));
        document.documentElement.style.setProperty("--chat-primary-dark", darken(p, 22));
        document.documentElement.style.setProperty("--chat-primary-rgb", rgb(p));
        document.documentElement.style.setProperty("--chat-secondary", s);
    }, [config?.primaryColor, config?.secondaryColor]);

    // 4d. Restaurar HTML del DOM
    useEffect(() => {
        if (!MESSAGES_KEY || !messagesRef.current) return;
        try {
            const saved = sessionStorage.getItem(MESSAGES_KEY);
            if (saved) {
                messagesRef.current.innerHTML = saved;

                typingRef.current = null;
                const staleTyping = messagesRef.current.querySelector('.msg.bot.typing');
                if (staleTyping) staleTyping.remove();

                const allOptionGroups =
                    messagesRef.current.querySelectorAll<HTMLDivElement>(".inline-options");

                allOptionGroups.forEach((group) => {
                    const isActive = group.dataset.active === "true";
                    const buttons = group.querySelectorAll<HTMLButtonElement>("button");

                    if (isActive) {
                        buttons.forEach((btn) => {
                            const fresh = btn.cloneNode(true) as HTMLButtonElement;
                            fresh.disabled = false;
                            fresh.style.opacity = "";
                            fresh.style.cursor = "";
                            fresh.style.pointerEvents = "";
                            btn.replaceWith(fresh);

                            fresh.addEventListener("click", async () => {
                                delete group.dataset.active;
                                group
                                    .querySelectorAll<HTMLButtonElement>("button")
                                    .forEach((b) => {
                                        b.disabled = true;
                                        b.style.opacity = "0.5";
                                        b.style.cursor = "not-allowed";
                                        b.style.pointerEvents = "none";
                                    });
                                const label = fresh.textContent ?? "";
                                const value = fresh.hasAttribute("data-value")
                                    ? fresh.dataset.value!
                                    : label;
                                appendMessageRef.current("user", label);
                                disableInputRef.current();
                                await engineReadyRef.current;
                                if (sendRef.current) await sendRef.current(value);
                            });
                        });
                    } else {
                        buttons.forEach((btn) => {
                            btn.disabled = true;
                            btn.style.opacity = "0.5";
                            btn.style.cursor = "not-allowed";
                            btn.style.pointerEvents = "none";
                        });
                    }
                });
                scrollToBottom();
            }
        } catch { }
    }, [MESSAGES_KEY, scrollToBottom]);

    // 4e. MutationObserver — persistir cambios del DOM en sessionStorage
    useEffect(() => {
        if (!MESSAGES_KEY || !messagesRef.current) return;

        const observer = new MutationObserver(() => {
            if (!messagesRef.current || !MESSAGES_KEY) return;
            try {
                sessionStorage.setItem(MESSAGES_KEY, messagesRef.current.innerHTML);
            } catch { }
        });

        observer.observe(messagesRef.current, {
            childList: true,
            subtree: true,
            characterData: true,
        });

        return () => observer.disconnect();
    }, [MESSAGES_KEY]);

    useEffect(() => {
        if (!config) return;
        if (!didMountUnreadRef.current) {
            didMountUnreadRef.current = true;
            return;
        }
        localStorage.setItem(`chatbot_unread_${config.publicId}`, String(unreadCount));
    }, [unreadCount, config?.publicId]);

    useEffect(() => {
        if (!config) return;
        if (!didMountWelcomeRef.current) {
            didMountWelcomeRef.current = true;
            return;
        }
        sessionStorage.setItem(`chatbot_welcome_${config.publicId}`, String(welcomeVisible));
    }, [welcomeVisible, config?.publicId]);

    // 4f. Welcome message
    useEffect(() => {
        if (!config?.welcomeMessage) return;
        const isMobile = matchMedia("(max-width:480px)").matches;
        if (isMobile && config.showWelcomeOnMobile === false) return;

        const delay = (config.welcomeDelay ?? 2) * 1000;

        const handlePermission = (e: MessageEvent) => {
            if (!e.data || e.data.type !== "CHATBOT_WELCOME_PERMISSION") return;
            if (e.data.instanceId !== config.publicId) return;
            if (e.data.allowed && !isOpenRef.current) {
                setWelcomeVisible(true);
            }
        };
        window.addEventListener("message", handlePermission);

        const timer = setTimeout(() => {
            if (isOpenRef.current) return;
            window.parent.postMessage(
                { type: "CHATBOT_WELCOME_REQUEST", instanceId: config.publicId },
                "*"
            );
        }, delay);

        return () => {
            clearTimeout(timer);
            window.removeEventListener("message", handlePermission);
        };
    }, [
        config?.publicId,
        config?.welcomeMessage,
        config?.welcomeDelay,
        config?.showWelcomeOnMobile,
    ]);

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         5. CALLBACKS COMPUESTOS
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

    const configureInput = useCallback(
        (type: string) => {
            if (!inputRef.current) return;
            inputRef.current.placeholder =
                config?.inputPlaceholder ?? "Escribe tu mensaje...";
            if (type === "email") inputRef.current.placeholder = "correo@ejemplo.com";
            if (type === "phone") inputRef.current.placeholder = "Ej. +52 999 123 4567";
        },
        [config?.inputPlaceholder]
    );

    const showTyping = useCallback((): HTMLDivElement => {
        if (typingRef.current) return typingRef.current;
        const el = document.createElement("div");
        el.className = "msg bot typing";
        el.innerHTML = `
        <img src="${config?.avatar ?? ""}" class="msg-avatar" />
        <div class="msg-content">
            <div class="bubble">
                <span class="typing-dots"><span></span><span></span><span></span></span>
            </div>
        </div>`;
        messagesRef.current?.appendChild(el);
        typingRef.current = el;
        scrollToBottom();
        return el;
    }, [config?.avatar, scrollToBottom]);

    const hideTyping = useCallback(() => {
        typingRef.current?.remove();
        typingRef.current = null;
    }, []);

    const resolveTyping = useCallback(
        (html: string): HTMLDivElement => {
            const el = typingRef.current;

            if (!config?.publicId) return renderBotMessage(html);

            if (!el || !messagesRef.current?.contains(el)) {
                typingRef.current = null;
                return renderBotMessage(html);
            }

            el.classList.remove("typing");

            const bubble = el.querySelector(".bubble") as HTMLDivElement;
            const contentWrapper = el.querySelector(".msg-content") as HTMLDivElement;

            bubble.innerHTML = html;

            const timeEl = document.createElement("div");
            timeEl.className = "message-time";
            timeEl.textContent = getTime();
            contentWrapper.appendChild(timeEl);

            typingRef.current = null;
            if (!isOpenRef.current) setUnreadCount((prev) => prev + 1);
            scrollToBottom();

            // ── Persistir mensaje del bot en historial ────────────────────────
            if (config) {
                appendToSession(config.publicId, visitorIdRef.current, "bot", htmlToText(html), { html });
                setActiveSession(getActiveSession(config.publicId, visitorIdRef.current));
            }

            return bubble;
        },
        [scrollToBottom, config]
    );

    const appendMessage = useCallback(
        (from: "user" | "bot", text: string, error = false) => {
            if (!messagesRef.current) return;
            if (!config?.publicId) return;

            const m = document.createElement("div");
            m.className = `msg ${from}${error ? " error" : ""}`;

            if (from === "bot") {
                const a = document.createElement("img");
                a.src = config?.avatar ?? "";
                a.className = "msg-avatar";
                m.appendChild(a);
            }

            const c = document.createElement("div");
            c.className = "msg-content";

            const b = document.createElement("div");
            b.className = "bubble";
            b.textContent = text;

            const t = document.createElement("div");
            t.className = "message-time";
            t.textContent = getTime();

            c.append(b, t);
            m.appendChild(c);
            messagesRef.current.appendChild(m);

            if (from === "bot" && !isOpenRef.current)
                setUnreadCount((prev) => prev + 1);
            scrollToBottom();

            // ── Persistir en historial estructurado ───────────────────────────
            if (config && !error) {
                appendToSession(config.publicId, visitorIdRef.current, from, text);
                setActiveSession(getActiveSession(config.publicId, visitorIdRef.current));
            }
        },
        [config?.avatar, scrollToBottom, config]
    );

    const appendErrorWithDelay = useCallback(
        async (message: string, token: symbol) => {
            if (token !== abortRef.current) return;
            showTyping();
            await new Promise((r) => setTimeout(r, 2000));
            if (token !== abortRef.current) return;
            hideTyping();
            appendMessage("bot", message, true);
        },
        [showTyping, hideTyping, appendMessage]
    );

    const renderBotMessage = useCallback(
        (html: string): HTMLDivElement => {
            const m = document.createElement("div");
            m.className = "msg bot";
            if (!config?.publicId) return m;

            const avatarImg = document.createElement("img");
            avatarImg.src = config?.avatar ?? "";
            avatarImg.className = "msg-avatar";

            const contentWrapper = document.createElement("div");
            contentWrapper.className = "msg-content";

            const bubble = document.createElement("div");
            bubble.className = "bubble";
            bubble.innerHTML = html;

            const timeEl = document.createElement("div");
            timeEl.className = "message-time";
            timeEl.textContent = getTime();

            contentWrapper.append(bubble, timeEl);
            m.append(avatarImg, contentWrapper);
            messagesRef.current?.appendChild(m);

            if (!isOpenRef.current) setUnreadCount((prev) => prev + 1);
            scrollToBottom();

            // ── Persistir en historial estructurado ───────────────────────────
            if (config && html) {
                appendToSession(config.publicId, visitorIdRef.current, "bot", htmlToText(html), { html });
                setActiveSession(getActiveSession(config.publicId, visitorIdRef.current));
            }

            return bubble;
        },
        [config?.avatar, scrollToBottom, config]
    );

    const openImageViewer = useCallback((url: string) => {
        setViewerIsVideo(false);
        setViewerUrl(url);
        setViewerOpen(true);
    }, []);

    const openVideoViewer = useCallback((url: string) => {
        setViewerIsVideo(true);
        setViewerUrl(url);
        setViewerOpen(true);
    }, []);

    const closeViewer = useCallback(() => {
        setViewerOpen(false);
        setViewerUrl("");
    }, []);

    const renderLinkActions = useCallback(
        (actions: LinkAction[], bubble: HTMLDivElement) => {
            const container = document.createElement("div");
            container.className = "link-actions";

            actions.forEach((action) => {
                const a = document.createElement("a");
                a.className = `link-action link-${action.type}`;
                const icon = LINK_ICONS[action.type] ?? "";
                a.innerHTML = `
                <span class="link-action-icon">${icon}</span>
                <span class="link-action-label">${action.title || action.value}</span>
            `;
                a.target = "_blank";
                a.rel = "noopener noreferrer";

                switch (action.type) {
                    case "link":
                        a.href = action.value;
                        break;
                    case "email": {
                        const email = action.value.trim();
                        const chatbotName = config?.name || "Chatbot";
                        const subject = encodeURIComponent(
                            `Contacto desde chatbot: ${chatbotName}`
                        );
                        const body = encodeURIComponent(
                            `Hola,\n\nEstoy contactando desde el chatbot "${chatbotName}".\n\nQuiero más información.\n\nGracias.`
                        );
                        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                        a.href = isMobile
                            ? `mailto:${email}?subject=${subject}&body=${body}`
                            : `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${subject}&body=${body}`;
                        break;
                    }
                    case "phone":
                        a.href = `tel:${action.value}`;
                        break;
                    case "whatsapp": {
                        const phone = action.value.replace(/\D/g, "");
                        const fullPhone = phone.startsWith("52") ? phone : `52${phone}`;
                        a.href = `https://api.whatsapp.com/send?phone=${fullPhone}`;
                        break;
                    }
                    default:
                        return;
                }
                container.appendChild(a);
            });
            bubble.appendChild(container);
        },
        [config]
    );

    const renderMediaCarousel = useCallback(
        (mediaList: MediaItem[], bubbleElement: HTMLDivElement) => {
            const msgEl = bubbleElement.closest(".msg.bot");
            if (msgEl) msgEl.classList.add("media-msg");

            const wrapper = document.createElement("div");
            wrapper.className = "media-carousel-wrapper";

            const MAX_VISIBLE = 4;
            const total = mediaList.length;
            const extra = total - MAX_VISIBLE;

            const countMap: Record<number, string> = {
                1: "count-1",
                2: "count-2",
                3: "count-3",
                4: "count-4",
            };
            const grid = document.createElement("div");
            grid.className = `media-grid ${countMap[Math.min(total, 4)] ?? "count-more"}`;

            mediaList.slice(0, MAX_VISIBLE).forEach((media, index) => {
                const item = document.createElement("div");
                item.className = "media-item";

                if (index === MAX_VISIBLE - 1 && extra > 0) {
                    item.classList.add("has-more-overlay");
                    const moreEl = document.createElement("span");
                    moreEl.className = "more-overlay";
                    moreEl.textContent = `+${extra}`;
                    item.appendChild(moreEl);
                }
                if (media.type === "image") {
                    const img = document.createElement("img");
                    img.src = media.url;
                    img.loading = "lazy";
                    img.onload = () => img.classList.add("loaded");
                    img.onerror = () => img.classList.add("loaded");
                    item.onclick = () => openImageViewer(media.url);
                    item.appendChild(img);
                }

                if (media.type === "video") {
                    const video = document.createElement("video");
                    video.src = media.url;
                    video.playsInline = true;
                    video.muted = true;
                    video.preload = "metadata";

                    if (total === 1) {
                        video.controls = true;
                        item.appendChild(video);
                    } else {
                        video.controls = false;
                        item.appendChild(video);
                        const overlay = document.createElement("div");
                        overlay.className = "video-play-overlay";
                        overlay.innerHTML = `<svg viewBox="0 0 48 48" width="44" height="44"><circle cx="24" cy="24" r="24" fill="rgba(0,0,0,0.5)"/><polygon points="19,14 38,24 19,34" fill="white"/></svg>`;
                        item.style.cursor = "pointer";
                        item.onclick = () => openVideoViewer(media.url);
                        item.appendChild(overlay);
                    }
                    video.onloadeddata = () => video.classList.add("loaded");
                    video.onerror = () => video.classList.add("loaded");
                }
                grid.appendChild(item);
            });

            wrapper.appendChild(grid);
            bubbleElement.appendChild(wrapper);
            scrollToBottom();
        },
        [openImageViewer, openVideoViewer, scrollToBottom]
    );

    const renderInlineOptionsLocal = useCallback(
        (node: BundleNode, bubbleElement: HTMLDivElement, token: symbol) => {
            const list = node.node_type === "policy" ? node.policy! : node.options!;
            const engine = engineRef.current!;

            const container = document.createElement("div");
            container.className = "inline-options";
            container.dataset.active = "true";

            list.forEach((o) => {
                const btn = document.createElement("button");
                btn.textContent = o.label;
                btn.dataset.value = o.value ?? o.label;

                btn.onclick = async () => {
                    if (token !== abortRef.current) return;

                    delete container.dataset.active;
                    container
                        .querySelectorAll<HTMLButtonElement>("button")
                        .forEach((b) => {
                            b.disabled = true;
                            b.style.opacity = "0.5";
                            b.style.cursor = "not-allowed";
                            b.style.pointerEvents = "none";
                        });

                    appendMessage("user", o.label);
                    disableInput();

                    try {
                        const nextNode = engine.next(o.value ?? o.label);
                        if (nextNode) {
                            processLocalRef.current?.(nextNode, 0, token);
                            return;
                        }
                        finishConversationRef.current?.(engine, token);
                    } catch (err: any) {
                        if (err?.validation_error) {
                            appendErrorWithDelay(err.message, token);
                            enableInput();
                        }
                    }
                };
                container.appendChild(btn);
            });
            bubbleElement.appendChild(container);
        },
        [appendMessage, disableInput, enableInput]
    );

    const appendServerError = useCallback(() => {
        if (!messagesRef.current) return;
        if (errorMsgRef.current) return;

        const m = document.createElement("div");
        m.className = "msg bot error-server";

        const avatarImg = document.createElement("img");
        avatarImg.src = config?.avatar ?? "";
        avatarImg.className = "msg-avatar";

        const contentWrapper = document.createElement("div");
        contentWrapper.className = "msg-content";

        const bubble = document.createElement("div");
        bubble.className = "bubble bubble-server-error";
        bubble.innerHTML = `
        <div class="server-error-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                 stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12H3a9 9 0 1 0 3-6.7"/>
                <polyline points="3 3 3 9 9 9"/>
            </svg>
        </div>
        <p class="server-error-title">Sin conexión al servidor</p>
        <p class="server-error-sub">Intentando reconectar<span class="retry-dots"></span></p>
    `;

        const timeEl = document.createElement("div");
        timeEl.className = "message-time";
        timeEl.textContent = getTime();

        contentWrapper.append(bubble, timeEl);
        m.append(avatarImg, contentWrapper);
        messagesRef.current.appendChild(m);
        errorMsgRef.current = m;
        scrollToBottom();

        const dotsEl = bubble.querySelector(".retry-dots") as HTMLElement;
        let dotCount = 0;
        const dotsInterval = setInterval(() => {
            dotCount = (dotCount + 1) % 4;
            if (dotsEl) dotsEl.textContent = ".".repeat(dotCount);
        }, 500);

        retryIntervalRef.current = setInterval(async () => {
            try {
                clearInterval(dotsInterval);
                clearRetryInterval();
                errorMsgRef.current?.remove();
                errorMsgRef.current = null;
                if (messagesRef.current) messagesRef.current.innerHTML = "";
                setStatusText("En línea");
                setConnectionStatus("connected");

                const freshToken = Symbol("chatbot-reconnect");
                abortRef.current = freshToken;
                sendingRef.current = false;
                engineRef.current = null;

                await startRef.current?.(freshToken);
            } catch {
                // sigue esperando
            }
        }, 5000);

        return () => {
            clearInterval(dotsInterval);
        };
    }, [config, scrollToBottom, clearRetryInterval]);

    const processLocal = useCallback(
        (node: BundleNode, depth: number, token: symbol): void => {
            if (!node || depth > 50 || !config) return;
            if (token !== abortRef.current) return;

            const engine = engineRef.current;
            if (!engine) return;

            // ── Guardar estado del engine en historial persistente ────────────
            const saveState = () => {
                const state = engine.getState();
                // sessionStorage (compatibilidad existente)
                sessionStorage.setItem(
                    `chatbot_node_${config.publicId}`,
                    JSON.stringify(state)
                );
                // localStorage (persistencia entre sesiones)
                persistEngineState(config.publicId, visitorIdRef.current, state);
                setActiveSession(getActiveSession(config.publicId, visitorIdRef.current));
            };

            const runNode = async () => {
                if (token !== abortRef.current) {
                    hideTyping();
                    return;
                }

                const hasTyping = node.typing_time && node.typing_time > 0;

                if (hasTyping) {
                    showTyping();
                    scrollToBottom();
                    await new Promise((r) => setTimeout(r, node.typing_time! * 1000));
                    if (token !== abortRef.current) {
                        hideTyping();
                        return;
                    }
                }

                const pendingTyping = !hasTyping && typingRef.current !== null;

                // ── LINK ──
                if (node.node_type === "link") {
                    const bubble =
                        hasTyping || pendingTyping
                            ? resolveTyping(node.content || "")
                            : renderBotMessage(node.content || "");
                    if (node.link_actions?.length)
                        renderLinkActions(node.link_actions, bubble);
                    if (node.end_conversation) {
                        saveState();
                        disableInput();
                        completeSession(config.publicId, visitorIdRef.current);
                        finishConversationRef.current?.(engine, token);
                        return;
                    }
                    const next = engine._autoAdvanceFrom(node);
                    if (next) processLocal(next, depth + 1, token);
                    return;
                }

                // ── MEDIA ──
                if (node.node_type === "media" && Array.isArray(node.media)) {
                    if (hasTyping || pendingTyping) hideTyping();
                    const bubbleElement = (() => {
                        const b = renderBotMessage("");
                        b.classList.add("media-only");
                        b.style.minHeight = "0";
                        return b;
                    })();
                    if (node.content) {
                        const caption = document.createElement("div");
                        caption.className = "media-caption";
                        caption.textContent = node.content;
                        bubbleElement.prepend(caption);
                        bubbleElement.classList.remove("media-only");
                    }
                    renderMediaCarousel(node.media as MediaItem[], bubbleElement);
                    if (node.end_conversation) {
                        saveState();
                        disableInput();
                        completeSession(config.publicId, visitorIdRef.current);
                        finishConversationRef.current?.(engine, token);
                        return;
                    }
                    saveState();
                    disableInput();
                    await new Promise((r) => setTimeout(r, 400));
                    if (token !== abortRef.current) return;
                    const next = engine._autoAdvanceFrom(node);
                    if (next) processLocal(next, depth + 1, token);
                    return;
                }

                // ── TEXT / HTML ──
                if (node.node_type === "text" || node.node_type === "html") {
                    if (node.content) {
                        hasTyping || pendingTyping
                            ? resolveTyping(node.content)
                            : renderBotMessage(node.content);
                    } else if (hasTyping) {
                        hideTyping();
                    }
                    if (node.end_conversation) {
                        saveState();
                        disableInput();
                        completeSession(config.publicId, visitorIdRef.current);
                        finishConversationRef.current?.(engine, token);
                        return;
                    }
                    const next = engine._autoAdvanceFrom(node);
                    if (next) processLocal(next, depth + 1, token);
                    return;
                }

                // ── OPTIONS / POLICY ──
                if (
                    (node.node_type === "options" && node.options?.length) ||
                    (node.node_type === "policy" && node.policy?.length)
                ) {
                    const bubbleElement = node.content
                        ? hasTyping || pendingTyping
                            ? resolveTyping(node.content)
                            : renderBotMessage(node.content)
                        : (() => {
                            if (hasTyping || pendingTyping) hideTyping();
                            const b = renderBotMessage("");
                            b.classList.add("media-only");
                            return b;
                        })();
                    renderInlineOptionsLocal(node, bubbleElement, token);
                    saveState();
                    disableInput();
                    return;
                }

                // ── INPUT (question, email, phone, number) ──
                if (TEXT_INPUT_TYPES.includes(node.node_type || "")) {
                    if (node.content) {
                        hasTyping || pendingTyping
                            ? resolveTyping(node.content)
                            : renderBotMessage(node.content);
                    } else if (hasTyping) {
                        hideTyping();
                    }
                    configureInput(node.node_type || "question");
                    saveState();
                    enableInput();
                    return;
                }

                if (node.end_conversation) {
                    saveState();
                    disableInput();
                    completeSession(config.publicId, visitorIdRef.current);
                    finishConversationRef.current?.(engine, token);
                }
            };

            runNode();
        },
        [
            config,
            showTyping,
            hideTyping,
            resolveTyping,
            scrollToBottom,
            renderBotMessage,
            renderLinkActions,
            renderMediaCarousel,
            renderInlineOptionsLocal,
            disableInput,
            enableInput,
            configureInput,
        ]
    );

    const send = useCallback(
        async (v?: string, token?: symbol): Promise<void> => {
            if (!config || !engineRef.current) return;

            const activeToken = token ?? abortRef.current;
            if (activeToken !== abortRef.current) return;

            const text = v ?? inputRef.current?.value?.trim();
            if (!text) return;
            if (sendingRef.current) return;
            sendingRef.current = true;

            if (v === undefined) {
                appendMessage("user", text);
                if (inputRef.current) inputRef.current.value = "";
            }
            disableInput();

            try {
                const engine = engineRef.current;

                // ✅ Va directo aquí, sin fetch de validación
                const nextNode = engine.next(text);

                if (nextNode) {
                    processLocalRef.current?.(nextNode, 0, activeToken);
                    sendingRef.current = false;
                    return;
                }

                await finishConversationRef.current?.(engine, activeToken);
            } catch (err: any) {
                if (err?.validation_error) {
                    appendErrorWithDelay(err.message, activeToken);
                    configureInput(err.field || "question");
                    enableInput();
                }
            }

            sendingRef.current = false;
        },
        [config, appendMessage, disableInput, enableInput, configureInput]
    );

    const loadBundle = useCallback(
        async (token?: symbol): Promise<FlowBundle | null> => {
            if (!config) return null;
            const activeToken = token ?? abortRef.current;
            const BUNDLE_KEY = `chatbot_bundle_${config.publicId}`;
            try {
                const cached = sessionStorage.getItem(BUNDLE_KEY);
                if (cached) {
                    const bundle: FlowBundle = JSON.parse(cached);
                    bundleRef.current = bundle;
                    return bundle;
                }
            } catch {
                return null;
            }
            try {
                const r = await fetch(
                    `${config.apiBase}/api/public-chatbot/chatbot-conversation/${config.publicId}/bundle`
                );
                if (activeToken !== abortRef.current) return null;
                if (!r.ok) throw new Error("Bundle fetch failed");
                const bundle: FlowBundle = await r.json();
                const replacements: Record<string, string> = {
                    chatbot_name: bundle.chatbot_name,
                };
                bundle.nodes = bundle.nodes.map((n) => ({
                    ...n,
                    content: n.content
                        ? n.content.replace(
                            /\{\{(\w+)\}\}/g,
                            (_, key) => replacements[key] ?? `{{${key}}}`
                        )
                        : n.content,
                }));

                try {
                    sessionStorage.setItem(BUNDLE_KEY, JSON.stringify(bundle));
                } catch { }
                return bundle;
            } catch {
                return null;
            }
        },
        [config]
    );


    // ── Renderiza mensajes históricos en el DOM sin persistirlos de nuevo ─────
    // Función interna (no hook), se llama desde start()
    const _renderHistoryMessages = useCallback(
        (messages: HistoryMessage[]) => {
            if (!messagesRef.current) return;

            messages.forEach((msg) => {
                const m = document.createElement("div");
                m.className = `msg ${msg.role}`;

                if (msg.role === "bot") {
                    const a = document.createElement("img");
                    a.src = config?.avatar ?? "";
                    a.className = "msg-avatar";
                    m.appendChild(a);
                }

                const c = document.createElement("div");
                c.className = "msg-content";

                const b = document.createElement("div");
                b.className = "bubble";

                // Usar HTML enriquecido si está disponible, si no texto plano
                if (msg.html && msg.role === "bot") {
                    b.innerHTML = msg.html;
                } else {
                    b.textContent = msg.text;
                }

                const t = document.createElement("div");
                t.className = "message-time";
                t.textContent = new Date(msg.timestamp).toLocaleTimeString("es-MX", {
                    hour: "2-digit",
                    minute: "2-digit",
                });

                c.append(b, t);
                m.appendChild(c);
                messagesRef.current!.appendChild(m);
            });

            scrollToBottom();
        },
        [config?.avatar, scrollToBottom]
    );

    // ── start: detecta sesión previa y decide si restaurar o crear nueva ──────
    const start = useCallback(
        async (token?: symbol) => {
            if (!config) return;
            const activeToken = token ?? abortRef.current;

            typingRef.current = null;
            sendingRef.current = false;

            const vid = visitorIdRef.current || getVisitorId();
            visitorIdRef.current = vid;

            try {
                setStatusText("Conectando...");

                const bundle = await loadBundle(activeToken);
                if (activeToken !== abortRef.current) return;
                if (!bundle) {
                    appendServerErrorRef.current();
                    return;
                }

                showTyping();

                const engine = new ChatbotEngine(bundle);
                engineRef.current = engine;
                localStorage.removeItem(`chat_session_${config.publicId}`);
                setStatusText("En línea");
                setConnectionStatus("connected");

                // ── Detectar si hay sesión previa restaurable ─────────────────
                const resumable = hasResumableSession(config.publicId, vid);

                if (resumable) {
                    const prevSession = getActiveSession(config.publicId, vid)!;
                    hideTyping();

                    _renderHistoryMessages(prevSession.messages);

                    if (prevSession.engineState) {
                        engine.restoreState(
                            prevSession.engineState.nodeId!,
                            prevSession.engineState.variables,
                            prevSession.engineState.history
                        );
                        sessionStorage.setItem(
                            `chatbot_node_${config.publicId}`,
                            JSON.stringify(prevSession.engineState)
                        );
                    }

                    setActiveSession(prevSession);

                    const currentNode = engine.getCurrentNode();

                    if (currentNode && TEXT_INPUT_TYPES.includes(currentNode.node_type || "")) {
                        // Nodo de texto libre: habilitar input directamente
                        configureInput(currentNode.node_type || "question");
                        enableInput();
                    } else if (
                        currentNode &&
                        (
                            (currentNode.node_type === "options" && currentNode.options?.length) ||
                            (currentNode.node_type === "policy" && currentNode.policy?.length)
                        )
                    ) {
                        // Nodo de opciones: re-renderizar SOLO los botones sin duplicar el texto
                        const bubble = document.createElement("div");
                        bubble.className = "bubble media-only";

                        const msgEl = document.createElement("div");
                        msgEl.className = "msg bot";

                        const avatarImg = document.createElement("img");
                        avatarImg.src = config.avatar ?? "";
                        avatarImg.className = "msg-avatar";

                        const contentWrapper = document.createElement("div");
                        contentWrapper.className = "msg-content";
                        contentWrapper.appendChild(bubble);

                        msgEl.append(avatarImg, contentWrapper);
                        messagesRef.current?.appendChild(msgEl);
                        scrollToBottom();

                        renderInlineOptionsLocal(currentNode, bubble, activeToken);
                        disableInput();
                    } else if (!currentNode || engine.completed) {
                        disableInput();
                    } else {
                        enableInput();
                    }

                    return;
                }

                // ── Nueva sesión ──────────────────────────────────────────────
                const session = createSession(config.publicId, vid);
                setActiveSession(session);

                const firstNode = engine.start();
                if (!firstNode) {
                    hideTyping();
                    disableInput();
                    return;
                }
                processLocalRef.current?.(firstNode, 0, activeToken);
            } catch {
                if (activeToken !== abortRef.current) return;
                hideTyping();
                setStatusText("Error");
                setConnectionStatus("error");
                appendServerErrorRef.current();
            }
        },
        [
            config,
            hideTyping,
            disableInput,
            enableInput,
            loadBundle,
            showTyping,
            configureInput,
            scrollToBottom,
            renderInlineOptionsLocal,
            _renderHistoryMessages
        ]
    );

    const finishConversation = useCallback(
        async (engine: ChatbotEngine, token: symbol) => {
            if (!config) return;
            if (token !== abortRef.current) return;

            disableInput();

            // Marcar sesión como completada en historial
            completeSession(config.publicId, visitorIdRef.current);
            setActiveSession(getActiveSession(config.publicId, visitorIdRef.current));

            try {
                const { history, variables, flow_id } = engine.getPayload();

                const r = await fetch(
                    `${config.apiBase}/api/public-chatbot/chatbot-conversation/${config.publicId}/finish`,
                    {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            history,
                            variables,
                            flow_id,
                            origin_url: config.originDomain,
                            visitor_id: getVisitorId(),
                            device: getDeviceType(),
                        }),
                    }
                );

                if (token !== abortRef.current) return;

                if (r.status === 409) {
                    const body = await r.json();
                    engine.rollback();
                    appendMessage("bot", body.message, true);
                    configureInput(body.field || "question");
                    enableInput();
                    return;
                }
            } catch {
                if (token !== abortRef.current) return;
                console.error("[chatbot] finishConversation failed");
            }
        },
        [config, disableInput, appendMessage, enableInput, configureInput]
    );

    const toggle = useCallback(() => {
        if (!config) return;
        setIsOpen((prev) => {
            const next = !prev;
            isOpenRef.current = next;
            if (next) {
                setWelcomeVisible(false);
                setUnreadCount(0);
                localStorage.removeItem(`chatbot_unread_${config.publicId}`);
                sessionStorage.removeItem(`chatbot_welcome_${config.publicId}`);
                window.parent.postMessage(
                    { type: "CHATBOT_WELCOME_SEEN", instanceId: config.publicId },
                    "*"
                );
            }
            return next;
        });
    }, [config]);

    const close = useCallback(() => {
        isOpenRef.current = false;
        setIsOpen(false);
    }, []);

    // ── restart: limpia TODO (incluyendo historial activo) e inicia de cero ───
    const restart = useCallback(async () => {
        if (isRestarting) return;
        setIsRestarting(true);

        const freshToken = Symbol("chatbot-restart");
        abortRef.current = freshToken;
        sendingRef.current = false;
        clearRetryInterval();

        errorMsgRef.current?.remove();
        errorMsgRef.current = null;
        hideTyping();
        typingRef.current = null;

        if (config) {
            const vid = visitorIdRef.current || getVisitorId();
            localStorage.removeItem(`chat_session_${config.publicId}`);
            sessionStorage.removeItem(`chatbot_dom_${config.publicId}`);
            sessionStorage.removeItem(`chatbot_node_${config.publicId}`);
            sessionStorage.removeItem(`chatbot_bundle_${config.publicId}`);
            sessionStorage.removeItem(MESSAGES_KEY ?? '');
            clearActiveSession(config.publicId, vid);
            sessionStorage.setItem(`chatbot_needs_start_${config.publicId}`, "1");
        }

        if (messagesRef.current) messagesRef.current.innerHTML = "";
        if (inputRef.current) inputRef.current.value = "";
        typingRef.current = null;
        engineRef.current = null;
        setActiveSession(null);
        disableInput();
        setStatusText("Reiniciando…");

        startedRef.current = false;
        setShouldAutoStart(true);
        setTimeout(() => setIsRestarting(false), 100);

    }, [config, disableInput, clearRetryInterval, hideTyping, MESSAGES_KEY]);

    // ── Descargar historial de la sesión activa ────────────────────────────────
    const downloadHistory = useCallback(() => {
        if (!config) return;
        downloadActiveSession(
            config.publicId,
            visitorIdRef.current,
            config.name
        );
    }, [config]);

    // ── Importar historial desde un archivo JSON ───────────────────────────────
    const importHistory = useCallback(
        async (jsonString: string): Promise<boolean> => {
            if (!config) return false;
            const vid = visitorIdRef.current || getVisitorId();
            const session = importSession(config.publicId, vid, jsonString);
            if (!session) return false;

            // Reiniciar el chatbot con la sesión importada como activa
            await restart();
            return true;
        },
        [config, restart]
    );

    // ── Limpiar TODO el historial del visitante (nueva conv. desde cero) ───────
    const clearHistory = useCallback(() => {
        if (!config) return;
        const vid = visitorIdRef.current || getVisitorId();
        clearAllHistory(config.publicId, vid);
        setActiveSession(null);
    }, [config]);

    // Refs de sincronización
    useEffect(() => { loadBundleRef.current = loadBundle; }, [loadBundle]);
    useEffect(() => { startRef.current = start; }, [start]);
    useEffect(() => { finishConversationRef.current = finishConversation; }, [finishConversation]);
    useEffect(() => { processLocalRef.current = processLocal; }, [processLocal]);
    useEffect(() => { sendRef.current = send; }, [send]);
    useEffect(() => { appendServerErrorRef.current = appendServerError; }, [appendServerError]);
    useEffect(() => { appendMessageRef.current = appendMessage; }, [appendMessage]);
    useEffect(() => { disableInputRef.current = disableInput; }, [disableInput]);

    /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         6. RETURN
      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
    if (!config) {
        return {
            messagesRef,
            inputRef,
            isOpen: false,
            statusText: "",
            inputDisabled: true,
            sendDisabled: true,
            welcomeVisible: false,
            viewerOpen: false,
            viewerUrl: "",
            viewerIsVideo: false,
            toggle: () => { },
            close: () => { },
            send: async () => { },
            restart: async () => { },
            closeViewer: () => { },
            connectionStatus: "connecting" as const,
            unreadCount: 0,
            activeSession: null,
            downloadHistory: () => { },
            importHistory: async () => false,
            clearHistory: () => { },
        };
    }

    return {
        messagesRef,
        inputRef,
        isOpen,
        statusText,
        inputDisabled,
        sendDisabled,
        welcomeVisible,
        viewerOpen,
        viewerUrl,
        viewerIsVideo,
        toggle,
        close,
        send,
        restart,
        closeViewer,
        connectionStatus,
        unreadCount,
        isRestarting,
        currentNodeType: engineRef.current?.getCurrentNode()?.node_type ?? null,
        // ── Nuevas APIs de historial ──────────────────────────────────────────
        activeSession,          // ConversationSession | null — estado actual
        downloadHistory,        // () => void — descarga JSON
        importHistory,          // (json: string) => Promise<boolean>
        clearHistory,           // () => void — borra todo y reinicia
    };
}