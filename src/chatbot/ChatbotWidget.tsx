import { useEffect, useState } from "react"
import { useChatbot } from "./useChatbot"
import type { ChatbotConfig } from "./useChatbot"
import "./chatbot.css"
import { RefreshCcw, Send, X } from "lucide-react"


// Notifica al iframe padre que cambie su tamaño
const notifyResize = (open: boolean) => {
    window.parent.postMessage({ type: "CHATBOT_RESIZE", open }, "*")
}

export default function ChatbotWidget() {
    const [config, setConfig] = useState<ChatbotConfig | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const params = new URLSearchParams(window.location.search)
                const encoded = params.get("config")
                if (!encoded) throw new Error("Missing config")

                const decoded = JSON.parse(
                    new TextDecoder().decode(
                        Uint8Array.from(
                            atob(decodeURIComponent(encoded)),
                            c => c.charCodeAt(0)
                        )
                    )
                )

                const payloadString = decoded.payload
                const payload = JSON.parse(payloadString)

                const res = await fetch(`${payload.apiBase}/api/chatbot-integration/config/verify`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        payload: payloadString,
                        signature: decoded.signature
                    })
                })

                if (!res.ok) throw new Error("Firma inválida")

                const verifiedConfig = await res.json()
                setConfig(verifiedConfig)

            } catch (err) {
                console.error(err)
                setError("No se pudo cargar el chatbot")
            }
        }

        loadConfig()
    }, [])

    const chatbot = useChatbot(config)

    if (error) return null
    if (!config) return null

    const {
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
    } = chatbot

    const hasAvatar = Boolean(config.avatar)

    const handleToggle = () => {
        const next = !isOpen
        notifyResize(next)
        toggle()
    }

    const handleClose = () => {
        notifyResize(false)
        close()
    }

    return (
        <>
            {welcomeVisible && (
                <div className="chat-welcome show">
                    <span className="welcome-text">{config.welcomeMessage}</span>
                </div>
            )}

            {/* FAB */}
            <button
                className={`chat-fab${isOpen ? " active" : ""}`}
                onClick={handleToggle}
                aria-label="Abrir chat"
            >
                {hasAvatar
                    ? <img className="chat-avatar-fab" src={config.avatar} alt={config.name} />
                    : <span className="chat-avatar-fab-fallback">{config.name?.charAt(0) ?? "C"}</span>
                }
            </button>

            {/* Widget */}
            <div className={`chat-widget${isOpen ? " open" : ""}`}>
                <div className="chat">

                    {/* Header */}
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

                    {/* Messages */}
                    <main ref={messagesRef} />

                    {/* Footer — input + send */}
                    <footer>
                        <input
                            id="messageInput"
                            ref={inputRef}
                            type="text"
                            autoComplete="off"
                            placeholder={config.inputPlaceholder ?? "Escribe tu mensaje..."}
                            disabled={inputDisabled}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault()
                                    send()
                                }
                            }}
                        />
                        <button id="sendBtn" onClick={() => send()} disabled={sendDisabled} aria-label="Enviar">
                            <Send size={18} strokeWidth={2} />
                        </button>
                    </footer>

                </div>
            </div>

            {/* Image/Video viewer */}
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