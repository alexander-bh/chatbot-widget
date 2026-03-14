import { useEffect, useState } from "react"
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
    

    // ── 1. Cargar config ──
    useEffect(() => {
        const loadConfig = async () => {
            try {
                const params = new URLSearchParams(window.location.search)
                const encoded = params.get("config")
                if (!encoded) throw new Error("Missing config")
                const { payload: payloadString, signature } = decodeConfigParam(encoded)
                const payload = JSON.parse(payloadString)
                if (!payload.apiBase) throw new Error("apiBase ausente en payload")
                const verifiedConfig = await verifyConfig(payload.apiBase, payloadString, signature)
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

    // ── 3. useEffect del welcome DESPUÉS de useChatbot, pero ANTES de returns ──
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
    }, [chatbot.welcomeVisible, config?.welcomeMessage, config])

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

                {/* Badge de notificaciones — superior derecha */}
                {!isOpen && unreadCount > 0 && (
                    <span className="fab-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}

                {/* Dot de conexión — inferior derecha */}
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