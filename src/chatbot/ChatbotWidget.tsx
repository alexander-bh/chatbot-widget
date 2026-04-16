import { useEffect, useRef, useState } from "react"
import { useChatbot } from "./useChatbot"
import type { ChatbotConfig } from "./useChatbot"
import "./chatbot.css"
import { RefreshCcw, Send, X } from "lucide-react"

const makeNotifyResize = (publicId: string) => (open: boolean) => {
    window.parent.postMessage({ type: "CHATBOT_RESIZE", open, instanceId: publicId }, "*")
}

const makeNotifyWelcome = (publicId: string) => (visible: boolean, message: string) => {
    window.parent.postMessage({ type: "CHATBOT_WELCOME", visible, message, instanceId: publicId }, "*")
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
    const verifyCalledRef = useRef(false)


    // ── Refs para notificadores ──
    const notifyWelcomeRef = useRef<(visible: boolean, message: string) => void>(() => { })
    const notifyResizeRef = useRef<(open: boolean) => void>(() => { })

    // Actualizar notificadores cuando llega config
    useEffect(() => {
        if (!config?.publicId) return
        notifyWelcomeRef.current = makeNotifyWelcome(config.publicId)
        notifyResizeRef.current = makeNotifyResize(config.publicId)
    }, [config?.publicId])

    // ── FAB freeze/unfreeze ──
    useEffect(() => {
        if (!config?.publicId) return
        const pid = config.publicId
        const handler = (e: MessageEvent) => {
            if (e.data?.instanceId && e.data.instanceId !== pid) return
            if (e.data?.type === "CHATBOT_FAB_FREEZE") {
                document.querySelector('.chat-fab')?.classList.add('no-transition')
            }
            if (e.data?.type === "CHATBOT_FAB_UNFREEZE") {
                document.querySelector('.chat-fab')?.classList.remove('no-transition')
            }
        }
        window.addEventListener("message", handler)
        return () => window.removeEventListener("message", handler)
    }, [config?.publicId])

    // ── 1. Cargar config ──
    useEffect(() => {
        if (verifyCalledRef.current) return
        verifyCalledRef.current = true
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

    useEffect(() => {
        if (!config?.publicId) return
        window.parent.postMessage({
            type: "CHATBOT_UNREAD",
            count: chatbot.unreadCount,
            instanceId: config.publicId
        }, "*")
    }, [chatbot.unreadCount, config?.publicId])

    // ── 3. Welcome effect ──
    useEffect(() => {
        if (!config?.welcomeMessage) return
        if (chatbot.welcomeVisible) {
            const t = setTimeout(() => {
                notifyWelcomeRef.current(true, config.welcomeMessage ?? "")
            }, 100)
            return () => clearTimeout(t)
        } else {
            notifyWelcomeRef.current(false, "")
        }
    }, [chatbot.welcomeVisible, config?.welcomeMessage])

    const scrollToBottom = (smooth = false) => {
        const el = chatbot.messagesRef?.current
        if (!el) return
        el.scrollTop = el.scrollHeight
        const last = el.querySelector(".msg:last-child")
        if (last) {
            last.scrollIntoView({ block: "end", behavior: smooth ? "smooth" : "instant" })
        }
    }

    const isOpenRef = useRef(false)
    useEffect(() => { isOpenRef.current = chatbot.isOpen }, [chatbot.isOpen])

    // ── Viewport y resize ──
    useEffect(() => {
        const handleViewport = () => {
            if (!isOpenRef.current) return
            setTimeout(() => scrollToBottom(false), 80)
            setTimeout(() => scrollToBottom(false), 250)
        }

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", handleViewport)
        }

        const handleResize = () => {
            if (isOpenRef.current) scrollToBottom(false)
        }
        window.addEventListener("resize", handleResize)

        return () => {
            if (window.visualViewport) {
                window.visualViewport.removeEventListener("resize", handleViewport)
            }
            window.removeEventListener("resize", handleResize)
        }
    }, [])

    // ── CHATBOT_SCROLL_BOTTOM ──
    useEffect(() => {
        if (!config?.publicId) return
        const pid = config.publicId
        const handleMessage = (e: MessageEvent) => {
            if (e.data?.instanceId && e.data.instanceId !== pid) return
            if (e.data?.type === "CHATBOT_SCROLL_BOTTOM") {
                setTimeout(() => scrollToBottom(false), 80)
                setTimeout(() => scrollToBottom(false), 200)
            }
        }
        window.addEventListener("message", handleMessage)
        return () => window.removeEventListener("message", handleMessage)
    }, [config?.publicId])

    // ── NEW: CHATBOT_FORCE_CLOSE — cerrar este widget cuando otra instancia se abre ──
    useEffect(() => {
        if (!config?.publicId) return
        const pid = config.publicId
        const handler = (e: MessageEvent) => {
            if (e.data?.instanceId && e.data.instanceId !== pid) return
            if (e.data?.type !== "CHATBOT_FORCE_CLOSE") return

            // Solo actuar si el chat está abierto
            if (!chatbot.isOpen) return

            // Cerrar sin notificar al host (el host ya actualizó el iframe)
            chatbot.close()

            // Ocultar welcome bubble si estaba visible
            notifyWelcomeRef.current(false, "")
        }
        window.addEventListener("message", handler)
        return () => window.removeEventListener("message", handler)
    }, [config?.publicId, chatbot.isOpen, chatbot.close])

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
        isRestarting
    } = chatbot

    const hasAvatar = Boolean(config.avatar)

    const handleToggle = () => { notifyResizeRef.current(!isOpen); toggle() }
    const handleClose = () => { notifyResizeRef.current(false); close() }

    const handleInputFocus = () => {
        setTimeout(() => scrollToBottom(false), 100)
        setTimeout(() => scrollToBottom(false), 300)
        setTimeout(() => scrollToBottom(false), 500)
    }

    const resetTextarea = () => {
        const el = inputRef.current
        if (!el) return
        el.style.height = "auto"
        el.classList.remove("expanded")
    }

    return (
        <>
            <div style={loading || !config ? { visibility: "hidden", pointerEvents: "none" } : undefined}>
                <button
                    className={`chat-fab${isOpen ? " active" : ""}`}
                    onClick={handleToggle}
                    aria-label="Abrir chat"
                >
                    {hasAvatar
                        ? <img className="chat-avatar-fab" src={config.avatar} alt={config.name} />
                        : <span className="chat-avatar-fab-fallback">{config.name?.charAt(0) ?? "C"}</span>
                    }
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
                                <button
                                    className="chat-restart"
                                    onClick={restart}
                                    disabled={isRestarting}
                                    aria-label="Reiniciar conversación"
                                    style={isRestarting ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                                >
                                    <RefreshCcw
                                        size={18}
                                        strokeWidth={2}
                                        style={isRestarting ? { animation: "spin 1s linear infinite" } : undefined}
                                    />
                                </button>
                                <button className="chat-close" onClick={handleClose} aria-label="Cerrar chat">
                                    <X size={18} strokeWidth={2} />
                                </button>
                            </div>
                        </header>

                        <main ref={messagesRef} />

                        <footer>
                            <div className="input-row">
                                <textarea
                                    id="messageInput"
                                    ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                                    rows={1}
                                    autoComplete="off"
                                    placeholder={config.inputPlaceholder ?? "Escribe tu mensaje..."}
                                    disabled={inputDisabled}
                                    onFocus={handleInputFocus}
                                    onInput={(e) => {
                                        const el = e.currentTarget
                                        el.style.height = "auto"
                                        el.style.height = Math.min(el.scrollHeight, 120) + "px"
                                        if (el.scrollHeight > 48) {
                                            el.classList.add("expanded")
                                        } else {
                                            el.classList.remove("expanded")
                                        }
                                        if (!el.value) {
                                            el.style.height = "auto"
                                            el.classList.remove("expanded")
                                        }
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                            e.preventDefault()
                                            send()
                                            setTimeout(resetTextarea, 0)
                                        }
                                    }}
                                />
                                <button id="sendBtn" onClick={() => { send(); setTimeout(resetTextarea, 0) }} disabled={sendDisabled} aria-label="Enviar">
                                    <Send size={18} strokeWidth={2} />
                                </button>
                            </div>
                        </footer>

                        <div className="chat-branding">
                            Creado con <strong>Weblab</strong>
                        </div>
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
            </div>
        </>
    )
}