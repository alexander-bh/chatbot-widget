import { useEffect, useRef, useState } from "react"
import { useChatbot } from "./useChatbot"
import type { ChatbotConfig } from "./useChatbot"
import "./chatbot.css"
import { RefreshCcw, Send, X } from "lucide-react"

const notifyResize = (open: boolean) => {
    window.parent.postMessage({ type: "CHATBOT_RESIZE", open }, "*")
}

const notifyWelcome = (visible: boolean, message: string) => {
    window.parent.postMessage({ type: "CHATBOT_WELCOME", visible, message }, "*")
}

function decodeConfigParam(encoded: string): { payload: string; signature: string } {
    const json = new TextDecoder().decode(
        Uint8Array.from(atob(decodeURIComponent(encoded)), c => c.charCodeAt(0))
    )
    const decoded = JSON.parse(json)
    if (!decoded.payload || !decoded.signature) throw new Error("Config malformada")
    return decoded
}

async function verifyConfig(apiBase: string, payload: string, signature: string): Promise<ChatbotConfig> {
    const res = await fetch(`${apiBase}/api/chatbot-integration/config/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ payload, signature })
    })
    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const reason = body?.error ?? res.statusText
        if (res.status === 403) throw new Error(`AUTH_FAILED: ${reason}`)
        if (res.status === 400) throw new Error(`BAD_REQUEST: ${reason}`)
        throw new Error(`SERVER_ERROR: ${reason}`)
    }
    return res.json()
}

type ErrorKind = "auth" | "expired" | "network" | "unknown"

function classifyError(err: unknown): ErrorKind {
    if (!(err instanceof Error)) return "unknown"
    if (err.message.startsWith("AUTH_FAILED")) {
        if (err.message.includes("expirada") || err.message.includes("Nonce")) return "expired"
        return "auth"
    }
    if (err.message === "Failed to fetch" || err.message.includes("NetworkError")) return "network"
    return "unknown"
}

export default function ChatbotWidget() {
    const [config, setConfig] = useState<ChatbotConfig | null>(null)
    const [error, setError] = useState<ErrorKind | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const handler = (e: MessageEvent) => {
            if (e.data?.type === "CHATBOT_FAB_FREEZE") {
                document.querySelector('.chat-fab')?.classList.add('no-transition');
            }
            if (e.data?.type === "CHATBOT_FAB_UNFREEZE") {
                document.querySelector('.chat-fab')?.classList.remove('no-transition');
            }
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
    }, []);

    // ── 1. Cargar config ──
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const params = new URLSearchParams(window.location.search)
                const encoded = params.get("config")
                if (!encoded) throw new Error("Missing config")

                const { payload: payloadString, signature } = decodeConfigParam(encoded)

                const apiBase = import.meta.env.VITE_API_BASE_URL
                if (!apiBase) throw new Error("VITE_API_BASE_URL no configurado")

                const verifiedConfig = await verifyConfig(apiBase, payloadString, signature)
                setConfig(verifiedConfig)
            } catch (err) {
                console.error("[ChatbotWidget] loadConfig:", err)
                setError(classifyError(err))
            } finally {
                setLoading(false)
            }
        }
        loadConfig()
    }, [])

    // ── 2. useChatbot ANTES de cualquier return condicional ──
    const chatbot = useChatbot(config)

    // ── 3. useEffect del welcome ──
    useEffect(() => {
        if (!config?.welcomeMessage) return
        if (chatbot.welcomeVisible) {
            const t = setTimeout(() => {
                notifyWelcome(true, config.welcomeMessage ?? "")
            }, 100)
            return () => clearTimeout(t)
        } else {
            notifyWelcome(false, "")
        }
    }, [chatbot.welcomeVisible, config?.welcomeMessage])

    // ─────────────────────────────────────────────────────────────
    // FIX TECLADO VIRTUAL — scroll al último mensaje cuando
    // el teclado sube en Android/iOS
    //
    // La animación de apertura/cierre en móvil la maneja el CSS
    // (translateY con curva spring). Este hook solo gestiona
    // el scroll al último mensaje cuando el teclado aparece.
    // ─────────────────────────────────────────────────────────────
    const scrollToBottom = (smooth = false) => {
        const el = chatbot.messagesRef?.current
        if (!el) return
        // Intento 1: scrollTop directo (más fiable en Android Chrome)
        el.scrollTop = el.scrollHeight
        // Intento 2: scrollIntoView en el último mensaje (más fiable en iOS)
        const last = el.querySelector(".msg:last-child")
        if (last) {
            last.scrollIntoView({ block: "end", behavior: smooth ? "smooth" : "instant" })
        }
    }

    // Ref para saber si el chat está abierto dentro de listeners de viewport
    const isOpenRef = useRef(false)
    useEffect(() => { isOpenRef.current = chatbot.isOpen }, [chatbot.isOpen])

    useEffect(() => {
        // ── A. visualViewport (iOS Safari + Android) ──
        // Se dispara cuando el teclado sube/baja con altura precisa
        const handleViewport = () => {
            if (!isOpenRef.current) return
            // Delays escalonados: el teclado tarda ~300ms en asentarse
            setTimeout(() => scrollToBottom(false), 80)
            setTimeout(() => scrollToBottom(false), 250)
        }

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", handleViewport)
        }

        // ── B. window resize (Android Chrome redimensiona el viewport) ──
        const handleResize = () => {
            if (isOpenRef.current) scrollToBottom(false)
        }
        window.addEventListener("resize", handleResize)

        // ── C. Escuchar CHATBOT_SCROLL_BOTTOM del parent (install script) ──
        const handleMessage = (e: MessageEvent) => {
            if (e.data?.type === "CHATBOT_SCROLL_BOTTOM") {
                setTimeout(() => scrollToBottom(false), 80)
                setTimeout(() => scrollToBottom(false), 200)
            }
        }
        window.addEventListener("message", handleMessage)

        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener("resize", handleViewport)
            }
            window.removeEventListener("resize", handleResize)
            window.removeEventListener("message", handleMessage)
        }
    }, []) // solo mount/unmount — scrollToBottom usa ref, no stale closure

    // ── D. Scroll cuando el input recibe focus (teclado abre) ──
    // Se hace con onFocus directamente en el JSX del <input> (ver abajo)

    // ── Returns condicionales SIEMPRE al final, tras todos los hooks ──
    if (loading) return null

    if (error) {
        if (import.meta.env.DEV) {
            return (
                <div style={{
                    position: "fixed", bottom: 16, right: 16,
                    background: "#190F0F", border: "1px solid #ef4444",
                    borderRadius: 8, padding: "8px 12px",
                    fontSize: 12, color: "#991b1b", maxWidth: 280
                }}>
                    <strong>Chatbot error ({error})</strong><br />
                    {error === "expired" && "La sesión expiró. Recarga la página."}
                    {error === "auth" && "Dominio no autorizado o firma inválida."}
                    {error === "network" && "No se pudo conectar con el servidor."}
                    {error === "unknown" && "Error desconocido. Revisa la consola."}
                </div>
            )
        }
        return null
    }

    if (!config) return null

    const {
        messagesRef, inputRef, isOpen, statusText,
        inputDisabled, sendDisabled,
        viewerOpen, viewerUrl, viewerIsVideo,
        toggle, close, send, restart, closeViewer,
        connectionStatus,
        unreadCount,
    } = chatbot

    const hasAvatar = Boolean(config.avatar)

    const handleToggle = () => { notifyResize(!isOpen); toggle() }
    const handleClose = () => { notifyResize(false); close() }



    // ── D. Handler de focus del input ──
    // Cuando el teclado aparece, hacemos scroll con delays escalonados
    const handleInputFocus = () => {
        setTimeout(() => scrollToBottom(false), 100)
        setTimeout(() => scrollToBottom(false), 300)
        setTimeout(() => scrollToBottom(false), 500)
    }

    return (
        <>
            <button
                className={`chat-fab${isOpen ? " active" : ""}`}
                onClick={handleToggle}
                aria-label="Abrir chat"
            >
                {hasAvatar
                    ? <img className="chat-avatar-fab" src={config.avatar} alt={config.name} />
                    : <span className="chat-avatar-fab-fallback">{config.name?.charAt(0) ?? "C"}</span>
                }
                {!isOpen && unreadCount > 0 && (
                    <span className="fab-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
                {!isOpen && (
                    <span className={`fab-connection-dot ${connectionStatus}`} />
                )}
            </button>

            <div className={`chat-widget${isOpen ? " open" : ""}`}>
                <div className="chat">
                    <header className="chat-header">
                        {hasAvatar
                            ? <img className="chat-avatar" src={config.avatar} alt={config.name} />
                            : <span className="chat-avatar-fallback">{config.name?.charAt(0) ?? "C"}</span>
                        }
                        <div className="chat-header-info">
                            <strong>{config.name}</strong>
                            <div className="chat-status">{statusText}</div>
                        </div>
                        <div className="chat-actions">
                            <button className="chat-restart" onClick={restart} aria-label="Reiniciar conversación">
                                <RefreshCcw size={18} strokeWidth={2} />
                            </button>
                            <button className="chat-close" onClick={handleClose} aria-label="Cerrar chat">
                                <X size={18} strokeWidth={2} />
                            </button>
                        </div>
                    </header>

                    <main ref={messagesRef} />

                    <footer>
                        <input
                            id="messageInput"
                            ref={inputRef}
                            type="text"
                            autoComplete="off"
                            placeholder={config.inputPlaceholder ?? "Escribe tu mensaje..."}
                            disabled={inputDisabled}
                            // ── FIX: scroll al último msg cuando el teclado abre ──
                            onFocus={handleInputFocus}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() }
                            }}
                        />
                        <button id="sendBtn" onClick={() => send()} disabled={sendDisabled} aria-label="Enviar">
                            <Send size={18} strokeWidth={2} />
                        </button>
                    </footer>
                </div>
            </div>

            <div
                className={`chat-image-viewer${viewerOpen ? " open" : ""}`}
                onClick={(e) => { if (e.target === e.currentTarget) closeViewer() }}
            >
                <span className="viewer-close" onClick={closeViewer}>✕</span>
                {viewerIsVideo
                    ? <video className="viewer-video" src={viewerUrl} controls playsInline autoPlay />
                    : <img className="viewer-img" src={viewerUrl || undefined} alt="preview" />
                }
            </div>
        </>
    )
}